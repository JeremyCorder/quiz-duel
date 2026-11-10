"use strict";
// Quiz Duel: a locked-down window that only shows the Quiz Duel website.
const { app, BrowserWindow, ipcMain, session, screen, clipboard, Menu, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const apps = require("./apps");

// ---------------------------------------------------------------- settings
let CONFIG = { siteUrl: "https://quizduelsite.netlify.app/" };
try { Object.assign(CONFIG, JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"))); } catch (e) { /* defaults */ }
if (process.env.QUIZDUEL_SITE) CONFIG.siteUrl = process.env.QUIZDUEL_SITE;          // for testing
const SITE = new URL(CONFIG.siteUrl);
// Everything the quiz page needs. Nothing else can load in the app.
const BASE_ALLOWED = new Set([SITE.origin, "wss://broker.hivemq.com:8884", "wss://broker.emqx.io:8084", "https://api.dictionaryapi.dev"]);
if (process.env.QUIZDUEL_EXTRA_ORIGINS) process.env.QUIZDUEL_EXTRA_ORIGINS.split(",").forEach((o) => BASE_ALLOWED.add(o.trim()));
let refOrigins = new Set();
const PROTOCOL = "quizduel";

let win = null, locked = false, quitting = false, appLevel = 0, watcher = null, clipTimer = null, pendingLink = null;

// ---------------------------------------------------------------- links like quizduel://join?code=ABC123
function linkToUrl(link) {
  const u = new URL(CONFIG.siteUrl);
  u.searchParams.set("app", "1");
  try {
    const l = new URL(link);
    const code = (l.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length === 6) u.searchParams.set("code", code);
    const name = (l.searchParams.get("name") || "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 30);
    const email = (l.searchParams.get("email") || "").replace(/[^\w.+@-]/g, "").slice(0, 80);
    if (name) u.searchParams.set("name", name);
    if (email) u.searchParams.set("email", email);
  } catch (e) { /* plain start */ }
  return u.href;
}
const linkFromArgv = (argv) => argv.find((a) => typeof a === "string" && a.toLowerCase().startsWith(PROTOCOL + "://"));

// ---------------------------------------------------------------- the one window
function allowedUrl(url) {
  try {
    const u = new URL(url);
    if (["data:", "blob:", "about:", "devtools:", "chrome-error:"].includes(u.protocol)) return u.protocol !== "devtools:";
    if (u.protocol === "file:") return u.pathname.endsWith("/offline.html");
    return BASE_ALLOWED.has(u.origin) || refOrigins.has(u.origin);
  } catch (e) { return false; }
}

function createWindow(startUrl) {
  win = new BrowserWindow({
    title: "Quiz Duel", show: false, backgroundColor: "#10143f",
    kiosk: true, fullscreen: true, alwaysOnTop: true, frame: false, autoHideMenuBar: true,
    minimizable: false, maximizable: false, resizable: false, skipTaskbar: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !!process.env.QUIZDUEL_DEVTOOLS, spellcheck: true },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setContentProtection(true);                 // screenshots and screen sharing show a black window
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: "deny" }));          // no new windows
  wc.on("will-navigate", (e, url) => { if (!allowedUrl(url) || new URL(url).origin !== SITE.origin) e.preventDefault(); });
  wc.on("will-redirect", (e, url) => { if (!allowedUrl(url)) e.preventDefault(); });
  wc.on("did-fail-load", (e, code, desc, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html"), { query: { back: startUrl } }); });
  // keyboard shortcuts that would reload, print, open tools or close the window
  wc.on("before-input-event", (e, input) => {
    const k = (input.key || "").toLowerCase(), mod = input.control || input.meta;
    if (k === "f5" || k === "f12" || k === "f11" || k === "f1" ||
        (mod && ["r", "w", "n", "t", "p", "s", "o", "q", "h", "m", "j", "u", "l", "d", "f", "g"].includes(k)) ||
        (mod && input.shift && ["i", "c", "j", "delete"].includes(k)) || (input.alt && k === "f4") || (input.alt && (k === "arrowleft" || k === "arrowright"))) e.preventDefault();
  });
  // spelling suggestions (the page decides which boxes have spell check)
  wc.on("context-menu", (e, p) => {
    if (!p.misspelledWord || !p.dictionarySuggestions.length) return;
    Menu.buildFromTemplate(p.dictionarySuggestions.slice(0, 6).map((s) => ({ label: s, click: () => wc.replaceMisspelling(s) }))).popup();
  });
  wc.on("render-process-gone", () => { if (!quitting) wc.reload(); });

  win.on("close", (e) => { if (!quitting) e.preventDefault(); });   // Alt+F4 and the like
  win.on("blur", () => {
    if (!locked || quitting) return;
    send("left");                                                   // the page reports it to the teacher
    setTimeout(() => { if (win && !quitting) { win.setAlwaysOnTop(true, "screen-saver"); win.show(); win.focus(); win.moveTop(); } }, 60);
  });
  win.once("ready-to-show", () => { win.show(); win.focus(); });
  win.loadURL(startUrl);
}
const send = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send("quizduel", { type, data }); };

// ---------------------------------------------------------------- lock: watch other programs, screens and the clipboard
async function sweep() {
  if (!locked) return;
  const closed = await apps.close(appLevel);
  if (closed.length) send("apps-closed", closed);
}
function setLocked(on, opts) {
  locked = !!on;
  appLevel = Math.max(0, Math.min(2, +(opts && opts.level) || 0));
  clearInterval(watcher); clearInterval(clipTimer);
  if (locked) {
    clipboard.clear();
    watcher = setInterval(sweep, 4000);
    clipTimer = setInterval(() => clipboard.clear(), 3000);
    send("displays", screen.getAllDisplays().length);
  }
}

// ---------------------------------------------------------------- messages from the quiz page
function fromSite(e) {
  try { return new URL(e.senderFrame.url).origin === SITE.origin; } catch (er) { return false; }
}
ipcMain.handle("qd:info", (e) => ({ version: app.getVersion(), platform: process.platform, displays: screen.getAllDisplays().length }));
ipcMain.handle("qd:lock", (e, on, opts) => { if (fromSite(e)) setLocked(on, opts); return locked; });
ipcMain.handle("qd:apps", async (e, level) => fromSite(e) ? (await apps.find(+level || 0)).map((a) => a.name) : []);
ipcMain.handle("qd:close-apps", async (e, level) => fromSite(e) ? apps.close(+level || 0) : []);
ipcMain.handle("qd:refs", (e, origins) => {
  if (!fromSite(e)) return false;
  refOrigins = new Set((Array.isArray(origins) ? origins : []).slice(0, 5).filter((o) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o) || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)));
  return true;
});
ipcMain.handle("qd:quit", (e) => { if (fromSite(e) || e.senderFrame.url.startsWith("file:")) { quitting = true; setLocked(false); app.quit(); } return true; });
ipcMain.handle("qd:retry", (e, url) => { if (win) win.loadURL(url && allowedUrl(url) ? url : linkToUrl("")); return true; });

// ---------------------------------------------------------------- start
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.setAsDefaultProtocolClient(PROTOCOL);
  app.on("second-instance", (e, argv) => {
    const link = linkFromArgv(argv);
    if (win) { if (link && !locked) win.loadURL(linkToUrl(link)); win.show(); win.focus(); }
  });
  app.on("open-url", (e, link) => {                                 // macOS
    e.preventDefault();
    if (win) { if (!locked) win.loadURL(linkToUrl(link)); } else pendingLink = link;
  });
  app.on("before-quit", (e) => { if (!quitting && locked) e.preventDefault(); else quitting = true; });
  app.on("window-all-closed", () => app.quit());

  app.whenReady().then(() => {
    Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ label: "Quiz Duel", submenu: [] },
      { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { role: "selectAll" }] }]) : null);
    const ses = session.defaultSession;
    ses.setSpellCheckerLanguages && process.platform !== "darwin" && ses.setSpellCheckerLanguages(["en-US"]);
    ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission === "clipboard-sanitized-write" || permission === "fullscreen"));
    ses.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !allowedUrl(details.url) }));
    ses.on("will-download", (e) => e.preventDefault());
    screen.on("display-added", () => send("displays", screen.getAllDisplays().length));
    screen.on("display-removed", () => send("displays", screen.getAllDisplays().length));
    createWindow(linkToUrl(pendingLink || linkFromArgv(process.argv) || ""));
  });
}
