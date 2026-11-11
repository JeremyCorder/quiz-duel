"use strict";
// Quiz Duel: a locked-down window that only shows the Quiz Duel website.
const { app, BrowserWindow, ipcMain, session, screen, clipboard, Menu, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const apps = require("./apps");
const winlock = require("./winlock");

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

let win = null, locked = false, quitting = false, appLevel = 0, appGames = false, watcher = null, clipTimer = null, pendingLink = null;

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
    // focus sessions: quizduel://focus?focus=CODE (teacher's rules) or ?mine=25-5-4-3-60-G (own times)
    const focus = (l.searchParams.get("focus") || "").toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 30);
    const mine = (l.searchParams.get("mine") || "").toUpperCase().replace(/[^0-9G-]/g, "").slice(0, 30);
    if (focus) u.searchParams.set("focus", focus);
    if (mine) u.searchParams.set("mine", mine);
  } catch (e) { /* plain start */ }
  return u.href;
}
const linkFromArgv = (argv) => argv.find((a) => typeof a === "string" && a.toLowerCase().startsWith(PROTOCOL + "://"));

// ---------------------------------------------------------------- the one window
function allowedUrl(url) {
  try {
    const u = new URL(url);
    if (["data:", "blob:", "about:", "devtools:", "chrome-error:"].includes(u.protocol)) return u.protocol !== "devtools:";
    if (u.protocol === "file:") return u.pathname.endsWith("/offline.html") || u.pathname.endsWith("/loading.html");
    return BASE_ALLOWED.has(u.origin) || refOrigins.has(u.origin);
  } catch (e) { return false; }
}

function createWindow(startUrl) {
  // Full screen over the whole main display. (On Windows, "resizable: false" or "maximizable: false" stops full
  // screen from working, so the window is sized to the screen and forced back to full screen if anything shrinks it.)
  const b = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    title: "Quiz Duel", show: true, backgroundColor: "#10143f",
    x: b.x, y: b.y, width: b.width, height: b.height,
    kiosk: true, fullscreen: true, alwaysOnTop: true, frame: false, autoHideMenuBar: true, skipTaskbar: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !!process.env.QUIZDUEL_DEVTOOLS, spellcheck: true },
  });
  win.setContentProtection(true);                 // screenshots and screen sharing show a black window
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  goFull();
  setTimeout(goFull, 300); setTimeout(goFull, 1500);
  win.on("leave-full-screen", () => setTimeout(goFull, 50));
  win.on("minimize", () => { win.restore(); setTimeout(goFull, 50); });
  win.on("unmaximize", () => setTimeout(goFull, 50));
  win.on("resized", () => setTimeout(goFull, 50));
  win.on("moved", () => setTimeout(goFull, 50));

  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: "deny" }));          // no new windows
  wc.on("will-navigate", (e, url) => { if (!allowedUrl(url) || new URL(url).origin !== SITE.origin) e.preventDefault(); });
  wc.on("will-redirect", (e, url) => { if (!allowedUrl(url)) e.preventDefault(); });
  wc.on("did-fail-load", (e, code, desc, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html"), { query: { back: startUrl } }); });
  // keyboard shortcuts that would reload, print, open tools or close the window
  wc.on("before-input-event", (e, input) => {
    const k = (input.key || "").toLowerCase(), mod = input.control || input.meta;
    if (k === "f5" || k === "f12" || k === "f11" || k === "f1" ||
        (mod && !input.shift && ["r", "w", "n", "t", "p", "s", "o", "q", "h", "m", "j", "l", "d", "f", "g"].includes(k)) || (mod && input.shift && ["n", "t", "w", "q"].includes(k)) ||
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
    if (quitting) return;
    if (locked) send("left");                                       // during a quiz the page reports it to the teacher
    setTimeout(() => { if (win && !quitting) { goFull(); win.focus(); win.moveTop(); } }, 60);
  });
  // show a "Starting..." screen at once, then load the quiz website behind it (it stays up until the site arrives)
  win.focus();
  win.loadFile(path.join(__dirname, "loading.html")).catch(() => {}).then(() => loadSite(startUrl));
}
// open the quiz website; if it hasn't arrived after 30 seconds, show the "can't reach" page
let loadTimer = null;
function loadSite(url) {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { if (win && !win.isDestroyed() && win.webContents.isLoadingMainFrame()) win.loadFile(path.join(__dirname, "offline.html"), { query: { back: url } }); }, 30000);
  win.webContents.once("did-finish-load", () => clearTimeout(loadTimer));
  win.loadURL(url).catch(() => {});
}
// make the window cover the whole main screen, stay in kiosk mode and stay on top
function goFull() {
  if (!win || win.isDestroyed() || quitting) return;
  const b = screen.getPrimaryDisplay().bounds, cur = win.getBounds();
  if (!win.isFullScreen() || cur.width < b.width || cur.height < b.height) win.setBounds(b);
  if (!win.isKiosk()) win.setKiosk(true);
  if (!win.isFullScreen()) win.setFullScreen(true);
  win.setAlwaysOnTop(true, "screen-saver");
  if (win.isMinimized()) win.restore();
  win.show();
}
const send = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send("quizduel", { type, data }); };

