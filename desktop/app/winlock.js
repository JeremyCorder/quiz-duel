// Windows-only extra lockdown, used by main.js.
//
// 1. Keyboard blocker (while the app is open): a small hidden helper swallows the Windows key (so Win+Ctrl+arrows,
//    Win+Tab, Win+D, the Start menu... all do nothing), Alt+Tab, Alt+Esc, Ctrl+Esc, Ctrl+Shift+Esc and Print Screen.
//    It uses a standard low-level keyboard hook and quits by itself when Quiz Duel closes.
// 2. During a high-security quiz: temporary Windows settings for this user only (no admin needed), like Safe Exam Browser:
//    Ctrl+Alt+Del loses Task Manager, Lock, Sign out and Change password; touchpad 3- and 4-finger swipes do nothing.
//    The old values are saved to a file first and put back when the quiz ends or the app closes - and, if the computer
//    crashed in the middle, the next time Quiz Duel starts.
// Ctrl+Alt+Del itself can't be blocked by any app (Windows protects it); leaving the app that way is still detected.
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";
let hookProc = null, backupFile = null, applied = false;

const HOOK_CS = `
using System; using System.Diagnostics; using System.Runtime.InteropServices; using System.Windows.Forms;
public static class QDKeys {
  delegate IntPtr Proc(int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k);
  [StructLayout(LayoutKind.Sequential)] struct KB { public uint vk; public uint scan; public uint flags; public uint time; public IntPtr extra; }
  static Proc keep; static IntPtr hook;
  static bool Down(int k) { return (GetAsyncKeyState(k) & 0x8000) != 0; }
  static IntPtr Cb(int n, IntPtr w, IntPtr l) {
    if (n >= 0) {
      KB k = (KB)Marshal.PtrToStructure(l, typeof(KB));
      uint vk = k.vk; bool alt = (k.flags & 0x20) != 0; bool ctrl = Down(0x11); bool shift = Down(0x10);
      if (vk == 0x5B || vk == 0x5C || vk == 0x5D) return (IntPtr)1;                 // Windows keys, menu key
      if (alt && (vk == 0x09 || vk == 0x1B || vk == 0x73)) return (IntPtr)1;      // Alt+Tab, Alt+Esc, Alt+F4
      if (ctrl && vk == 0x1B) return (IntPtr)1;                                    // Ctrl+Esc, Ctrl+Shift+Esc
      if (vk == 0x2C) return (IntPtr)1;                                            // Print Screen
      if (vk >= 0xA6 && vk <= 0xAC) return (IntPtr)1;                              // browser / search / mail keys
      if (vk >= 0xB4 && vk <= 0xB7) return (IntPtr)1;                              // launch mail / media / app keys
    }
    return CallNextHookEx(hook, n, w, l);
  }
  public static void Run(int parent) {
    keep = Cb; hook = SetWindowsHookEx(13, keep, GetModuleHandle(null), 0);
    Timer t = new Timer(); t.Interval = 1000;
    t.Tick += delegate { try { if (Process.GetProcessById(parent).HasExited) Application.Exit(); } catch { Application.Exit(); } };
    t.Start(); Application.Run();
  }
}`;

function startKeyBlocker() {
  if (!IS_WIN || hookProc) return;
  const ps = `$ErrorActionPreference='Stop'; Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'\n${HOOK_CS}\n'@; [QDKeys]::Run(${process.pid})`;
  try {
    hookProc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")],
      { windowsHide: true, stdio: "ignore" });
    hookProc.on("exit", () => { hookProc = null; });
    hookProc.on("error", () => { hookProc = null; });
  } catch (e) { hookProc = null; }
}
function stopKeyBlocker() { if (hookProc) { try { hookProc.kill(); } catch (e) {} hookProc = null; } }

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
  get keyBlockerRunning() { return !!hookProc; },
};
