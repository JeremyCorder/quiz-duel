// Quiz Duel keyboard guard (Windows).
// Runs while the Quiz Duel app is open, started by the app.
// It does NOT record or send any keys. It only stops shortcuts that leave the quiz:
// the Windows key (Start menu, Win+Tab, Win+Ctrl+arrows, Win+D...), Alt+Tab, Alt+Esc, Ctrl+Esc and Print Screen.
// It closes itself when Quiz Duel closes.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("Quiz Duel keyboard guard")]
[assembly: AssemblyDescription("Blocks the Windows key and app-switching shortcuts during a Quiz Duel quiz. Records nothing.")]
[assembly: AssemblyProduct("Quiz Duel")]
[assembly: AssemblyCompany("Quiz Duel")]
[assembly: AssemblyVersion("1.0.0.0")]

static class QuizDuelKeys {
  delegate IntPtr Proc(int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k);
  [StructLayout(LayoutKind.Sequential)] struct KB { public uint vk; public uint scan; public uint flags; public uint time; public IntPtr extra; }
  static Proc keep; static IntPtr hook;
  static bool Down(int k) { return (GetAsyncKeyState(k) & 0x8000) != 0; }
  static IntPtr Cb(int n, IntPtr w, IntPtr l) {
    if (n >= 0) {
      KB k = (KB)Marshal.PtrToStructure(l, typeof(KB));
      uint vk = k.vk; bool alt = (k.flags & 0x20) != 0;
      if (vk == 0x5B || vk == 0x5C) return (IntPtr)1;                          // Windows keys
      if (alt && (vk == 0x09 || vk == 0x1B)) return (IntPtr)1;               // Alt+Tab, Alt+Esc
      if (Down(0x11) && vk == 0x1B) return (IntPtr)1;                          // Ctrl+Esc, Ctrl+Shift+Esc
      if (vk == 0x2C) return (IntPtr)1;                                        // Print Screen
    }
    return CallNextHookEx(hook, n, w, l);
  }
  [STAThread]
  static void Main(string[] args) {
    int parent; if (args.Length < 1 || !int.TryParse(args[0], out parent)) return;
    keep = Cb; hook = SetWindowsHookEx(13, keep, GetModuleHandle(null), 0);
    Timer t = new Timer(); t.Interval = 1000;
    t.Tick += delegate { bool gone; try { gone = Process.GetProcessById(parent).HasExited; } catch { gone = true; } if (gone) Application.Exit(); };
    t.Start(); Application.Run();
    if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
  }
}