// ---------------------------------------------------------------- lock: watch other programs, screens and the clipboard
async function sweep() {
  if (!locked) return;
  const closed = await apps.close(appLevel, appGames);
  if (closed.length) send("apps-closed", closed);
}
function setLocked(on, opts) {
  locked = !!on;
  appLevel = Math.max(0, Math.min(2, +(opts && opts.level) || 0));
  appGames = !!(opts && opts.games);
  clearInterval(watcher); clearInterval(clipTimer);
  // the Windows settings (Ctrl+Alt+Del menu, touchpad swipes) are for High security only
  if (locked && !(opts && opts.strict === false)) winlock.lock(); else winlock.unlock();
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
ipcMain.handle("qd:apps", async (e, level, games) => fromSite(e) ? (await apps.find(+level || 0, !!games)).map((a) => a.name) : []);
ipcMain.handle("qd:close-apps", async (e, level, games) => fromSite(e) ? apps.close(+level || 0, !!games) : []);
ipcMain.handle("qd:refs", (e, origins) => {
  if (!fromSite(e)) return false;
  refOrigins = new Set((Array.isArray(origins) ? origins : []).slice(0, 5).filter((o) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o) || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)));
  return true;
});
ipcMain.handle("qd:quit", (e) => { if (fromSite(e) || e.senderFrame.url.startsWith("file:")) { quitting = true; setLocked(false); app.quit(); } return true; });
ipcMain.handle("qd:retry", (e, url) => { if (win) loadSite(url && allowedUrl(url) ? url : linkToUrl("")); return true; });

// ---------------------------------------------------------------- start
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.setAsDefaultProtocolClient(PROTOCOL);
  app.on("second-instance", (e, argv) => {
    const link = linkFromArgv(argv);
    if (win) { if (link && !locked) loadSite(linkToUrl(link)); goFull(); win.focus(); }
  });
  app.on("open-url", (e, link) => {                                 // macOS
    e.preventDefault();
    if (win) { if (!locked) loadSite(linkToUrl(link)); goFull(); win.focus(); } else pendingLink = link;
  });
  app.on("before-quit", (e) => { if (!quitting && locked) e.preventDefault(); else quitting = true; });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => winlock.shutdown());
  process.on("exit", () => winlock.shutdown());

  app.whenReady().then(async () => {
    await winlock.init(app.getPath("userData")).catch(() => {});
    Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ label: "Quiz Duel", submenu: [] },
      { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { role: "selectAll" }] }]) : null);
    const ses = session.defaultSession;
    ses.setSpellCheckerLanguages && process.platform !== "darwin" && ses.setSpellCheckerLanguages(["en-US"]);
    ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission === "clipboard-sanitized-write" || permission === "fullscreen"));
    ses.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !allowedUrl(details.url) }));
    ses.on("will-download", (e) => e.preventDefault());
    screen.on("display-added", () => { send("displays", screen.getAllDisplays().length); goFull(); });
    screen.on("display-removed", () => { send("displays", screen.getAllDisplays().length); goFull(); });
    screen.on("display-metrics-changed", () => goFull());
    createWindow(linkToUrl(pendingLink || linkFromArgv(process.argv) || ""));
  });
}
