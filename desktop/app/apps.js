"use strict";
// Finding and closing other programs while a quiz is locked.
const { execFile } = require("child_process");

// level 1 = music apps, level 2 = also other browsers. Remote-control apps are always closed during a quiz.
const LISTS = {
  remote: { win: ["TeamViewer.exe", "AnyDesk.exe", "RustDesk.exe", "Supremo.exe", "vncviewer.exe", "chromoting.exe"], mac: ["TeamViewer", "AnyDesk", "RustDesk", "VNC Viewer"] },
  music: {
    win: ["Spotify.exe", "iTunes.exe", "AppleMusic.exe", "vlc.exe", "wmplayer.exe", "Microsoft.Media.Player.exe", "Discord.exe", "foobar2000.exe", "AIMP.exe", "Deezer.exe", "TIDAL.exe", "Amazon Music.exe"],
    mac: ["Spotify", "Music", "iTunes", "VLC", "Discord", "TIDAL", "Deezer", "Amazon Music"],
  },
  browsers: {
    win: ["chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe", "vivaldi.exe"],
    mac: ["Google Chrome", "Safari", "firefox", "Microsoft Edge", "Brave Browser", "Opera", "Arc", "Vivaldi"],
  },
};
const NICE = { "chrome.exe": "Google Chrome", "msedge.exe": "Microsoft Edge", "firefox": "Firefox", "firefox.exe": "Firefox", "vlc.exe": "VLC", "wmplayer.exe": "Windows Media Player",
  "Microsoft.Media.Player.exe": "Media Player", "AppleMusic.exe": "Apple Music", "Music": "Apple Music", "brave.exe": "Brave", "Brave Browser": "Brave" };
const nice = (n) => NICE[n] || n.replace(/\.exe$/i, "");

function wanted(level) {
  const os = process.platform === "win32" ? "win" : "mac";
  const names = [...LISTS.remote[os]];
  if (level >= 1) names.push(...LISTS.music[os]);
  if (level >= 2) names.push(...LISTS.browsers[os]);
  return new Set(names.map((n) => n.toLowerCase()));
}

// -> [{ pid, name }]
function running() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile("tasklist", ["/fo", "csv", "/nh"], { windowsHide: true, maxBuffer: 8 << 20 }, (err, out) => {
        if (err) return resolve([]);
        resolve(String(out).split(/\r?\n/).map((line) => {
          const m = /^"([^"]+)","(\d+)"/.exec(line);
          return m ? { name: m[1], pid: +m[2] } : null;
        }).filter(Boolean));
      });
    } else {
      execFile("ps", ["-axo", "pid=,comm="], { maxBuffer: 8 << 20 }, (err, out) => {
        if (err) return resolve([]);
        resolve(String(out).split("\n").map((line) => {
          const m = /^\s*(\d+)\s+(.+)$/.exec(line);
          if (!m) return null;
          const path = m[2].trim();
          // "/Applications/Spotify.app/Contents/MacOS/Spotify" -> "Spotify"; skip helper processes inside an app bundle
          const app = /\/([^/]+)\.app\/Contents\/MacOS\/([^/]+)$/.exec(path);
          return { pid: +m[1], name: app ? app[1] : path.split("/").pop() };
        }).filter(Boolean));
      });
    }
  });
}

async function find(level) {
  const want = wanted(level), list = await running(), out = new Map();
  for (const p of list) if (want.has(p.name.toLowerCase()) && p.pid !== process.pid) {
    const key = nice(p.name);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(p.pid);
  }
  return [...out.entries()].map(([name, pids]) => ({ name, pids }));
}

async function close(level) {
  const found = await find(level);
  for (const app of found) for (const pid of app.pids) { try { process.kill(pid); } catch (e) { /* gone already or not allowed */ } }
  return found.map((a) => a.name);
}

module.exports = { find, close, wanted, running, LISTS };
