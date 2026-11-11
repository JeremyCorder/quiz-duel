"use strict";
// Finding and closing other programs while a quiz is locked.
const { execFile } = require("child_process");

// level 1 = music apps, level 2 = also other browsers; games = also games and game launchers.
// Remote-control apps are always closed during a quiz.
const LISTS = {
  remote: { win: ["TeamViewer.exe", "AnyDesk.exe", "RustDesk.exe", "Supremo.exe", "vncviewer.exe", "chromoting.exe"], mac: ["TeamViewer", "AnyDesk", "RustDesk", "VNC Viewer"] },
  music: {
    win: ["Spotify.exe", "iTunes.exe", "AppleMusic.exe", "vlc.exe", "wmplayer.exe", "Microsoft.Media.Player.exe", "Discord.exe", "foobar2000.exe", "AIMP.exe", "Deezer.exe", "TIDAL.exe", "Amazon Music.exe"],
    mac: ["Spotify", "Music", "iTunes", "VLC", "Discord", "TIDAL", "Deezer", "Amazon Music"],
  },
  games: {
    win: ["RobloxPlayerBeta.exe", "Windows10Universal.exe", "Minecraft.Windows.exe", "MinecraftLauncher.exe", "javaw.exe", "steam.exe", "EpicGamesLauncher.exe",
      "FortniteClient-Win64-Shipping.exe", "FortniteLauncher.exe", "RiotClientServices.exe", "VALORANT-Win64-Shipping.exe", "LeagueClient.exe", "League of Legends.exe",
      "Battle.net.exe", "Overwatch.exe", "cs2.exe", "csgo.exe", "GTA5.exe", "Among Us.exe", "Terraria.exe", "RocketLeague.exe", "GenshinImpact.exe", "osu!.exe",
      "EADesktop.exe", "Origin.exe", "XboxPcApp.exe", "Brawlhalla.exe", "FallGuys_client_game.exe", "r5apex.exe", "Marvel-Win64-Shipping.exe", "Hollow Knight.exe",
      "Stardew Valley.exe", "Geometry Dash.exe", "GeometryDash.exe", "Rayman Legends.exe", "Celeste.exe", "Undertale.exe", "deltarune.exe", "Cuphead.exe",
      "Overcooked2.exe", "Paladins.exe", "Smite.exe", "Warframe.x64.exe", "Dota2.exe", "dota2.exe", "TslGame.exe", "Rainbow6.exe", "RainbowSix.exe",
      "Palworld-Win64-Shipping.exe", "HogwartsLegacy.exe", "eldenring.exe", "Fortnite.exe", "itch.exe", "GOG Galaxy.exe", "GalaxyClient.exe", "upc.exe", "UbisoftConnect.exe"],
    mac: ["Roblox", "RobloxPlayer", "Minecraft", "java", "Steam", "steam_osx", "Epic Games Launcher", "League of Legends", "LeagueClient", "Riot Client", "Battle.net",
      "Among Us", "Terraria", "Stardew Valley", "osu!", "Hollow Knight", "Geometry Dash", "Celeste", "Undertale", "Cuphead", "Dota 2", "dota2", "itch", "GOG Galaxy"],
  },
  browsers: {
    win: ["chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe", "vivaldi.exe"],
    mac: ["Google Chrome", "Safari", "firefox", "Microsoft Edge", "Brave Browser", "Opera", "Arc", "Vivaldi"],
  },
};
const NICE = { "chrome.exe": "Google Chrome", "msedge.exe": "Microsoft Edge", "firefox": "Firefox", "firefox.exe": "Firefox", "vlc.exe": "VLC", "wmplayer.exe": "Windows Media Player",
  "Microsoft.Media.Player.exe": "Media Player", "RobloxPlayerBeta.exe": "Roblox", "RobloxPlayer": "Roblox", "Windows10Universal.exe": "Roblox",
  "Minecraft.Windows.exe": "Minecraft", "MinecraftLauncher.exe": "Minecraft", "javaw.exe": "Minecraft (Java)", "java": "Minecraft (Java)", "steam.exe": "Steam", "steam_osx": "Steam",
  "EpicGamesLauncher.exe": "Epic Games", "FortniteClient-Win64-Shipping.exe": "Fortnite", "FortniteLauncher.exe": "Fortnite", "RiotClientServices.exe": "Riot Client",
  "VALORANT-Win64-Shipping.exe": "Valorant", "LeagueClient.exe": "League of Legends", "LeagueClient": "League of Legends", "cs2.exe": "Counter-Strike 2", "GTA5.exe": "GTA V",
  "r5apex.exe": "Apex Legends", "Marvel-Win64-Shipping.exe": "Marvel Rivals", "FallGuys_client_game.exe": "Fall Guys", "TslGame.exe": "PUBG", "XboxPcApp.exe": "Xbox app",
  "EADesktop.exe": "EA app", "upc.exe": "Ubisoft Connect", "GalaxyClient.exe": "GOG Galaxy", "Palworld-Win64-Shipping.exe": "Palworld", "eldenring.exe": "Elden Ring", "dota2.exe": "Dota 2", "AppleMusic.exe": "Apple Music", "Music": "Apple Music", "brave.exe": "Brave", "Brave Browser": "Brave" };
const nice = (n) => NICE[n] || n.replace(/\.exe$/i, "");

function wanted(level, games) {
  const os = process.platform === "win32" ? "win" : "mac";
  const names = [...LISTS.remote[os]];
  if (level >= 1) names.push(...LISTS.music[os]);
  if (level >= 2) names.push(...LISTS.browsers[os]);
  if (games) names.push(...LISTS.games[os]);
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

async function find(level, games) {
  const want = wanted(level, games), list = await running(), out = new Map();
  for (const p of list) if (want.has(p.name.toLowerCase()) && p.pid !== process.pid) {
    const key = nice(p.name);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(p.pid);
  }
  return [...out.entries()].map(([name, pids]) => ({ name, pids }));
}

async function close(level, games) {
  const found = await find(level, games);
  for (const app of found) for (const pid of app.pids) { try { process.kill(pid); } catch (e) { /* gone already or not allowed */ } }
  return found.map((a) => a.name);
}

module.exports = { find, close, wanted, running, LISTS };
