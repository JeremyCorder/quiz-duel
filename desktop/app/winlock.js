// Windows-only extra lockdown, used by main.js.
//
// 1. Keyboard guard (while the app is open): QuizDuelKeys.exe, a small program shipped with the app
//    (source: desktop/native/QuizDuelKeys.cs). It blocks the Windows key (Win+Ctrl+arrows, Win+Tab, Win+D, Start menu),
//    Alt+Tab, Alt+Esc, Ctrl+Esc, Ctrl+Shift+Esc and Print Screen. It records nothing and quits when Quiz Duel closes.
// 2. During a High-security quiz: temporary Windows settings for this user only (no admin needed), like Safe Exam Browser:
//    Ctrl+Alt+Del loses Task Manager, Lock, Sign out and Change password; touchpad 3- and 4-finger swipes do nothing.
//    The old values are saved to a file first and put back when the quiz ends or the app closes - and, if the computer
//    crashed in the middle, the next time Quiz Duel starts.
// Ctrl+Alt+Del itself can't be blocked by any app (Windows protects it); leaving the app that way is still detected.
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";
let guard = null, backupFile = null, applied = false;

function guardPath() {
  const p = path.join(process.resourcesPath || "", "bin", "QuizDuelKeys.exe");
  return fs.existsSync(p) ? p : null;
}
function startKeyBlocker() {
  if (!IS_WIN || guard) return;
  const exe = guardPath(); if (!exe) return;
  try {
    guard = spawn(exe, [String(process.pid)], { windowsHide: true, stdio: "ignore" });
    guard.on("exit", () => { guard = null; });
    guard.on("error", () => { guard = null; });
  } catch (e) { guard = null; }
}
function stopKeyBlocker() { if (guard) { try { guard.kill(); } catch (e) {} guard = null; } }

// ---------------------------------------------------------------- temporary settings (current user only)
const SETTINGS = [
  ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", "DisableTaskMgr", 1],
  ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", "DisableLockWorkstation", 1],
  ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", "DisableChangePassword", 1],
  ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer", "NoLogoff", 1],
  ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad", "ThreeFingerSlideEnabled", 0],
  ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad", "FourFingerSlideEnabled", 0],
];
const reg = (args) => new Promise((resolve) => execFile("reg.exe", args, { windowsHide: true }, (err, out) => resolve(err ? null : String(out))));
async function readValue(key, name) {
  const out = await reg(["query", key, "/v", name]);
  if (!out) return null;                                             // not set
  const m = new RegExp(name + "\\s+REG_DWORD\\s+0x([0-9a-f]+)", "i").exec(out);
  return m ? parseInt(m[1], 16) : null;
}
const writeValue = (key, name, v) => reg(["add", key, "/v", name, "/t", "REG_DWORD", "/d", String(v), "/f"]);
const deleteValue = (key, name) => reg(["delete", key, "/v", name, "/f"]);

async function applySettings() {
  if (!IS_WIN || applied) return;
  applied = true;
  const old = [];
  for (const [key, name] of SETTINGS) old.push([key, name, await readValue(key, name)]);
  try { fs.writeFileSync(backupFile, JSON.stringify(old)); } catch (e) { applied = false; return; }   // no backup -> change nothing
  for (const [key, name, v] of SETTINGS) await writeValue(key, name, v);
}
async function restoreSettings() {
  if (!IS_WIN || !backupFile || !fs.existsSync(backupFile)) { applied = false; return; }
  let old = [];
  try { old = JSON.parse(fs.readFileSync(backupFile, "utf8")); } catch (e) {}
  for (const [key, name, v] of old) { if (v === null) await deleteValue(key, name); else await writeValue(key, name, v); }
  try { fs.unlinkSync(backupFile); } catch (e) {}
  applied = false;
}
// same thing without waiting, for when the app is closing right now
function restoreSettingsNow() {
  if (!IS_WIN || !backupFile || !fs.existsSync(backupFile)) return;
  const { execFileSync } = require("child_process");
  let old = [];
  try { old = JSON.parse(fs.readFileSync(backupFile, "utf8")); } catch (e) {}
  for (const [key, name, v] of old) {
    try { execFileSync("reg.exe", v === null ? ["delete", key, "/v", name, "/f"] : ["add", key, "/v", name, "/t", "REG_DWORD", "/d", String(v), "/f"], { windowsHide: true, stdio: "ignore" }); } catch (e) {}
  }
  try { fs.unlinkSync(backupFile); } catch (e) {}
  applied = false;
}

module.exports = {
  IS_WIN,
  // call once at start: remembers where the backup lives and repairs settings left over from a crash
  async init(userDataDir) {
    if (!IS_WIN) return;
    backupFile = path.join(userDataDir, "windows-settings-backup.json");
    await restoreSettings();
    startKeyBlocker();
  },
  lock: applySettings,
  unlock: restoreSettings,
  shutdown() { stopKeyBlocker(); restoreSettingsNow(); },
  get keyBlockerRunning() { return !!guard; },
};
