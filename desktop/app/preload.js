"use strict";
// What the quiz page can ask the app to do. Nothing else from the computer is reachable.
const { contextBridge, ipcRenderer } = require("electron");
const listeners = new Set();
ipcRenderer.on("quizduel", (e, msg) => { for (const fn of listeners) { try { fn(msg); } catch (er) { /* ignore */ } } });
contextBridge.exposeInMainWorld("quizDuelApp", {
  isApp: true,
  installUpdate: () => ipcRenderer.invoke("qd:install-update"),
  // true when the app was reopened by itself because it was closed during a locked quiz (e.g. ended in Task Manager)
  relaunched: (() => { try { return !!ipcRenderer.sendSync("qd:relaunched"); } catch (e) { return false; } })(),
  info: () => ipcRenderer.invoke("qd:info"),
  lock: (on, opts) => ipcRenderer.invoke("qd:lock", !!on, opts || {}),
  runningApps: (level, games) => ipcRenderer.invoke("qd:apps", level, !!games),
  closeApps: (level, games) => ipcRenderer.invoke("qd:close-apps", level, !!games),
  allowReferences: (origins) => ipcRenderer.invoke("qd:refs", origins),
  quit: () => ipcRenderer.invoke("qd:quit"),
  retry: (url) => ipcRenderer.invoke("qd:retry", url),
  on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
});
