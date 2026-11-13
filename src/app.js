"use strict";
/* =====================================================================
   QUIZ DUEL - website (student, teacher, practice) - any subject
   Connection: the teacher's browser tab hosts the quiz. Students reach it by
   code through a public relay over an ordinary secure web connection.
   Grading happens in the teacher's tab: correct answers never reach students.
   High security: students take the quiz in the Quiz Duel app, which locks the
   whole computer (see the desktop/ folder). The page talks to it through
   window.quizDuelApp.
   ===================================================================== */
(function () {
  const M = MathDuel;
  const DEV_TEACHER_HASH = "2a1bcf1ea1439";       // only used when the exam isn't packed in (local testing)
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const QS = new URLSearchParams(location.search);
  // the quiz code, when the page was opened with one (the Quiz Duel app adds it to the address)
  const URL_CODE = ((location.href.match(/[?&]code=([A-Za-z0-9]{6})(?![A-Za-z0-9])/) || [])[1] || "").toUpperCase();
  const APP = "Quiz Duel";
  // The Quiz Duel app (desktop/) shows this same website in a locked window and adds window.quizDuelApp.
  const QDA = window.quizDuelApp && window.quizDuelApp.isApp === true ? window.quizDuelApp : null;
  const IN_APP = !!QDA;
  const BASE_URL = location.origin + location.pathname;
  const DOWNLOADS = window.QD_DOWNLOADS || { win: "", mac: "" };     // filled in by build.py
  let appDisplays = 1;
  if (QDA) QDA.info().then((i) => { appDisplays = i.displays || 1; }).catch(() => {});
  const appLink = (code, name, email) => "quizduel://join?code=" + encodeURIComponent(code) + (name ? "&name=" + encodeURIComponent(name) : "") + (email ? "&email=" + encodeURIComponent(email) : "");
  const quitApp = () => { if (QDA) QDA.quit(); else home(); };
  // security: low = any browser, leaving is only reported; medium = locked browser tab; high = the Quiz Duel app
  const SECURITY = { low: "Low", medium: "Medium", high: "High" };
  const secLevel = (st) => (st && SECURITY[st.security]) ? st.security : (st && st.lockdown ? "medium" : "low");
  const locked = (st) => secLevel(st) !== "low";
  // the Quiz Duel app is required for High security, and for any quiz with anti-game on (a website can't block games)
  const needsApp = (st) => secLevel(st) === "high" || !!(st && st.closeGames);
  const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/;

  // ------------------------------------------------------------ small helpers
  const $ = (s) => document.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function setKids(el, ...kids) { el.replaceChildren(...h("div", null, ...kids).childNodes); }
  const app = $("#app");
  let timers = [];
  function later(ms, fn) { const id = setTimeout(fn, ms); timers.push(id); return id; }
  function every(ms, fn) { const id = setInterval(fn, ms); timers.push(-id); return id; }
  function clearTimers() { for (const id of timers) { if (id < 0) clearInterval(-id); else clearTimeout(id); } timers = []; }
  function show(...nodes) { clearTimers(); app.replaceChildren(...nodes); window.scrollTo(0, 0); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  function randomCode(n, chars) {
    const a = new Uint32Array(n); crypto.getRandomValues(a);
    return Array.from(a, (x) => chars[x % chars.length]).join("");
  }
  const uid = () => randomCode(12, "abcdefghijklmnopqrstuvwxyz0123456789");
  const unlockHash = (code, pin) => cyrb53(`unlock:${code}:${pin}`);
  const enc = new TextEncoder();
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function keystream(code, n) {
    let s = parseInt(cyrb53("key:" + code).slice(-8), 16) || 1;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; out[i] = s & 255; }
    return out;
  }
  function seal(code, obj) {
    const b = enc.encode(JSON.stringify(obj)), k = keystream(code, b.length);
    for (let i = 0; i < b.length; i++) b[i] ^= k[i];
    return b64(b);
  }
  function unseal(code, text) {
    const b = unb64(text), k = keystream(code, b.length);
    for (let i = 0; i < b.length; i++) b[i] ^= k[i];
    return JSON.parse(new TextDecoder().decode(b));
  }
  async function sha256hex(text) {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
    return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  function wipeClipboard() { try { navigator.clipboard && navigator.clipboard.writeText("").catch(() => {}); } catch (e) { /* ignore */ } }
  const monitorCheckSupported = () => IN_APP || typeof window.screen.isExtended === "boolean";
  const extraMonitor = () => IN_APP ? appDisplays > 1 : window.screen.isExtended === true;
  function clock(sec) { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }
  function download(name, blob) {
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------ teacher password + locked exam
  async function unlockTeacher(pw) {
    const blob = window.MD_EXAM_BLOB;
    if (!blob) return cyrb53("mathduel-teacher:" + pw) === DEV_TEACHER_HASH;
    try {
      const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(blob.salt), iterations: blob.iter, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
      M.setExamData(JSON.parse(new TextDecoder().decode(plain)));
      return true;
    } catch (e) { return false; }
  }

  // ---- display settings: theme, dyslexia-friendly font, text size (remembered on this device)
  const display = Object.assign({ theme: "dark", dys: false, size: 1 }, store.get("qd-display") || {});
  function applyDisplay() {
    const root = document.documentElement;
    root.dataset.theme = display.theme === "light" ? "light" : "dark";
    root.classList.toggle("dys", !!display.dys);
    root.style.fontSize = (16 * display.size) + "px";
    store.set("qd-display", display);
  }
  applyDisplay();
  function displayMenu() {
    const panel = h("div", { class: "display-panel", hidden: true, role: "group", "aria-label": "Display settings" });
    const btn = h("button", { class: "display-btn", type: "button", "aria-expanded": "false", onclick: () => { panel.hidden = !panel.hidden; btn.setAttribute("aria-expanded", String(!panel.hidden)); } }, "Aa Display");
    const seg = (label, opts, cur, set) => h("div", {}, h("span", { class: "label" }, label),
      h("div", { class: "seg" }, opts.map(([v, text]) => h("button", { type: "button", "aria-pressed": String(cur() === v), onclick: () => { set(v); applyDisplay(); draw(); } }, text))));
    const SIZES = [0.9, 1, 1.15, 1.3];
    function draw() {
      setKids(panel,
        seg("Theme", [["dark", "Dark"], ["light", "Light"]], () => display.theme, (v) => { display.theme = v; }),
        seg("Reading font", [[false, "Standard"], [true, "Dyslexia-friendly"]], () => !!display.dys, (v) => { display.dys = v; }),
        seg("Text size", SIZES.map((v, i) => [v, ["S", "M", "L", "XL"][i]]), () => display.size, (v) => { display.size = v; }));
    }
    draw();
    return [btn, panel];
  }
  // the student's status chip next to "Quiz Duel": clock, battery (when the device tells us), and the code they used
  let batteryInfo = null;
  try { if (navigator.getBattery) navigator.getBattery().then((b) => { batteryInfo = b; }, () => {}); } catch (e) {}
  function statusChip(code) {
    const clock = h("span", { class: "st-clock" }), batt = h("span", { class: "st-batt" });
    const paint = () => {
      clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (batteryInfo) {
        const pct = Math.round(batteryInfo.level * 100);
        batt.textContent = (batteryInfo.charging ? "\u26a1" : "\ud83d\udd0b") + " " + pct + "%";
        batt.classList.toggle("low", pct <= 15 && !batteryInfo.charging);
        batt.title = batteryInfo.charging ? "Charging" : "Battery";
        batt.hidden = false;
      } else batt.hidden = true;
    };
    paint();
    const id = setInterval(() => { if (!chip.isConnected) { clearInterval(id); return; } paint(); }, 10000);
    const chip = h("span", { class: "status-chip", "aria-label": "Time, battery and code" }, clock, batt, code ? h("span", { class: "st-code mono", title: "The code you joined with" }, code) : null);
    return chip;
  }
  function topbar(left, right, extra) {
    return h("header", { class: "topbar" }, h("div", { class: "brand" }, h("span", { class: "logo" }, "Q"), left), extra || null,
      h("div", { class: "spacer" }), right ? h("div", { class: "top-right" }, right) : null, displayMenu());
  }

  // ---- formatted writing (long answers). Only harmless formatting survives: everything a student
  // sends is rebuilt from an allow-list before the teacher's page shows it.
  const RICH_TAGS = new Set(["P", "DIV", "BR", "H1", "H2", "H3", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "SUP", "SUB", "SPAN", "FONT", "UL", "OL", "LI", "BLOCKQUOTE", "HR"]);
  const RICH_STYLES = ["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "text-decoration-line", "text-decoration", "text-align", "line-height", "margin-left", "list-style-type", "vertical-align", "letter-spacing"];
  const RICH_BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "LI", "BR", "BLOCKQUOTE", "HR"]);
  const safeCss = (v) => /^[\w\s#(),.%"'-]{1,120}$/.test(v) && !/url|expression|javascript/i.test(v);
  function richClean(html) {
    const doc = new DOMParser().parseFromString("<body>" + String(html || "").slice(0, 60000), "text/html");
    const out = document.createDocumentFragment();
    (function walk(src, dst, depth) {
      for (const n of src.childNodes) {
        if (n.nodeType === 3) { dst.append(n.nodeValue); continue; }
        if (n.nodeType !== 1 || depth > 30) continue;
        const tag = n.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT") continue;
        if (!RICH_TAGS.has(tag)) { walk(n, dst, depth + 1); continue; }
        const el = document.createElement(tag === "FONT" ? "span" : tag === "STRIKE" ? "s" : tag);
        for (const name of RICH_STYLES) { const v = n.style.getPropertyValue(name); if (v && safeCss(v)) el.style.setProperty(name, v); }
        if (tag === "FONT") {
          const c = n.getAttribute("color"), f = n.getAttribute("face"), z = n.getAttribute("size");
          if (c && safeCss(c)) el.style.color = c;
          if (f && safeCss(f)) el.style.fontFamily = f;
          if (/^[1-7]$/.test(z || "")) el.style.fontSize = FONT_STEPS[+z - 1][1];
        }
        const al = n.getAttribute("align");
        if (/^(left|right|center|justify)$/i.test(al || "")) el.style.textAlign = al.toLowerCase();
        dst.append(el);
        walk(n, el, depth + 1);
      }
    })(doc.body, out, 0);
    return out;
  }
  function richText(html) {
    let text = "";
    (function walk(node) {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) text += n.nodeValue;
        else if (n.nodeType === 1) { if (n.tagName === "BR") text += "\n"; walk(n); if (RICH_BLOCKS.has(n.tagName) && n.tagName !== "BR") text += "\n"; }
      }
    })(richClean(html));
    return text.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  const shownRaw = (p, raw) => p.kind === "long" ? richText(raw) : M.shownAnswer(p, raw);
  const answerView = (p, raw, cls) => p.kind === "long" ? h("div", { class: cls + " paper" }, richClean(raw)) : h("pre", { class: cls }, M.shownAnswer(p, raw));

  const WRITE_FONTS = [["Lexend", '"Lexend", "Segoe UI", Arial, sans-serif'], ["Arial", "Arial, Helvetica, sans-serif"], ["Verdana", "Verdana, Geneva, sans-serif"],
    ["Trebuchet", '"Trebuchet MS", sans-serif'], ["Georgia", 'Georgia, "Times New Roman", serif'], ["Times New Roman", '"Times New Roman", Times, serif'],
    ["Courier New", '"Courier New", Courier, monospace'], ["Comic Sans", '"Comic Sans MS", "Comic Sans", cursive'], ["OpenDyslexic", '"OpenDyslexic", "Comic Sans MS", Verdana, sans-serif']];
  // the browser's 7 text sizes, shown as point sizes like a word processor
  const FONT_STEPS = [["8", "x-small"], ["10", "small"], ["12", "medium"], ["14", "large"], ["18", "x-large"], ["24", "xx-large"], ["36", "xxx-large"]];
  const TEXT_COLORS = [["Black", "#16193a"], ["Dark grey", "#5b6170"], ["Red", "#d4213d"], ["Orange", "#c25a00"], ["Green", "#14804a"], ["Blue", "#1b4fd8"], ["Purple", "#7a2bd6"], ["Pink", "#c2185b"]];
  const MARK_COLORS = [["Yellow", "#fff176"], ["Green", "#b9f6ca"], ["Blue", "#b3e5fc"], ["Pink", "#f8bbd0"], ["Orange", "#ffe0b2"], ["Purple", "#e1bee7"]];
  const SYMBOLS = ["°", "±", "×", "÷", "≠", "≈", "≤", "≥", "√", "∞", "π", "θ", "Δ", "Σ", "µ", "Ω", "²", "³", "½", "¼", "¾", "→", "←", "↑", "↓", "↔", "•", "—", "…", "©",
    "é", "è", "ê", "á", "à", "ñ", "ü", "ö", "ç", "¿", "¡", "€", "£", "¥"];
  const LINE_SPACING = [["Single", "1.2"], ["1.15", "1.4"], ["1.5", "1.8"], ["Double", "2.4"]];
  const LETTER_SPACING = [["Tight", "-0.03em"], ["Normal", "normal"], ["Wide", "0.08em"], ["Wider", "0.15em"], ["Widest", "0.25em"]];
  // little drawings for the toolbar buttons (Google Docs style)
  const ICONS = {
    letters: "M3 4l3 9 3-9M4.2 9.5h3.6M13 4l3 9 3-9M14.2 9.5h3.6M3 19h18M3 19l2-2M3 19l2 2M21 19l-2-2M21 19l-2 2",
    undo: "M9 7H4V2M4.5 7A8 8 0 1 1 6 17", redo: "M15 7h5V2M19.5 7A8 8 0 1 0 18 17",
    left: "M3 5h18M3 9h12M3 13h18M3 17h12", center: "M3 5h18M6 9h12M3 13h18M6 17h12", right: "M3 5h18M9 9h12M3 13h18M9 17h12", justify: "M3 5h18M3 9h18M3 13h18M3 17h18",
    bullets: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01", numbers: "M10 6h11M10 12h11M10 18h11M4 4v4M3 18h3l-3 3h3M3 12h2.5l-2.5 2h3",
    indent: "M3 5h18M11 10h10M11 14h10M3 19h18M3 9l4 3-4 3", outdent: "M3 5h18M11 10h10M11 14h10M3 19h18M7 9l-4 3 4 3",
    clear: "M6 4h12M12 4l-4 16M4 20l16-16", spacing: "M11 6h10M11 12h10M11 18h10M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2", line: "M3 12h18",
  };
  const icon = (k) => { const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "ticon");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", ICONS[k]); svg.append(p); return svg; };
  // A small word processor, laid out like Google Docs: undo/redo, style, font, size, bold/italic/underline/strike,
  // colour, highlight, super/subscript, alignment, line spacing, lists, indent, symbols, line, clear formatting.
  function writer(spell) {
    const page = h("div", { id: "answer", class: "paper long-answer", contenteditable: "true", role: "textbox", "aria-multiline": "true", "aria-label": "Your answer", spellcheck: spell ? "true" : "false", lang: "en" });
    const count = h("span", {}, "0 words");
    let saved = null;
    const keep = () => { const sel = window.getSelection(); if (sel.rangeCount && page.contains(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange(); };
    // put the cursor back where it was, but only if a menu or box took it away (re-setting it can move it in lists)
    const restore = () => {
      const sel = window.getSelection();
      const inside = sel.rangeCount && page.contains(sel.anchorNode);
      if (document.activeElement !== page) page.focus({ preventScroll: true });
      if (!inside && saved) { sel.removeAllRanges(); sel.addRange(saved); }
    };
    // the cursor / selection as character positions in the text, so it can be put back after Chrome moves it
    const offsets = () => {
      const sel = window.getSelection(); if (!sel.rangeCount || !page.contains(sel.anchorNode)) return null;
      const r = sel.getRangeAt(0), pre = document.createRange();
      pre.selectNodeContents(page); pre.setEnd(r.startContainer, r.startOffset);
      const start = pre.toString().length;
      return [start, start + r.toString().length];
    };
    const setOffsets = ([a, b]) => {
      const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      let n, pos = 0, sN = null, sO = 0, eN = null, eO = 0, last = null;
      while ((n = walker.nextNode())) {
        const len = n.nodeValue.length; last = n;
        if (!sN && a <= pos + len) { sN = n; sO = a - pos; }
        if (!eN && b <= pos + len) { eN = n; eO = b - pos; break; }
        pos += len;
      }
      if (!sN) return;
      if (!eN) { eN = last; eO = last.nodeValue.length; }
      const r = document.createRange(); r.setStart(sN, sO); r.setEnd(eN, eO);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    };
    const KEEP_CURSOR = new Set(["insertOrderedList", "insertUnorderedList", "indent", "outdent", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull", "formatBlock"]);
    const run = (cmd, val) => {
      restore();
      const at = KEEP_CURSOR.has(cmd) ? offsets() : null;
      try { document.execCommand("styleWithCSS", false, true); document.execCommand(cmd, false, val); } catch (e) { /* not supported */ }
      if (at) { const now = offsets(); if (!now || now[0] !== at[0] || now[1] !== at[1]) setOffsets(at); }
      tidy(); keep(); update(); paintState();
    };
    // Chrome sometimes copies the page's own text size/font into spans when moving text; those would stop
    // Title/Heading from making text bigger, so remove them (the toolbar's own sizes never use "rem")
    function tidy() {
      const at = offsets();
      let changed = false;
      page.querySelectorAll("span[style]").forEach((el) => {
        if (/rem$/.test(el.style.fontSize)) { el.style.fontSize = ""; changed = true; }
        if (/Lexend/.test(el.style.fontFamily) && !el.closest("[style*='font-family']:not(span)")) { /* keep: chosen on purpose */ }
        if (!el.getAttribute("style") || !el.style.cssText.trim()) { el.replaceWith(...el.childNodes); changed = true; }
      });
      if (changed && at) setOffsets(at);
    }
    // the paragraphs the selection touches (wrapping loose text in a paragraph first)
    const blocksInSelection = () => {
      restore();
      const sel = window.getSelection(); if (!sel.rangeCount) return [];
      const r = sel.getRangeAt(0);
      const blockOf = (n) => { while (n && n !== page) { if (n.nodeType === 1 && /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
      if (!blockOf(r.startContainer)) { try { document.execCommand("formatBlock", false, "P"); } catch (e) {} }
      const r2 = sel.rangeCount ? sel.getRangeAt(0) : r;
      return [...page.querySelectorAll("p,div,h1,h2,h3,li,blockquote")].filter((b) => r2.intersectsNode(b) && !b.querySelector("p,div,h1,h2,h3,li"));
    };
    // letter spacing for the selected text (marks it with a made-up font name, then swaps that for the spacing)
    const letters = (v) => {
      restore();
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) { blocksInSelection().forEach((b) => { b.style.letterSpacing = v === "normal" ? "" : v; }); keep(); return; }
      let font = ""; try { font = document.queryCommandValue("fontName"); } catch (e) {}
      const pageFont = getComputedStyle(page).fontFamily;
      try { document.execCommand("styleWithCSS", false, true); document.execCommand("fontName", false, "qd-letters"); } catch (e) { return; }
      page.querySelectorAll("span, font").forEach((el) => {
        if ((el.style.fontFamily || el.getAttribute("face") || "").replace(/["']/g, "") !== "qd-letters") return;
        el.style.fontFamily = font && font.replace(/["']/g, "") !== pageFont.replace(/["']/g, "") ? font : ""; el.removeAttribute("face");
        el.querySelectorAll("*").forEach((k) => { k.style.letterSpacing = ""; });
        el.style.letterSpacing = v === "normal" ? "" : v;
        if (!el.getAttribute("style")) el.replaceWith(...el.childNodes);
      });
      keep(); update();
    };
    const spacing = (v) => { blocksInSelection().forEach((b) => { b.style.lineHeight = v; }); keep(); update(); };
    // changing the style (Title, Heading...) keeps the paragraph's alignment and spacing
    const setStyle = (tag) => {
      const before = blocksInSelection().map((b) => [b.style.textAlign, b.style.lineHeight]);
      run("formatBlock", tag);
      const after = blocksInSelection();
      after.forEach((b, i) => { const [al, lh] = before[Math.min(i, before.length - 1)] || []; if (al) b.style.textAlign = al; if (lh) b.style.lineHeight = lh; });
      keep();
    };
    const update = () => {
      if (!page.textContent.trim() && !page.querySelector("li,hr")) { if (page.innerHTML === "<br>") page.innerHTML = ""; }
      const n = (page.innerText.trim().match(/\S+/g) || []).length;
      count.textContent = n + (n === 1 ? " word" : " words") + " · " + page.innerText.replace(/\s/g, "").length + " characters";
    };
    // show which buttons are "on" where the cursor is, like Google Docs
    const onBtns = {};
    let sizeSel = null;
    const paintState = () => {
      if (document.activeElement !== page) return;
      for (const [cmd, b] of Object.entries(onBtns)) { let on = false; try { on = document.queryCommandState(cmd); } catch (e) {} b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }
      try { const v = +document.queryCommandValue("fontSize"); if (v >= 1 && v <= 7 && sizeSel) sizeSel.value = String(v); } catch (e) {}
    };
    for (const ev of ["keyup", "mouseup", "blur", "input", "focus"]) page.addEventListener(ev, () => { keep(); if (ev === "input") update(); if (ev !== "blur") paintState(); });
    page.addEventListener("keydown", (e) => {
      if (e.key === "Tab") { e.preventDefault(); run(e.shiftKey ? "outdent" : (page.contains(window.getSelection().anchorNode) && window.getSelection().anchorNode.parentElement.closest("li") ? "indent" : "insertText"), "    "); }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && (e.key === "e" || e.key === "E")) { e.preventDefault(); run("justifyCenter"); }
      else if (mod && e.shiftKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); run("justifyLeft"); }
      else if (mod && e.shiftKey && (e.key === "r" || e.key === "R")) { e.preventDefault(); run("justifyRight"); }
      else if (mod && e.shiftKey && (e.key === "j" || e.key === "J")) { e.preventDefault(); run("justifyFull"); }
      else if (mod && e.shiftKey && e.key === "7") { e.preventDefault(); run("insertOrderedList"); }
      else if (mod && e.shiftKey && e.key === "8") { e.preventDefault(); run("insertUnorderedList"); }
      else if (mod && e.key === ".") { e.preventDefault(); run("superscript"); }
      else if (mod && e.key === ",") { e.preventDefault(); run("subscript"); }
    });
    const noSteal = (e) => e.preventDefault();
    const tool = (label, title, cmd, val, opts) => {
      const b = h("button", { class: "tool" + (opts && opts.cls ? " " + opts.cls : ""), type: "button", title, "aria-label": title, style: (opts && opts.style) || "", onmousedown: noSteal,
        onclick: () => (typeof cmd === "function" ? cmd() : run(cmd, val)) }, typeof label === "string" && ICONS[label] ? icon(label) : label);
      if (opts && opts.state) onBtns[opts.state] = b;
      return b;
    };
    const pick = (title, opts, fn, cls) => { const sel = h("select", { title, "aria-label": title, class: cls || "", onchange: () => { if (sel.value !== "") fn(sel.value); } }, opts.map(([t, v]) => h("option", { value: v }, t))); return sel; };
    // colour menu: preset swatches + any colour
    const colourMenu = (title, labelEl, cmd, colors, allowNone) => {
      const panel = h("div", { class: "tpanel", hidden: true, role: "menu" });
      const close = () => { panel.hidden = true; };
      const choose = (c) => { close(); run(cmd, c); if (c !== "transparent") bar.style.background = c; };
      const custom = h("input", { type: "color", "aria-label": title + ": any colour", value: colors[0][1], onchange: (e) => choose(e.target.value) });
      panel.append(h("div", { class: "swatches" }, colors.map(([n, c]) => h("button", { class: "swatch", type: "button", title: `${title}: ${n}`, "aria-label": `${title}: ${n}`, style: "background:" + c, onmousedown: noSteal, onclick: () => choose(c) })),
        allowNone ? h("button", { class: "swatch none", type: "button", title: `${title}: none`, "aria-label": `${title}: none`, onmousedown: noSteal, onclick: () => choose("transparent") }) : null),
        h("label", { class: "custom-colour" }, "Any colour ", custom));
      const bar = h("span", { class: "cbar", style: "background:" + colors[0][1] });
      const btn = h("button", { class: "tool", type: "button", title, "aria-label": title, "aria-haspopup": "true", onmousedown: noSteal, onclick: () => { keep(); const open = panel.hidden; closeMenus(); panel.hidden = !open; } }, h("span", { class: "tcol" }, labelEl, bar));
      menus.push(panel);
      return h("span", { class: "tmenu" }, btn, panel);
    };
    const menus = [];
    const closeMenus = () => menus.forEach((m) => { m.hidden = true; });
    document.addEventListener("mousedown", (e) => { if (!e.target.closest || !e.target.closest(".tmenu")) closeMenus(); });
    // symbols menu
    const symPanel = h("div", { class: "tpanel symbols", hidden: true, role: "menu" }, SYMBOLS.map((c) => h("button", { class: "sym", type: "button", title: "Insert " + c, onmousedown: noSteal, onclick: () => { symPanel.hidden = true; run("insertText", c); } }, c)));
    menus.push(symPanel);
    const symMenu = h("span", { class: "tmenu" }, h("button", { class: "tool", type: "button", title: "Insert a symbol", "aria-label": "Insert a symbol", onmousedown: noSteal, onclick: () => { keep(); const open = symPanel.hidden; closeMenus(); symPanel.hidden = !open; } }, "Ω"), symPanel);
    // size: number box with - and + like Google Docs
    sizeSel = pick("Font size", FONT_STEPS.map(([pt], i) => [pt, String(i + 1)]), (v) => run("fontSize", v), "size");
    sizeSel.value = "3";
    const stepSize = (d) => { const v = Math.max(1, Math.min(7, (+sizeSel.value || 3) + d)); sizeSel.value = String(v); run("fontSize", String(v)); };
    const sep = () => h("span", { class: "tsep", "aria-hidden": "true" });
    const tools = h("div", { class: "tools", role: "toolbar", "aria-label": "Text formatting" },
      tool("undo", "Undo (Ctrl+Z)", "undo"), tool("redo", "Redo (Ctrl+Y)", "redo"), sep(),
      pick("Style", [["Normal text", "P"], ["Title", "H1"], ["Heading", "H2"], ["Subheading", "H3"], ["Quote", "BLOCKQUOTE"]], (v) => setStyle(v)), sep(),
      pick("Font", WRITE_FONTS, (v) => run("fontName", v), "font"), sep(),
      tool("−", "Smaller text", () => stepSize(-1)), sizeSel, tool("+", "Bigger text", () => stepSize(1)), sep(),
      tool("B", "Bold (Ctrl+B)", "bold", null, { style: "font-weight:800", state: "bold" }), tool("I", "Italic (Ctrl+I)", "italic", null, { style: "font-style:italic", state: "italic" }),
      tool("U", "Underline (Ctrl+U)", "underline", null, { style: "text-decoration:underline", state: "underline" }), tool("S", "Strikethrough", "strikeThrough", null, { style: "text-decoration:line-through", state: "strikeThrough" }),
      colourMenu("Text colour", h("b", { class: "tA" }, "A"), "foreColor", TEXT_COLORS, false), colourMenu("Highlight", h("span", { class: "tH" }, "✎"), "hiliteColor", MARK_COLORS, true),
      tool(h("span", {}, "x", h("sup", {}, "2")), "Superscript (Ctrl+.)", "superscript", null, { state: "superscript" }), tool(h("span", {}, "x", h("sub", {}, "2")), "Subscript (Ctrl+,)", "subscript", null, { state: "subscript" }), sep(),
      tool("left", "Align left (Ctrl+Shift+L)", "justifyLeft", null, { state: "justifyLeft" }), tool("center", "Center (Ctrl+Shift+E)", "justifyCenter", null, { state: "justifyCenter" }),
      tool("right", "Align right (Ctrl+Shift+R)", "justifyRight", null, { state: "justifyRight" }), tool("justify", "Justify (Ctrl+Shift+J)", "justifyFull", null, { state: "justifyFull" }),
      h("label", { class: "tspacing", title: "Line spacing" }, icon("spacing"), pick("Line spacing", [["Line spacing", ""], ...LINE_SPACING], (v) => spacing(v))),
      h("label", { class: "tspacing", title: "Letter spacing" }, icon("letters"), pick("Letter spacing", [["Letter spacing", ""], ...LETTER_SPACING], (v) => letters(v))), sep(),
      tool("bullets", "Bullet list (Ctrl+Shift+8)", "insertUnorderedList", null, { state: "insertUnorderedList" }), tool("numbers", "Numbered list (Ctrl+Shift+7)", "insertOrderedList", null, { state: "insertOrderedList" }),
      tool("outdent", "Decrease indent (Shift+Tab)", "outdent"), tool("indent", "Increase indent", "indent"), sep(),
      symMenu, tool("line", "Insert a line", "insertHorizontalRule"), tool("clear", "Clear formatting", "removeFormat"));
    tools.querySelectorAll(".tspacing select").forEach((s2) => { s2.addEventListener("change", () => { s2.value = ""; }); });
    const box = h("div", { class: "writer" }, tools, page, h("div", { class: "writer-foot" }, count));
    return { box, page, isEmpty: () => !page.innerText.trim(), html: () => { const d = document.createElement("div"); d.append(richClean(page.innerHTML)); return d.innerHTML.slice(0, 40000); },
      lock: () => { page.contentEditable = "false"; tools.querySelectorAll("button,select,input").forEach((el) => { el.disabled = true; }); closeMenus(); } };
  }
  function card(...kids) { return h("section", { class: "card" }, ...kids); }

  // ------------------------------------------------------------ network
  // Everything travels over ordinary secure web connections (WebSockets) to public message
  // brokers (MQTT), which pass small messages between the teacher's tab and each student.
  // Two independent brokers are used at once, so the quiz keeps working if one is down or blocked.
  // No browser-to-browser (WebRTC) links. This also works inside the Quiz Duel app.
  const BROKERS = QS.get("peerhost") ? [`ws://${QS.get("peerhost")}:${QS.get("peerport") || 9000}/`]
    : ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt"];
  const teacherAddr = (code) => "t" + cyrb53("quizduel-teacher:" + code.toUpperCase());
  const topicOf = (addr) => "quizduel/v2/" + addr;
  const dec = new TextDecoder();
  const mqStr = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  function mqPacket(head, ...parts) {
    let n = 0; for (const p of parts) n += p.length;
    const len = []; let r = n;
    do { let d = r % 128; r = Math.floor(r / 128); if (r) d |= 128; len.push(d); } while (r);
    const out = new Uint8Array(1 + len.length + n);
    out[0] = head; out.set(len, 1);
    let o = 1 + len.length; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  class Relay {
    // id = my address; key = the quiz code (messages are scrambled with it)
    constructor(id, key, on) {
      this.id = id; this.key = key; this.on = on;
      this.closed = false; this.open = false; this.seen = new Set();
      this.links = BROKERS.map((url) => ({ url, ws: null, up: false, buf: new Uint8Array(0) }));
      this.links.forEach((l) => this.connect(l));
      this.beat = setInterval(() => { for (const l of this.links) if (l.up && l.ws.readyState === 1) l.ws.send(mqPacket(0xC0)); }, 20000);
    }
    refresh() {
      const up = this.links.some((l) => l.up);
      if (up === this.open) return;
      this.open = up;
      this.on.status(up ? "online" : "reconnecting");
    }
    connect(l) {
      if (this.closed) return;
      let ws;
      try { ws = new WebSocket(l.url, "mqtt"); } catch (e) { setTimeout(() => this.connect(l), 4000); return; }
      ws.binaryType = "arraybuffer";
      l.ws = ws; l.buf = new Uint8Array(0);
      ws.onopen = () => ws.send(mqPacket(0x10, mqStr("MQTT"), [4, 2, 0, 120], mqStr("qd" + uid() + uid().slice(0, 6))));
      ws.onmessage = (e) => {
        const add = new Uint8Array(e.data), nb = new Uint8Array(l.buf.length + add.length);
        nb.set(l.buf); nb.set(add, l.buf.length); l.buf = nb;
        for (;;) {
          const buf = l.buf;
          if (buf.length < 2) return;
          let i = 1, len = 0, mul = 1, d;
          do { if (i >= buf.length) return; d = buf[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
          if (buf.length < i + len) return;
          const body = buf.subarray(i, i + len), type = buf[0] >> 4;
          l.buf = buf.slice(i + len);
          if (type === 2) {                                   // connected
            if (body[1] !== 0) { try { ws.close(); } catch (er) { /* ignore */ } return; }
            ws.send(mqPacket(0x82, [0, 1], mqStr(topicOf(this.id)), [0]));
          } else if (type === 9) { l.up = true; this.refresh(); }   // listening on my address
          else if (type === 3) {
            const tl = (body[0] << 8) | body[1];
            this.receive(dec.decode(body.subarray(2 + tl)));
          }
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => { l.up = false; this.refresh(); if (!this.closed) setTimeout(() => this.connect(l), 2500); };
    }
    receive(text) {
      let m; try { m = unseal(this.key, text); } catch (e) { return; }
      if (!m || !m.m || !m.src || this.seen.has(m.m)) return;       // the same message arrives once per broker
      this.seen.add(m.m);
      if (this.seen.size > 4000) this.seen = new Set(Array.from(this.seen).slice(-2000));
      this.on.message(m.src, m.d);
    }
    send(dst, data, keep) {                            // keep = the broker holds it for whoever listens next
      const pkt = mqPacket(keep ? 0x31 : 0x30, mqStr(topicOf(dst)), enc.encode(seal(this.key, { m: uid(), src: this.id, d: data })));
      let sent = false;
      for (const l of this.links) if (l.up && l.ws.readyState === 1) { try { l.ws.send(pkt); sent = true; } catch (e) { /* retried by caller */ } }
      return sent;
    }
    forget(dst) { const pkt = mqPacket(0x31, mqStr(topicOf(dst))); for (const l of this.links) if (l.up && l.ws.readyState === 1) { try { l.ws.send(pkt); } catch (e) { /* ignore */ } } }
    close() { this.closed = true; this.open = false; clearInterval(this.beat); for (const l of this.links) { l.up = false; try { l.ws.close(); } catch (e) { /* ignore */ } } }
  }

  // ---- teacher side
  class Host {
    constructor(code, token, payload, handlers) {
      this.code = code; this.payload = payload; this.h = handlers;
      this.addr = new Map();        // student id -> relay address
      this.pending = new Map();     // student id -> commands not yet confirmed
      this.stopped = false;
      this.relay = new Relay(teacherAddr(code), code, {
        status: (s) => { if (this.h.status) this.h.status(s); },
        message: (src, msg) => this.onData(src, msg),
      });
      this.timer = setInterval(() => { for (const sid of this.pending.keys()) this.flush(sid); }, 4000);
    }
    onData(src, msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.t === "hello") {
        if (msg.code !== this.code || typeof msg.sid !== "string") { this.relay.send(src, { t: "nope" }); return; }
        const v = this.h.admit ? this.h.admit(msg) : { ok: true };
        if (!v.ok) { this.relay.send(src, { t: "nope", why: v.why }); return; }
        this.addr.set(msg.sid, src);
        this.relay.send(src, { t: "quiz", payload: this.payload, resume: v.resume || null });
        this.flush(msg.sid);
      } else if (msg.t === "ev" && msg.ev && msg.ev.sid) {
        this.addr.set(msg.ev.sid, src);
        const graded = this.h.event(msg.ev);
        this.relay.send(src, { t: "ack", eid: msg.ev.eid, graded: graded || null });
        this.flush(msg.ev.sid);
      } else if (msg.t === "cack") {
        const q = this.pending.get(msg.sid);
        if (q) this.pending.set(msg.sid, q.filter((c) => c.id !== msg.id));
      }
    }
    // commands (unlock, let leave, a grade) are repeated until the student's page confirms them
    send(sid, cmd) {
      if (!this.pending.has(sid)) this.pending.set(sid, []);
      this.pending.get(sid).push({ id: uid(), cmd, tries: 0 });
      this.flush(sid);
    }
    flush(sid) {
      const dst = this.addr.get(sid);
      let q = this.pending.get(sid);
      if (!dst || !q || !q.length) return;
      q = q.filter((c) => c.tries++ < 75);            // give up after ~5 minutes
      this.pending.set(sid, q);
      for (const c of q) this.relay.send(dst, { t: "cmd", id: c.id, cmd: c.cmd });
    }
    stop() { this.stopped = true; clearInterval(this.timer); this.relay.close(); }
  }

  // ---- student side
  class Client {
    constructor(code, name, sid, email, key) {
      this.code = code; this.name = name; this.sid = sid || uid(); this.email = email || ""; this.key = key || "";
      this.dst = teacherAddr(code);
      this.unacked = new Map(); this.seenCmd = new Set();
      this.onCmd = null; this.onGraded = null; this.connected = false; this.closed = false;
      this.current = 0; this.frozen = false;
    }
    connect() {
      return new Promise((resolve, reject) => {
        let done = false, everOnline = false, helloTimer = null;
        const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); clearInterval(helloTimer); fn(); };
        const fail = (why) => finish(() => { this.close(); reject(new Error(why)); });
        const timer = setTimeout(() => fail(everOnline ? "notfound" : "noservice"), 12000);
        const hello = () => this.relay.send(this.dst, { t: "hello", code: this.code, sid: this.sid, name: this.name, email: this.email, key: this.key, resend: !!this.resending });
        this.relay = new Relay(`s${this.sid}${uid().slice(0, 6)}`, this.code, {
          status: (s) => {
            const was = this.connected;
            this.connected = s === "online";
            if (!this.connected) { if (was && !this.offSince) this.offSince = Date.now(); return; }
            if (this.offSince && done) {
              const gone = Math.round((Date.now() - this.offSince) / 1000);
              if (gone >= 5) setTimeout(() => this.send("res", { how: "offline", what: gone < 120 ? `${gone} seconds` : `${Math.round(gone / 60)} minutes` }), 500);
            }
            this.offSince = 0;
            everOnline = true;
            hello();                                   // also re-introduces us after a reconnect
            if (!done && !helloTimer) helloTimer = setInterval(hello, 3000);
            if (done) this.resend();
          },
          message: (src, msg) => {
            if (!msg) return;
            if (msg.t === "quiz") finish(() => { this.startPulse(); this.resume = msg.resume || null; resolve(msg.payload); });
            else if (msg.t === "nope") fail(msg.why || "wrongcode");
            else if (msg.t === "ack") {
              this.unacked.delete(msg.eid);
              if (msg.graded && this.onGraded) this.onGraded(msg.eid, msg.graded);
            } else if (msg.t === "cmd") {
              this.relay.send(this.dst, { t: "cack", sid: this.sid, id: msg.id });
              if (!this.seenCmd.has(msg.id)) { this.seenCmd.add(msg.id); if (this.onCmd) this.onCmd(msg.cmd); }
            }
          },
        });
      });
    }
    startPulse() {
      this.pulse = setInterval(() => {
        if (this.closed) return;
        this.raw({ sid: this.sid, name: this.name, type: "hb", t: Date.now(), eid: uid(), i: this.current, frozen: this.frozen });
        this.resend();
      }, 8000);
    }
    raw(ev) { if (this.relay) this.relay.send(this.dst, { t: "ev", ev }); }
    send(type, data, eid) {
      const ev = Object.assign({ sid: this.sid, name: this.name, type, t: Date.now(), eid: eid || uid(), i: this.current, frozen: this.frozen, app: IN_APP }, data || {});
      if (type === "ans" && (!this.connected || !navigator.onLine)) ev.late = true;
      this.unacked.set(ev.eid, ev);
      this.raw(ev);
      setTimeout(() => { if (this.unacked.has(ev.eid)) this.raw(ev); }, 2500);
      return ev.eid;
    }
    resend() { for (const ev of this.unacked.values()) this.raw(ev); }
    flush(ms) {
      return new Promise((res) => {
        const end = Date.now() + ms;
        const tick = () => { if (!this.unacked.size || Date.now() > end) res(); else { this.resend(); setTimeout(tick, 400); } };
        tick();
      });
    }
    close() { this.closed = true; clearInterval(this.pulse); if (this.relay) this.relay.close(); }
  }

  // ================================================================ state
  const S = { host: null, client: null, quiz: null, sets: loadSets(), teacherOk: false };
  // the teacher's saved quizzes (any subject), kept in this browser
  function loadSets() {
    let raw = store.get("md-quizzes");
    if (!Array.isArray(raw)) {
      const old = store.get("md-my-questions");                    // from the first version: one list of questions
      raw = Array.isArray(old) && old.length ? [{ id: uid(), name: "My Quiz", questions: old }] : [];
    }
    try { return raw.map((s) => ({ id: s.id, name: s.name, questions: s.questions.map(M.decProb) })); } catch (e) { return []; }
  }
  function saveSets() { store.set("md-quizzes", S.sets.map((s) => ({ id: s.id, name: s.name, questions: s.questions.map(M.encProb) }))); }

  // ================================================================ home
  // "Get the Quiz Duel app": Windows and Mac download buttons plus how to get past the first-run warning
  function appDownloads(full) {
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
    const btn = (url, label, main) => url ? h("a", { class: "btn " + (main ? "" : "ghost"), href: url, download: "" }, label)
      : h("button", { class: "btn ghost", disabled: true, title: "Not ready yet" }, label + " (coming soon)");
    const order = isMac ? [[DOWNLOADS.mac, "Download for Mac", true], [DOWNLOADS.win, "Download for Windows"]] : [[DOWNLOADS.win, "Download for Windows", true], [DOWNLOADS.mac, "Download for Mac"]];
    return h("div", { class: "app-dl" },
      h("div", { class: "row wrap" }, order.map(([u, l, m]) => btn(u, l, m))),
      DOWNLOADS.win || DOWNLOADS.mac ? null : h("p", { class: "muted small" }, "The app downloads aren't ready yet. Ask your teacher."),
      full ? h("details", { class: "small" }, h("summary", {}, "How to install"),
        h("p", {}, h("b", {}, "Windows: "), "open QuizDuel-Setup.exe. If you see \u201cWindows protected your PC\u201d, click ", h("b", {}, "More info"), " then ", h("b", {}, "Run anyway"), "."),
        h("p", {}, h("b", {}, "Mac: "), "open QuizDuel.dmg and drag Quiz Duel into Applications. The first time, right-click Quiz Duel and choose ", h("b", {}, "Open"),
          ". On newer Macs, if it's blocked: System Settings \u2192 Privacy & Security \u2192 ", h("b", {}, "Open Anyway"), ".")) : null);
  }
  function home() {
    S.preview = null;
    Lock.stop();
    MusicBar.hide();
    Refs.end();
    Focus.active = false; Focus.locked = false; document.title = APP;
    const saved = store.get("md-student");
    const resume = saved && saved.state === "sending"
      ? h("div", { class: "notice" }, `Some answers from quiz ${saved.code} haven't reached your teacher yet. `, h("button", { class: "btn small", onclick: () => rejoinStudent(saved) }, "Send them now"))
      : saved && saved.state === "quiz"
      ? h("div", { class: "notice" }, `You were in the middle of a quiz (code ${saved.code}). `,
        h("button", { class: "btn small", onclick: () => rejoinStudent(saved) }, "Rejoin it"), " ",
        h("button", { class: "btn small ghost", onclick: () => { store.del("md-student"); home(); } }, "Forget it"))
      : null;
    show(topbar(APP),
      h("main", { class: "home" },
        h("div", { class: "home-title" },
          h("div", { class: "logo big" }, "Q"),
          h("h1", {}, APP),
          h("p", { class: "muted" }, "Live quizzes for any subject. Join with a code, race a rival, and your teacher sees every answer.")),
        resume,
        h("div", { class: "role-row" },
          h("button", { class: "role", onclick: () => studentJoin() },
            h("span", { class: "role-kicker" }, "Student"), h("span", { class: "role-title" }, "Join a quiz"),
            h("span", { class: "role-sub" }, "Type your name and the code from your teacher")),
          h("button", { class: "role", onclick: teacherLogin },
            h("span", { class: "role-kicker" }, "Teacher"), h("span", { class: "role-title" }, "Run a quiz"),
            h("span", { class: "role-sub" }, "Make a quiz, share the code, watch the class live"))),
        IN_APP ? h("button", { class: "linkish", onclick: quitApp }, "Close Quiz Duel")
          : h("div", { class: "home-links" }, h("button", { class: "linkish", onclick: () => builder(true) }, "Practice alone (no teacher)"),
            h("button", { class: "linkish", onclick: () => focusSetup() }, "Start a focus session (study timer)")),
        IN_APP ? null : h("section", { class: "card home-app" }, h("h2", {}, "Get the Quiz Duel app"),
          h("p", { class: "muted" }, "Some quizzes need the app, which locks the computer during the test. Free for Windows and Mac."),
          appDownloads(true)),
        h("p", { class: "version muted small" }, "Version " + (window.QD_VERSION || "local"))));
  }

  // ================================================================ student: join
  // pre = { code, name, email } (from a link or the Quiz Duel app)
  function studentJoin(pre) {
    pre = typeof pre === "string" ? { code: pre } : (pre || {});
    const saved = store.get("qd-me") || {};
    const name = h("input", { id: "name", class: "input", maxlength: 30, autocomplete: "name", placeholder: "First and last name", value: pre.name || saved.name || "" });
    const email = h("input", { id: "email", class: "input", type: "email", maxlength: 80, autocomplete: "email", placeholder: "you@school.org", value: pre.email || saved.email || "" });
    const code = h("input", { id: "code", class: "input code-input", maxlength: 8, autocomplete: "off", autocapitalize: "characters", placeholder: "ABC123", value: pre.code || "" });
    const key = h("input", { id: "key", class: "input code-input", maxlength: 8, autocomplete: "off", autocapitalize: "characters", placeholder: "KEY123" });
    const keyRow = h("div", { class: "stack", hidden: true }, h("label", { for: "key" }, "Continue or redo key from your teacher"), key);
    const msg = h("p", { class: "msg", "aria-live": "polite" });
    const btn = h("button", { class: "btn", type: "submit" }, "Join");
    const form = h("form", { class: "stack", novalidate: true, onsubmit: (e) => { e.preventDefault(); go(); } },
      h("label", { for: "name" }, "Your name"), name,
      h("label", { for: "email" }, "Your school email"), email,
      h("label", { for: "code" }, "Quiz code"), code, keyRow, msg,
      h("div", { class: "row" }, btn, IN_APP ? h("button", { class: "btn ghost", type: "button", onclick: quitApp }, "Close Quiz Duel")
        : h("button", { class: "btn ghost", type: "button", onclick: home }, "Back")));
    show(topbar(APP, IN_APP ? "Student \u00b7 Quiz Duel app" : "Student"), h("main", { class: "narrow" }, card(h("h2", {}, "Join a quiz"), form)));
    (name.value ? (email.value ? (code.value ? btn : code) : email) : name).focus();

    async function go() {
      const nm = name.value.split(/\s+/).filter(Boolean).join(" ").slice(0, 30);
      const em = email.value.trim().toLowerCase();
      const bad = (t, el) => { msg.textContent = t; msg.className = "msg bad"; if (el) el.focus(); };
      if (!nm) return bad("Type your name.", name);
      if (!EMAIL_RE.test(em)) return bad("Type your school email, like name@school.org.", email);
      const cd = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (cd.length !== 6) return bad("The quiz code has 6 letters and numbers.", code);
      const ky = key.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      store.set("qd-me", { name: nm, email: em });
      msg.textContent = "Looking for your quiz..."; msg.className = "msg";
      btn.disabled = true;
      const old = store.get("md-student");
      const client = new Client(cd, nm, old && old.code === cd && old.email === em ? old.sid : null, em, ky);
      try {
        const payload = await client.connect();
        S.client = client;
        S.quiz = decodeQuiz(cd, payload);
        if (needsApp(S.quiz.settings) && !IN_APP) { needApp(nm, em); return; }
        client.send("join", { total: S.quiz.problems.length, email: em, key: ky || undefined });
        if (client.resume) { resumeFromTeacher(client.resume); return; }
        store.set("md-student", { state: "lobby", code: cd, name: nm, email: em, sid: client.sid });
        lobby();
      } catch (e) {
        btn.disabled = false;
        const why = e.message;
        if (why === "done" || why === "elsewhere" || why === "badkey") {
          keyRow.hidden = false;
          bad(why === "done" ? "You've already handed in this quiz. To take it again or keep going, ask your teacher for a key and type it here."
            : why === "elsewhere" ? "You already started this quiz on another computer or browser. Ask your teacher for a continue key and type it here."
            : "That key isn't right, or it was already used. Check it with your teacher.", key);
          return;
        }
        bad(why === "notfound" || why === "wrongcode"
          ? `No quiz is running with code ${cd}. Check the code, and make sure your teacher's quiz page is open and says Live.`
          : "Couldn't reach the quiz connection service. Check your internet and try again \u2014 if it keeps happening, your network may be blocking it.");
      }
    }
  }

  // a continue key: pick up where the teacher's records say this student stopped
  function resumeFromTeacher(resume) {
    const c = S.client;
    Q.reset(); Q.setup();
    for (const a of resume) {
      if (!(a.qn >= 1 && a.qn <= Q.total)) continue;
      Q.results[a.qn - 1] = { raw: a.raw || "", skipped: !!a.skipped, secs: a.secs || 0, pts: a.waiting ? null : a.pts, waiting: !!a.waiting, eid: a.eid, race: false, rt: 0, rpts: 0, counted: true };
    }
    Q.i = resume.reduce((m, a) => Math.max(m, a.qn || 0), 0);
    Q.rescore();
    Q.continued = true;
    store.set("md-student", { state: "quiz", code: c.code, name: c.name, email: c.email, sid: c.sid, i: Q.i, them: 0, youRounds: 0, themRounds: 0, started: Q.started, violations: [], results: Q.results });
    const done = Q.results.filter(Boolean).length;
    show(topbar(APP, c.name), h("main", { class: "narrow" }, card(
      h("h2", {}, "Welcome back"),
      h("p", {}, `Your teacher let you continue. ${done} of ${Q.total} questions are already handed in.`),
      h("button", { class: "btn big", onclick: () => { wipeClipboard(); c.send("start"); Q.resume(); } }, "Continue the quiz"))));
  }

  function decodeQuiz(code, payload) {
    const data = unseal(code, payload);
    return { title: data.title, settings: data.settings, problems: data.problems };   // no answers in here
  }

  // High security: the quiz only runs in the Quiz Duel app
  function needApp(nm, em) {
    const c = S.client;
    const link = appLink(c.code, nm, em);
    const help = h("div", { class: "notice app-help" },
      h("b", {}, "The app didn't open?"),
      h("ol", {},
        h("li", {}, "If you just downloaded it, install it first (or open it once), then press the button again."),
        h("li", {}, "If your browser asked, choose ", h("b", {}, "Open Quiz Duel"), " (you can tick \u201cAlways allow\u201d)."),
        h("li", {}, "Or open ", h("b", {}, "Quiz Duel"), " yourself from the desktop or Start menu (on a Mac: Applications) and type this code:")),
      h("div", { class: "bigcode mono" }, c.code));
    let left = false;
    const onBlur = () => { left = true; };
    const launch = () => { left = false; window.addEventListener("blur", onBlur, { once: true }); location.href = link;
      setTimeout(() => { window.removeEventListener("blur", onBlur); if (!left) help.classList.add("flash"); }, 3000); };
    show(topbar(APP, c.name), h("main", { class: "narrow" }, card(
      h("h2", {}, "This quiz needs the Quiz Duel app"),
      h("p", {}, secLevel(S.quiz ? S.quiz.settings : null) === "high" || !(S.quiz && S.quiz.settings.closeGames)
        ? "Your teacher set this quiz to high security, so it runs in the Quiz Duel app, which locks the computer while you work."
        : "Your teacher turned on anti-game, so this quiz runs in the Quiz Duel app. It blocks game websites and closes games like Roblox until you finish."),
      h("button", { class: "btn big", onclick: launch }, "Open the Quiz Duel app"),
      h("p", { class: "muted" }, "The app opens with your name, email and quiz code filled in. It can take a few seconds to start."),
      help,
      h("h3", {}, "Don't have the app yet?"),
      appDownloads(true))));
    c.close(); S.client = null;
    setTimeout(launch, 400);
  }

  function lobby() {
    const st = S.quiz.settings;
    const mon = h("p", { class: "mon" });
    const start = h("button", { class: "btn big", onclick: studentStart }, "Start quiz");
    const appsEl = h("div", {});
    const rules = ["+1 for each correct answer."];
    if (S.quiz.problems.some((p) => M.MATH_KINDS.includes(p.kind))) rules.push("In math answers, a sign slip (a missing negative, or > < = mixed up) still earns +1/2.");
    if (S.quiz.problems.some((p) => p.kind === "long")) rules.push("Written answers are read and graded by your teacher.");
    const level = secLevel(st);
    if (IN_APP) rules.push("You're in the Quiz Duel app: the rest of the computer is locked until you finish.");
    if (st.closeGames) rules.push("Anti-game is on: games and game websites are closed until you finish.");
    if (level === "low") rules.push("Stay on this page. If you leave it, your teacher is told.");
    else {
      if (!IN_APP) rules.push("The quiz goes full screen. Copy and paste are turned off.");
      rules.push("If you leave the quiz, it freezes and your teacher is told.");
      rules.push("Only one screen is allowed. Unplug any extra monitor.");
      rules.push("Need to leave? Press Esc — your teacher will let you out.");
    }
    if (st.rival) rules.push(`You're racing ${M.RIVALS[st.rival].name}. Be quick and careful!`);
    show(topbar(APP, S.client.name), h("main", { class: "narrow" }, card(
      h("h2", {}, `Hi ${S.client.name}!`),
      h("p", { class: "lead" }, `${S.quiz.title}  —  ${S.quiz.problems.length} questions`),
      h("ul", { class: "rules" }, rules.map((r) => h("li", {}, r))), appsEl, mon, start)));
    if (IN_APP && needsApp(st)) {                          // tell them which programs the app will close
      QDA.runningApps(level === "high" ? +st.closeApps || 0 : 0, !!st.closeGames).then((names) => {
        if (names && names.length) setKids(appsEl, h("div", { class: "notice" }, "When you start, Quiz Duel closes: ", h("b", {}, names.join(", ")), ". Save anything open in them first."));
      }).catch(() => {});
    }
    const check = () => {
      if (!locked(st)) { mon.textContent = ""; return; }
      if (!monitorCheckSupported()) { mon.textContent = "Ready."; mon.className = "mon good"; start.disabled = false; return; }
      if (extraMonitor()) { mon.textContent = "More than one screen found. Unplug the extra monitor to start."; mon.className = "mon bad"; start.disabled = true; }
      else { mon.textContent = "One screen — good to go."; mon.className = "mon good"; start.disabled = false; }
    };
    check();
    every(1500, check);
  }

  async function studentStart() {
    const st = S.quiz.settings;
    if (locked(st) && extraMonitor()) return;
    if (IN_APP && needsApp(st)) {
      try {
        const closed = await QDA.closeApps(secLevel(st) === "high" ? +st.closeApps || 0 : 0, !!st.closeGames);
        if (closed && closed.length) S.client.send("res", { how: "apps", what: closed.join(", ") });
      } catch (e) { /* keep going */ }
    }
    wipeClipboard();
    S.client.send("start");
    beginQuiz();
  }

  async function rejoinStudent(saved) {
    show(topbar(APP, saved.name), h("main", { class: "narrow" }, card(h("h2", {}, "Rejoining..."), h("p", { class: "muted" }, `Looking for quiz ${saved.code}.`))));
    const client = new Client(saved.code, saved.name, saved.sid, saved.email || "");
    client.resending = saved.state === "sending";
    try {
      const payload = await client.connect();
      S.client = client;
      S.quiz = decodeQuiz(saved.code, payload);
      if (needsApp(S.quiz.settings) && !IN_APP) { needApp(saved.name, saved.email); return; }
      Q.restore(saved);
      client.current = Q.i;
      client.send("join", { total: S.quiz.problems.length, rejoin: true, email: saved.email || "" });
      show(topbar(APP, saved.name), h("main", { class: "narrow" }, card(
        h("h2", {}, "Back in your quiz"), h("p", {}, `You're on question ${Math.max(1, Q.i)} of ${S.quiz.problems.length}. Your teacher will be told you reloaded the page.`),
        h("button", { class: "btn big", onclick: () => { wipeClipboard(); Q.resume(); } }, "Continue"))));
    } catch (e) {
      if (["done", "elsewhere", "badkey"].includes(e.message)) { store.del("md-student"); studentJoin({ code: saved.code, name: saved.name, email: saved.email }); return; }
      show(topbar(APP, saved.name), h("main", { class: "narrow" }, card(
        h("h2", {}, "Couldn't rejoin"), h("p", {}, "The quiz isn't reachable right now. Your answers are saved on this computer. Make sure your teacher's quiz page is open and you're online, then try again."),
        h("div", { class: "row" }, h("button", { class: "btn", onclick: () => rejoinStudent(saved) }, "Try again"),
          h("button", { class: "btn ghost", onclick: home }, "Home")))));
    }
  }

  // ================================================================ teacher: sign in
  function teacherLogin() {
    if (S.teacherOk) return teacherStart();
    const pw = h("input", { id: "pw", type: "password", class: "input", autocomplete: "off" });
    const msg = h("p", { class: "msg bad" });
    const btn = h("button", { class: "btn", type: "submit" }, "Sign in");
    show(topbar(APP, "Teacher"), h("main", { class: "narrow" }, card(h("h2", {}, "Teacher sign-in"),
      h("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true; msg.textContent = ""; msg.className = "msg";
        const ok = await unlockTeacher(pw.value);
        btn.disabled = false;
        if (ok) { S.teacherOk = true; teacherStart(); }
        else { msg.textContent = "Wrong password."; msg.className = "msg bad"; pw.value = ""; pw.focus(); }
      } }, h("label", { for: "pw" }, "Password"), pw, msg,
      h("div", { class: "row" }, btn, h("button", { class: "btn ghost", type: "button", onclick: home }, "Back"))))));
    pw.focus();
  }

  function teacherStart() {
    Runners.startAll();
    if (Runners.list.length) quizList(); else builder(false);
  }
  // every quiz this teacher has running (one per class period, for example)
  function quizList() {
    const rows = Runners.list.map((r) => {
      const L = r.live, n = Object.values(L.students).filter((x) => x.state !== "redone").length;
      const toGrade = Object.values(L.answers).filter((x) => x.pts === null && !x.skipped).length;
      return h("tr", {}, h("td", { class: "name" }, L.period || "\u2014"), h("td", {}, L.title), h("td", { class: "mono strong" }, L.code),
        h("td", { class: "num" }, n), h("td", { class: "num" + (toGrade ? " togr" : "") }, toGrade), h("td", {}, SECURITY[secLevel(L)] + (L.closeGames ? " + Anti-game" : "")),
        h("td", {}, h("span", { class: "pill " + (r.status === "online" ? "good" : "warn") }, r.status === "online" ? "Live" : "Connecting")),
        h("td", {}, h("button", { class: "btn small", onclick: () => dashboard(r) }, "Open")));
    });
    show(topbar(APP, "Teacher"), h("main", { class: "wide" }, card(
      h("h2", {}, "Your running quizzes"),
      h("p", { class: "muted" }, "Each quiz has its own code, so you can run one per class period at the same time. Keep this tab open: it checks every quiz's answers."),
      h("div", { class: "table-wrap" }, h("table", { class: "dash" },
        h("thead", {}, h("tr", {}, ["Class / period", "Quiz", "Code", "Students", "To grade", "Security", "", ""].map((x) => h("th", {}, x)))), h("tbody", {}, rows))),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => builder(false) }, "+ Start another quiz"),
        h("button", { class: "btn ghost", onclick: home }, "Home")))));
    every(2000, () => { if (app.querySelector("table.dash") && !document.querySelector(".ref-panel")) quizList(); });
  }

  // ================================================================ builder (teacher create / solo practice)
  function builder(solo) {
    const B = S.builderState || (S.builderState = { src: "custom", topics: M.GENERATORS.map(() => true), n: 10, diff: 2, rival: 2, cd: true, title: "", setId: null });
    let srcVal = solo ? (B.soloSrc || "builtin") : B.src;
    if (!M.BUILTIN.find((b) => b.id === B.bid)) B.bid = M.BUILTIN[0].id;
    if (!S.sets.find((s) => s.id === B.setId)) B.setId = S.sets.length ? S.sets[0].id : null;
    const src = (v, label) => h("label", { class: "radio" }, h("input", { type: "radio", name: "src", value: v, checked: srcVal === v, onchange: () => { srcVal = v; if (solo) B.soloSrc = v; else B.src = v; toggle(); } }), label);
    const topicBoxes = M.TOPIC_NAMES.map((t, i) => h("label", { class: "check" },
      h("input", { type: "checkbox", checked: B.topics[i], onchange: (e) => { B.topics[i] = e.target.checked; } }), t));
    const nIn = h("input", { type: "number", class: "input tiny", min: 1, max: 60, value: B.n, onchange: (e) => { B.n = +e.target.value || 10; } });
    const diff = [1, 2, 3].map((t) => h("label", { class: "radio inline" }, h("input", { type: "radio", name: "diff", checked: B.diff === t, onchange: () => { B.diff = t; } }), ["Easy", "Medium", "Hard"][t - 1]));
    const practiceBox = h("div", { class: "indent" },
      h("div", { class: "topics" }, topicBoxes),
      h("div", { class: "row small-gap" },
        h("button", { class: "btn small ghost", type: "button", onclick: () => { B.topics.fill(true); builder(solo); } }, "All"),
        h("button", { class: "btn small ghost", type: "button", onclick: () => { B.topics.fill(false); builder(solo); } }, "None")),
      h("div", { class: "row" }, h("span", {}, "How many"), nIn, h("span", { class: "gap" }, "Difficulty"), diff));
    const msg = h("p", { class: "msg bad" });
    const title = h("input", { class: "input", value: B.title, maxlength: 40, placeholder: "(uses the quiz's own name)", oninput: (e) => { B.title = e.target.value; } });
    const rival = [[0, "Nobody (no race)"], [1, "Rookie Ricky (slow)"], [2, "Steady Stella"], [3, "Lightning Max (fast)"]].map(([t, l]) =>
      h("label", { class: "radio" }, h("input", { type: "radio", name: "rival", checked: B.rival === t, onchange: () => { B.rival = t; } }), l));
    if (typeof B.cd !== "number") B.cd = B.cd === false ? 0 : 3;
    const cd = h("select", { class: "input", "aria-label": "Countdown", onchange: (e) => { B.cd = +e.target.value; } },
      [[0, "No countdown"], [3, "3 seconds"], [5, "5 seconds"], [10, "10 seconds"]].map(([v, t]) => h("option", { value: v, selected: B.cd === v }, t)));
    if (!B.form) B.form = { on: false, per: 5 };
    const formHint = h("p", { class: "hint", hidden: !B.form.on }, "Form layout: students scroll through a page of questions and press Next page. No race, countdown or breaks, and answers are checked when the page is handed in.");
    const perPage = h("input", { type: "number", class: "input tiny", min: 1, max: 50, value: B.form.per, "aria-label": "Questions on each page", onchange: (e) => { B.form.per = Math.max(1, Math.min(50, +e.target.value || 5)); e.target.value = B.form.per; } });
    const perRow = h("div", { class: "check wrapline", hidden: !B.form.on }, "Questions on each page", perPage);
    const layout = h("select", { class: "input", "aria-label": "Layout", onchange: (e) => { B.form.on = e.target.value === "form"; formHint.hidden = perRow.hidden = !B.form.on; } },
      h("option", { value: "one", selected: !B.form.on }, "One question at a time (race)"), h("option", { value: "form", selected: B.form.on }, "Form: pages of questions to scroll through (no race)"));
    if (!B.brk) B.brk = { on: false, every: 5, secs: 60 };
    const brkOn = h("input", { type: "checkbox", checked: B.brk.on, onchange: (e) => { B.brk.on = e.target.checked; } });
    const brkEvery = h("input", { type: "number", class: "input tiny", min: 1, max: 50, value: B.brk.every, "aria-label": "Questions between breaks", onchange: (e) => { B.brk.every = Math.max(1, Math.min(50, +e.target.value || 5)); e.target.value = B.brk.every; } });
    const brkSecs = h("input", { type: "number", class: "input tiny", min: 5, max: 900, step: 5, value: B.brk.secs, "aria-label": "Break length in seconds", onchange: (e) => { B.brk.secs = Math.max(5, Math.min(900, +e.target.value || 60)); e.target.value = B.brk.secs; } });
    if (!B.music) B.music = { on: true, groups: Object.fromEntries(M.Music.GROUPS.map(([g]) => [g, true])) };
    const musicOn = h("input", { type: "checkbox", checked: B.music.on, onchange: (e) => { B.music.on = e.target.checked; } });
    const musicGroups = M.Music.GROUPS.map(([g, label]) => h("label", { class: "check" },
      h("input", { type: "checkbox", checked: B.music.groups[g] !== false, onchange: (e) => { B.music.groups[g] = e.target.checked; } }), label));
    // reference pages + notes the students may look at during the quiz
    if (!Array.isArray(B.refs)) B.refs = [];
    const refList = h("div", { class: "ref-rows" });
    const drawRefs = () => setKids(refList, B.refs.map((r, i) => h("div", { class: "ref-row" },
      h("input", { class: "input", maxlength: 40, placeholder: "Name, like Britannica: Immigration", value: r.title, "aria-label": `Reference ${i + 1} name`, oninput: (e) => { r.title = e.target.value; } }),
      h("input", { class: "input", maxlength: 400, placeholder: "https://...", value: r.url, "aria-label": `Reference ${i + 1} web address`, oninput: (e) => { r.url = e.target.value.trim(); } }),
      h("button", { class: "btn small ghost", type: "button", "aria-label": `Remove reference ${i + 1}`, onclick: () => { B.refs.splice(i, 1); drawRefs(); } }, "Remove"))),
      B.refs.length < 5 ? h("button", { class: "btn small ghost", type: "button", onclick: () => { B.refs.push({ title: "", url: "" }); drawRefs(); } }, "+ Add a web page") : null);
    drawRefs();
    const refWin = h("input", { type: "checkbox", checked: !!B.refWin, onchange: (e) => { B.refWin = e.target.checked; } });
    const refNotes = h("textarea", { class: "input", rows: 3, maxlength: 6000, placeholder: "Optional: your own notes, a formula sheet, a word bank...", "aria-label": "Reference notes", value: B.refNotes || "", oninput: (e) => { B.refNotes = e.target.value; } });
    const sol = h("input", { type: "checkbox", checked: solo ? true : !!B.sol, onchange: (e) => { B.sol = e.target.checked; } });
    if (!SECURITY[B.security]) B.security = "medium";
    if (B.closeApps === undefined) B.closeApps = 1;
    if (B.closeGames === undefined) B.closeGames = false;
    const SEC_HELP = {
      low: "Any browser. Nothing is locked; your log shows when a student leaves the quiz page.",
      medium: "Any browser. Full screen, no copy/paste, one screen only. The quiz freezes if a student leaves it, until you unlock them.",
      high: "Students must use the Quiz Duel app. It locks the whole computer: no other apps or websites, screenshots blocked, music apps closed. Students without the app get a download link.",
    };
    const secHelp = h("p", { class: "hint" }, SEC_HELP[B.security]);
    const closeSel = h("select", { class: "input", "aria-label": "Programs to close", onchange: (e) => { B.closeApps = +e.target.value; } },
      [[1, "Close music apps (Spotify, Apple Music, VLC, Discord...)"], [2, "Close music apps and other browsers (stops YouTube tabs too)"], [0, "Don't close any apps (remote-control apps are always closed)"]]
        .map(([v, t]) => h("option", { value: v, selected: B.closeApps === v }, t)));
    const gamesBox = h("input", { type: "checkbox", checked: !!B.closeGames, "aria-label": "Close games", onchange: (e) => { B.closeGames = e.target.checked; } });
    const closeRow = h("label", { class: "field indent", hidden: B.security !== "high" }, h("span", {}, "In the app, before the quiz starts"), closeSel);
    const gamesHelp = h("p", { class: "hint indent" });
    const paintGames = () => { gamesHelp.textContent = !B.closeGames ? "" : B.security === "high"
      ? "The app also closes games and game launchers and keeps them closed."
      : "Students will need the Quiz Duel app for this quiz (a website can't block games). The app blocks every other website, including game sites like Poki and CrazyGames, and closes games like Roblox and Minecraft. Your " + SECURITY[B.security] + " security rules still apply."; };
    gamesBox.onchange = (e) => { B.closeGames = e.target.checked; paintGames(); };
    paintGames();
    const gamesRow = h("div", {}, h("label", { class: "check" }, gamesBox, " ", h("b", {}, "Anti-game"), ": block game websites (Poki, CrazyGames...) and close games (Roblox, Minecraft, Fortnite, Steam...)"), gamesHelp);
    const secSel = h("select", { class: "input", "aria-label": "Security", onchange: (e) => { B.security = e.target.value; secHelp.textContent = SEC_HELP[B.security]; closeRow.hidden = B.security !== "high"; paintGames(); } },
      Object.entries(SECURITY).map(([v, t]) => h("option", { value: v, selected: B.security === v }, t)));
    if (B.period === undefined) B.period = "";
    const period = h("input", { class: "input", value: B.period, maxlength: 30, placeholder: "e.g. Period 3", "aria-label": "Class or period", oninput: (e) => { B.period = e.target.value; } });

    // my quizzes (any subject)
    const plural = (n) => `${n} question${n === 1 ? "" : "s"}`;
    const setSel = h("select", { class: "input", "aria-label": "Which quiz", onchange: (e) => { B.setId = e.target.value; } },
      S.sets.map((s) => h("option", { value: s.id, selected: s.id === B.setId }, `${s.name}  (${plural(s.questions.length)})`)));
    const importer = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.questions)) throw new Error("not a quiz file");
        const simple = data.app !== "quiz-duel" && data.questions.some((x) => x && x.type);      // the plain format an AI writes
        const set = { id: uid(), name: String(data.name || "Imported quiz").slice(0, 40), questions: simple ? aiQuestions(data).questions : data.questions.map(M.decProb) };
        if (!set.questions.length) throw new Error("no questions");
        S.sets.push(set); saveSets(); B.setId = set.id; B.src = "custom"; builder(false);
      } catch (er) { msg.textContent = "That file isn't a Quiz Duel quiz."; }
    } });
    const newQuiz = () => { const set = { id: uid(), name: "New quiz", questions: [] }; S.sets.push(set); saveSets(); B.setId = set.id; B.src = "custom"; editor(set); };
    const customBox = solo ? h("div", { class: "indent" },
      S.sets.length ? h("div", { class: "row small-gap" }, setSel) : h("p", { class: "muted" }, "None yet."))
      : h("div", { class: "indent" },
      S.sets.length ? h("div", { class: "row small-gap" }, setSel,
        h("button", { class: "btn small ghost", type: "button", onclick: () => editor(S.sets.find((s) => s.id === B.setId)) }, "Edit questions")) : h("p", { class: "muted" }, "You haven't written a quiz yet."),
      h("div", { class: "row small-gap" },
        h("button", { class: "btn small", type: "button", onclick: newQuiz }, "+ New quiz"),
        h("button", { class: "btn small ghost", type: "button", onclick: () => importer.click() }, "Import a quiz file"),
        h("button", { class: "btn small ghost", type: "button", onclick: () => aiQuiz(false) }, "Make a quiz with AI"), importer));

    // ready-made quizzes that come with the site
    const plural2 = (n) => `${n} question${n === 1 ? "" : "s"}`;
    const builtinSel = h("select", { class: "input", "aria-label": "Which ready-made quiz", onchange: (e) => { B.bid = e.target.value; } },
      M.BUILTIN.map((b) => h("option", { value: b.id, selected: b.id === B.bid }, `${b.name}  (${plural2(b.questions.length)})`)));
    const builtinBox = h("div", { class: "indent" }, h("div", { class: "row small-gap" }, builtinSel,
      solo ? null : h("button", { class: "btn small ghost", type: "button", onclick: () => {
        const b = M.BUILTIN.find((x) => x.id === B.bid);
        const set = { id: uid(), name: b.name.slice(0, 40), questions: b.questions.map((q) => M.decProb(M.encProb(q))) };
        S.sets.push(set); saveSets(); B.setId = set.id; B.src = "custom"; editor(set);
      } }, "Copy to My quizzes to change it")));

    function toggle() {
      for (const [box, on] of [[practiceBox, srcVal === "practice"], [customBox, srcVal === "custom"], [builtinBox, srcVal === "builtin"]]) {
        box.classList.toggle("disabled", !on);
        box.querySelectorAll("input,button,select").forEach((el) => { el.disabled = !on; });
      }
    }

    async function build(previewOnly) {
      let probs, ttl;
      if (srcVal === "exam") { probs = M.examProblems(); ttl = "Math Final Exam"; }
      else if (srcVal === "builtin") {
        const b = M.BUILTIN.find((x) => x.id === B.bid);
        probs = b.questions.map((q) => M.decProb(M.encProb(q))); ttl = b.name;
      } else if (srcVal === "custom") {
        const set = S.sets.find((s) => s.id === B.setId);
        if (!set || !set.questions.length) { msg.textContent = "Write at least one question first (New quiz or Edit questions)."; return; }
        probs = set.questions.map((p) => M.decProb(M.encProb(p))); ttl = set.name;
      } else {
        const gens = M.GENERATORS.filter((g, i) => B.topics[i]);
        if (!gens.length) { msg.textContent = "Pick at least one topic."; return; }
        probs = M.buildQueue(B.diff, gens, Math.max(1, Math.min(60, B.n || 10)));
        ttl = "Math Practice";
      }
      const refs = [];
      for (const r of B.refs) {
        if (!r.url && !r.title) continue;
        const u = Refs.parse(r.url);
        if (!u) { msg.textContent = `Reference page "${r.title || r.url}": the web address must start with https://`; return; }
        if (Refs.media(u)) { msg.textContent = `Reference page "${r.title || u.hostname}": music and video websites can't be used as reference pages.`; return; }
        refs.push({ title: (r.title || u.hostname).slice(0, 40), url: u.href });
      }
      const settings = { refs, refWin: !!B.refWin, refNotes: (B.refNotes || "").trim().slice(0, 6000), rival: B.form.on ? 0 : B.rival, form: !!B.form.on, perPage: B.form.per, countdown: B.cd, breakEvery: B.brk.on ? B.brk.every : 0, breakSecs: B.brk.secs,
        music: B.music.on ? M.Music.GROUPS.map(([g]) => g).filter((g) => B.music.groups[g] !== false) : [], show_solutions: solo ? true : !!B.sol, security: solo ? "low" : B.security, closeApps: B.security === "high" ? B.closeApps : 0, closeGames: !solo && !!B.closeGames };
      if (previewOnly === true) { preview((B.title || "").trim() || ttl, settings, probs, () => builder(false)); return; }
      if (solo) {
        S.client = null;
        S.quiz = { title: ttl, settings, problems: probs };     // practice alone: answers stay on this computer
        beginQuiz();
        return;
      }
      const code = randomCode(6, CODE_CHARS);
      const pin = randomCode(6, "0123456789");
      settings.unlock = unlockHash(code, pin);
      const title = (B.title || "").trim() || ttl;
      // students get the questions (and the choices) only - never the answers or solutions
      const studentView = probs.map((p) => { const d = { topic: p.topic, q: p.q, kind: p.kind, base: p.base }; if (p.graph) d.graph = p.graph; if (p.options) d.options = p.options; if (p.tools) d.tools = p.tools; return d; });
      const live = { code, pin, title, period: (B.period || "").trim().slice(0, 30), made: Date.now(), total: probs.length, show: settings.show_solutions, security: settings.security, closeApps: settings.closeApps, closeGames: settings.closeGames,
        payload: seal(code, { title, settings, problems: studentView }), full: probs.map(M.encProb), token: uid(), graded: {}, answers: {}, students: {}, log: [], seen: [], keys: {} };
      const run = Runners.add(live);
      dashboard(run);
    }

    show(topbar(APP, solo ? "Practice alone" : "Teacher — create a quiz"), h("main", { class: "wide" },
      h("div", { class: "grid2" },
        card(h("h3", {}, "Questions"),
          src("custom", solo ? "My practice quizzes" : "My quizzes — any subject"), customBox,
          solo ? h("div", { class: "row small-gap indent" }, h("button", { class: "btn small", type: "button", onclick: () => aiQuiz(true) }, "Make a practice quiz with your own AI")) : null,
          src("builtin", "Ready-made quizzes"), builtinBox,
          src("practice", "Math practice problems — pick topics:"),
          practiceBox,
          solo ? null : src("exam", "The real Math Final Exam — all 18 problems, in order")),
        card(h("h3", {}, "Settings"),
          solo ? null : h("label", { class: "field" }, h("span", {}, "Class or period (so you can run one quiz per period)"), period),
          solo ? null : h("label", { class: "field" }, h("span", {}, "Name shown to students"), title),
          h("label", { class: "field" }, h("span", {}, "Layout"), layout), perRow, formHint,
          h("p", { class: "label" }, "Race against"), rival,
          h("label", { class: "field" }, h("span", {}, "Countdown before each question"), cd),
          h("div", { class: "check wrapline" }, h("label", { class: "check" }, brkOn, "Break every"), brkEvery, "questions, for", brkSecs, "seconds"),
          h("label", { class: "check" }, musicOn, "Students may play focus sounds (music bar at the bottom of the quiz)"),
          h("div", { class: "indent music-groups" }, musicGroups),
          h("p", { class: "hint indent" }, "Only these built-in sounds can be played: no lyrics, nothing from outside the quiz."),
          h("p", { class: "label" }, "Reference pages students may open during the quiz"), refList,
          h("p", { class: "hint" }, "Students get a References button. The page opens inside the quiz and is held to that one website. Sound can't start by itself there, and music and video websites are refused."),
          h("label", { class: "check" }, refWin, "Also let students open a reference in its own window (weaker: other websites and sound can't be blocked there)"),
          h("label", { class: "field" }, h("span", {}, "Reference notes (shown next to the pages)"), refNotes),
          solo ? null : h("label", { class: "check" }, sol, "Show the answer + explanation after each question"),
          solo ? null : h("label", { class: "field" }, h("span", {}, "Security"), secSel), solo ? null : secHelp, solo ? null : closeRow, solo ? null : gamesRow)),
      msg,
      h("div", { class: "row" }, h("button", { class: "btn big", onclick: () => build(false) }, solo ? "Start practice" : "Create quiz & get code"),
        solo ? null : h("button", { class: "btn ghost", onclick: () => build(true), title: "Go through the quiz exactly like a student. Nothing is recorded." }, "Preview as a student"),
        h("button", { class: "btn ghost", onclick: home }, "Back"),
        solo ? null : h("div", { class: "spacer" }), solo ? null : h("button", { class: "btn ghost", onclick: focusTeacher }, "Set up a focus session"))));
    toggle();
  }

  // ================================================================ quiz from a document, with the teacher's own AI assistant
  // The site has no AI of its own. It writes the instructions; the teacher gives them to any AI assistant together
  // with a document or photo, and pastes the answer back here.
  function aiPrompt(n, level) {
    return `Turn the material I give you (pasted text, a document, or a photo) into a quiz with about ${n} questions${level ? ` for ${level}` : ""}.

Rules:
- Use only facts that are in my material. Do not add outside facts. If the material is a study guide that only lists topics, write questions that ask about those topics and keep every answer generally accepted and simple.
- Mix the question types. Mostly "choice", some "short" and "yesno", and 2 to 4 "long" questions for the big ideas.
- Wrong choices must be clearly wrong but believable. Never use "all of the above".
- Keep every question clear enough to answer without seeing the material.
- "explain" is one or two sentences that teach why the answer is right.

Reply with ONLY one JSON object in exactly this shape, and nothing before or after it:
{
  "name": "Short quiz name (at most 40 characters)",
  "questions": [
    { "type": "choice", "q": "Question text", "options": ["A", "B", "C", "D"], "answer": "exact text of the correct option", "explain": "why" },
    { "type": "yesno", "q": "A yes-or-no question", "answer": "yes", "explain": "why" },
    { "type": "short", "q": "A question answered with a word or short phrase", "answers": ["accepted answer", "another spelling that is also right"], "explain": "why" },
    { "type": "long", "q": "A question answered in a few sentences", "model": "A model answer the teacher can grade against" },
    { "type": "number", "q": "A math question with one numeric answer", "answer": "12.5", "explain": "the steps" }
  ]
}`;
  }
  // plain AI format -> quiz questions. Anything that can't be understood is skipped and counted.
  function aiQuestions(data) {
    const out = [], skipped = [];
    const str = (v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
    (Array.isArray(data.questions) ? data.questions : []).slice(0, 100).forEach((x, i) => {
      const bad = (why) => skipped.push(`Question ${i + 1}: ${why}`);
      if (!x || typeof x !== "object") return bad("not a question");
      const q = str(x.q || x.question).slice(0, 2000), type = str(x.type).toLowerCase().replace(/[^a-z]/g, "");
      if (!q) return bad("no question text");
      const explain = str(x.explain || x.explanation).slice(0, 2000);
      const p = { topic: "Question", q, sol: explain, teacherSol: !!explain };
      if (["choice", "multiplechoice", "mc"].includes(type)) {
        const options = (Array.isArray(x.options) ? x.options : []).map(str).filter(Boolean).slice(0, 8);
        if (options.length < 2) return bad("needs at least two choices");
        let k = typeof x.answer === "number" ? x.answer : options.findIndex((o) => M.normText(o) === M.normText(str(x.answer)));
        if (k < 0 && /^[a-h]$/i.test(str(x.answer))) k = str(x.answer).toLowerCase().charCodeAt(0) - 97;
        if (!(k >= 0 && k < options.length)) return bad("the correct choice isn't one of the options");
        Object.assign(p, { kind: "choice", options, ans: k, base: BASE_TIME.choice });
      } else if (["yesno", "truefalse", "boolean"].includes(type)) {
        const a = str(x.answer).toLowerCase(), yes = ["yes", "true", "y", "t"].includes(a), no = ["no", "false", "n", "f"].includes(a);
        if (!yes && !no) return bad("the answer must be yes or no");
        Object.assign(p, { kind: "yesno", ans: yes ? "yes" : "no", base: BASE_TIME.yesno });
      } else if (["short", "shortanswer", "text", "fillin", "fillintheblank"].includes(type)) {
        const answers = (Array.isArray(x.answers) ? x.answers : [x.answer]).map(str).filter(Boolean).slice(0, 12);
        if (!answers.length) return bad("no accepted answer");
        Object.assign(p, { kind: "text", ans: answers, base: BASE_TIME.text });
      } else if (["long", "longanswer", "essay", "written", "paragraph"].includes(type)) {
        Object.assign(p, { kind: "long", ans: null, sol: str(x.model || x.answer || x.explain).slice(0, 3000), base: BASE_TIME.long });
        p.teacherSol = !!p.sol;
      } else if (["number", "math", "numeric"].includes(type)) {
        const a = str(x.answer);
        try { [p.kind, p.ans] = M.parseAnswer(a, null); p.base = BASE_TIME.math; }
        catch (e) { if (!a) return bad("no answer"); Object.assign(p, { kind: "text", ans: [a], base: BASE_TIME.text }); }
      } else return bad(`unknown type "${str(x.type)}"`);
      if (!p.sol && p.kind !== "long") p.sol = `The correct answer is ${M.answerText(p)}.`;
      out.push(p);
    });
    return { name: str(data.name).slice(0, 40) || "AI quiz", questions: out, skipped };
  }
  function aiParse(text) {
    const t = String(text || "").replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* try the untouched text below */ }
    const raw = String(text || ""), a2 = raw.indexOf("{"), b2 = raw.lastIndexOf("}");
    try { return JSON.parse(raw.slice(a2, b2 + 1)); } catch (e) { return null; }
  }
  // quiz from a document using the person's own AI (copy the instructions, paste the answer back)
  function aiQuiz(solo) {
    let n = 15;
    const level = h("input", { class: "input", maxlength: 40, placeholder: "For example: 7th grade social studies", "aria-label": "Grade or class", oninput: () => paint() });
    const count = h("select", { class: "input", "aria-label": "How many questions", onchange: (e) => { n = +e.target.value; paint(); } }, [10, 15, 20, 30].map((v) => h("option", { value: v, selected: v === n }, `${v} questions`)));
    const prompt = h("textarea", { class: "input mono small", rows: 9, readonly: true, "aria-label": "Instructions for the AI" });
    const answer = h("textarea", { class: "input mono small", rows: 9, placeholder: 'Paste the AI’s whole answer here. It starts with { and ends with }', "aria-label": "The AI's answer" });
    const copied = h("span", { class: "muted small" }), msg = h("p", { class: "msg" });
    const paint = () => { prompt.value = aiPrompt(n, level.value.trim()); copied.textContent = ""; };
    const copy = () => { (navigator.clipboard ? navigator.clipboard.writeText(prompt.value) : Promise.reject()).then(() => { copied.textContent = "Copied."; }, () => { prompt.select(); copied.textContent = "Select all of it and copy by hand."; }); };
    // turns the AI's JSON into a quiz
    const finish = (text, where) => {
      const data = aiParse(text);
      if (!data || !Array.isArray(data.questions)) { where.className = "msg bad"; where.textContent = "I can't read that answer. Paste the AI's whole answer, from the first { to the last }. If it added other text, ask it to reply with only the JSON."; return false; }
      const got = aiQuestions(data);
      if (!got.questions.length) { where.className = "msg bad"; where.textContent = "No usable questions in that answer. " + got.skipped.slice(0, 3).join(" "); return false; }
      const set = { id: uid(), name: got.name, questions: got.questions, mine: !!solo };
      S.sets.push(set); saveSets();
      if (solo) { practiceSet(set); return true; }
      if (S.builderState) { S.builderState.src = "custom"; S.builderState.setId = set.id; }
      editor(set, `Made ${got.questions.length} question${got.questions.length === 1 ? "" : "s"}` + (got.skipped.length ? `, skipped ${got.skipped.length} that couldn't be read` : "") + ". Read every question and answer before you use it: AI makes mistakes.");
      return true;
    };
    const make = () => finish(answer.value, msg);
    const ownAi = h("ol", { class: "rules ai-steps" },
      h("li", {}, h("b", {}, "Copy these instructions."), prompt,
        h("div", { class: "row small-gap" }, h("button", { class: "btn small", type: "button", onclick: copy }, "Copy the instructions"), copied)),
      h("li", {}, h("b", {}, "Paste them into your AI assistant"), " (Claude, ChatGPT, Gemini...), and add your material in the same message: paste the text, or attach the document or a photo of the page."),
      h("li", {}, h("b", {}, "Copy the AI's answer and paste it here."), answer, msg,
        h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: make }, solo ? "Start practicing" : "Create the quiz"))));

    show(topbar(APP, solo ? "Practice with your own AI" : "Teacher — quiz from a document"), h("main", { class: "wide" },
      card(h("h2", {}, solo ? "Make a practice quiz with your own AI" : "Make a quiz with AI"),
        h("p", { class: "muted" }, solo ? "Use any AI assistant you have (Claude, ChatGPT, Gemini...) to turn your notes or a study guide into a practice quiz for yourself."
          : "Use any AI assistant you have (Claude, ChatGPT, Gemini...) to turn a study guide, notes or a reading into a quiz. You check every question in the editor before using it."),
        h("div", { class: "row small-gap" }, count, h("div", { class: "grow" }, level)),
        ownAi,
        h("div", { class: "row" }, h("button", { class: "btn ghost", type: "button", onclick: () => builder(!!solo) }, "Back")),
        solo ? null : h("p", { class: "hint" }, "Only use material you're allowed to share, and no student names or grades."))));
    paint();
  }
  // practice alone with a quiz the student made
  function practiceSet(set) {
    S.client = null;
    S.quiz = { title: set.name, settings: { refs: [], rival: 0, countdown: 0, music: M.Music.GROUPS.map(([g]) => g), show_solutions: true, security: "low" }, problems: set.questions.map((p) => M.decProb(M.encProb(p))) };
    beginQuiz();
  }

  // ================================================================ focus sessions (study timer)
  // rules: focus minutes, break minutes, rounds, pauses allowed, longest pause (seconds)
  const FOCUS_DEFAULT = { focus: 25, brk: 5, rounds: 4, pauses: 3, pauseSecs: 60 };
  const FOCUS_LIMITS = { focus: [1, 120], brk: [1, 30], rounds: [1, 12], pauses: [0, 10], pauseSecs: [10, 600] };
  const FOCUS_KEYS = ["focus", "brk", "rounds", "pauses", "pauseSecs"];
  const focusCheck = (body) => cyrb53("qd-focus:" + body).slice(-3).toUpperCase();
  // The code also carries a scrambled copy of the teacher's end code, so only the teacher can stop a session early.
  const focusPinHash = (pin, body) => cyrb53(`qd-focus-pin:${pin}:${body}`).slice(-4).toUpperCase();
  // After the end-code part, optional extras (all covered by the check letters, so they can't be removed):
  //   -G / -M / -H / -GM / -GH   anti-game, Medium or High security (none = Low)
  //   -Sxx                        which focus music the teacher allows (a bit for each kind of music; S00 = none)
  const FOCUS_ALL_MUSIC = () => (1 << M.Music.GROUPS.length) - 1;
  function focusMusicBits(groups) { return M.Music.GROUPS.reduce((b, [g], i) => b | ((groups || []).includes(g) ? 1 << i : 0), 0); }
  function focusMusicGroups(bits) { return M.Music.GROUPS.filter((_, i) => bits & (1 << i)).map(([g]) => g); }
  function focusCode(r) {
    const nums = FOCUS_KEYS.map((k) => r[k]).join("-");
    const flags = (r.games ? "G" : "") + (r.sec === "high" ? "H" : r.sec === "medium" ? "M" : "");
    const bits = Array.isArray(r.music) ? focusMusicBits(r.music) : FOCUS_ALL_MUSIC();
    const body = nums + "-" + focusPinHash(r.pin, nums) + (flags ? "-" + flags : "") + (bits !== FOCUS_ALL_MUSIC() ? "-S" + bits.toString(16).toUpperCase().padStart(2, "0") : "");
    return body + "-" + focusCheck(body);
  }
  function focusParse(text) {
    const m = /^(\d{1,3})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{2,3})-([0-9A-F]{4})(?:-(G?[MH]?))?(?:-S([0-9A-F]{2}))?-([0-9A-F]{3})$/.exec(String(text || "").toUpperCase().replace(/[^0-9A-Z-]/g, ""));
    if (!m) return null;
    const body = m.slice(1, 7).join("-") + (m[7] ? "-" + m[7] : "") + (m[8] ? "-S" + m[8] : "");
    if (focusCheck(body) !== m[9]) return null;
    const r = {}; FOCUS_KEYS.forEach((k, i) => { r[k] = +m[i + 1]; });
    r.pinHash = m[6]; r.body = m.slice(1, 6).join("-");
    const flags = m[7] || "";
    r.games = flags.includes("G"); r.sec = flags.includes("H") ? "high" : flags.includes("M") ? "medium" : "low";
    r.music = focusMusicGroups(m[8] ? parseInt(m[8], 16) : FOCUS_ALL_MUSIC());
    return FOCUS_KEYS.every((k) => r[k] >= FOCUS_LIMITS[k][0] && r[k] <= FOCUS_LIMITS[k][1]) ? r : null;
  }
  const FOCUS_SEC_HELP = {
    low: "Leaving the session page is counted and shown at the end.",
    medium: "Full screen. Leaving covers the timer with a warning until the student comes back, and it's counted.",
    high: "Runs in the Quiz Duel app with the computer locked like a High quiz: other apps and websites blocked, music apps closed.",
  };
  function focusFields(r, onchange, disabled) {
    const labels = { focus: "Focus time (minutes)", brk: "Break (minutes)", rounds: "Focus rounds, then it stops", pauses: "Pauses allowed", pauseSecs: "Longest pause (seconds)" };
    const inputs = {};
    const el = h("div", { class: "focus-fields" }, FOCUS_KEYS.map((k) => {
      inputs[k] = h("input", { type: "number", class: "input", min: FOCUS_LIMITS[k][0], max: FOCUS_LIMITS[k][1], value: r[k], disabled: !!disabled, "aria-label": labels[k],
        onchange: (e) => { r[k] = Math.max(FOCUS_LIMITS[k][0], Math.min(FOCUS_LIMITS[k][1], Math.round(+e.target.value) || FOCUS_DEFAULT[k])); e.target.value = r[k]; if (onchange) onchange(); } });
      return h("label", { class: "field" }, h("span", {}, labels[k]), inputs[k]);
    }));
    return { el, set(v, lock) { FOCUS_KEYS.forEach((k) => { r[k] = v[k]; inputs[k].value = v[k]; inputs[k].disabled = !!lock; }); } };
  }
  // teacher: choose the rules, get a code (and link) to share
  function focusTeacher() {
    const r = Object.assign({}, FOCUS_DEFAULT, store.get("qd-focus-teacher") || {});
    if (!/^\d{6}$/.test(r.pin || "")) r.pin = randomCode(6, "0123456789");
    if (!["low", "medium", "high"].includes(r.sec)) r.sec = "low";
    if (!Array.isArray(r.music)) r.music = M.Music.GROUPS.map(([g]) => g);
    const secHelp = h("p", { class: "hint" }, FOCUS_SEC_HELP[r.sec]);
    const pinIn = h("input", { class: "input tiny mono", inputmode: "numeric", maxlength: 6, value: r.pin, "aria-label": "Teacher end code", onchange: (e) => { const v = e.target.value.replace(/\D/g, ""); if (v.length === 6) r.pin = v; e.target.value = r.pin; paint(); } });
    const codeEl = h("p", { class: "bigcode focus-code" }), linkEl = h("p", { class: "mono small focus-link" }), msg = h("span", { class: "muted small" });
    const paint = () => { store.set("qd-focus-teacher", r); codeEl.textContent = focusCode(r); linkEl.textContent = `${BASE_URL}?focus=${focusCode(r)}`; msg.textContent = ""; };
    const copy = (text) => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { msg.textContent = "Copied."; }, () => { msg.textContent = "Couldn't copy \u2014 select it and copy by hand."; }); };
    const fields = focusFields(r, paint);
    show(topbar(APP, "Teacher \u2014 focus session"), h("main", { class: "narrow" },
      card(h("h2", {}, "Focus session rules"),
        h("p", { class: "muted" }, "Students study against a timer: focus, short break, repeat. Set the rules, then share the code or the link. A student who uses your code can't change the rules."),
        fields.el,
        h("div", { class: "check wrapline" }, h("b", {}, "Teacher end code"), pinIn, h("span", { class: "muted" }, "6 digits. Keep it secret.")),
        h("p", { class: "hint" }, "Students on your rules can't end the session themselves. It stops after the last round, or when you type this code on their screen."),
        h("label", { class: "field" }, h("span", {}, "Security"),
          h("select", { class: "input", "aria-label": "Focus security", onchange: (e) => { r.sec = e.target.value; secHelp.textContent = FOCUS_SEC_HELP[r.sec]; paint(); } },
            ["low", "medium", "high"].map((v) => h("option", { value: v, selected: (r.sec || "low") === v }, SECURITY[v])))),
        secHelp,
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!r.games, "aria-label": "Focus anti-game", onchange: (e) => { r.games = e.target.checked; paint(); } }),
          " ", h("b", {}, "Anti-game"), ": students can't open games or game websites during the session"),
        h("p", { class: "hint" }, "With anti-game on, the session runs in the Quiz Duel app (a website can't block games). The app blocks every website and closes games like Roblox, Minecraft and Fortnite until the session ends."),
        h("p", { class: "label" }, "Focus music students can play"),
        h("div", { class: "checks" }, M.Music.GROUPS.map(([g, label]) => h("label", { class: "check" },
          h("input", { type: "checkbox", checked: r.music.includes(g), "aria-label": "Music: " + label, onchange: (e) => { r.music = M.Music.GROUPS.map(([x]) => x).filter((x) => x === g ? e.target.checked : r.music.includes(x)); paint(); } }), " " + label))),
        h("p", { class: "hint" }, "Students get one playlist of all the music you tick, playing one track after another and starting again at the end. They can also pick a single track, or turn it off.")),
      card(h("h3", {}, "Share with students"), h("p", { class: "label" }, "Focus code"), codeEl, h("p", { class: "label" }, "Or send this link"), linkEl,
        h("div", { class: "row" }, h("button", { class: "btn", onclick: () => copy(focusCode(r)) }, "Copy the code"), h("button", { class: "btn ghost", onclick: () => copy(linkEl.textContent) }, "Copy the link"), msg),
        h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => focusSetup(focusCode(r)) }, "Try it yourself"), h("button", { class: "btn ghost", onclick: () => builder(false) }, "Back")))));
    paint();
  }
  // student: start a session (with a teacher's code the rules are fixed)
  function focusSetup(prefill, prefillMine) {
    if (prefillMine) store.set("qd-focus-mine", Object.assign({}, FOCUS_DEFAULT, prefillMine));
    const r = Object.assign({}, FOCUS_DEFAULT, store.get("qd-focus-mine") || {});
    let locked = false;
    const fields = focusFields(r, () => store.set("qd-focus-mine", r));
    const note = h("p", { class: "msg" });
    const code = h("input", { id: "focus-code", class: "input mono", autocomplete: "off", maxlength: 40, placeholder: "25-5-4-3-60-ABC", value: prefill || "", oninput: () => check() });
    const goal = h("input", { id: "focus-goal", class: "input", maxlength: 80, autocomplete: "off", placeholder: "For example: math homework, pages 40-42" });
    const games = h("input", { type: "checkbox", "aria-label": "Block games", checked: !!(store.get("qd-focus-mine") || {}).games,
      onchange: (e) => { if (!locked) { r.games = e.target.checked; store.set("qd-focus-mine", r); } } });
    const gamesNote = h("span", { class: "muted small" });
    function check() {
      const typed = code.value.trim(), got = focusParse(typed);
      locked = !!got;
      if (got) {
        fields.set(got, true); games.checked = got.games; games.disabled = true; note.className = "msg good";
        const music = got.music.length ? M.Music.GROUPS.filter(([g]) => got.music.includes(g)).map(([, l]) => l).join(", ") : "none";
        note.textContent = `Your teacher's rules are set. Security: ${SECURITY[got.sec]}${got.games ? " + anti-game" : ""}. Music: ${music}.` + (!IN_APP && (got.games || got.sec === "high") ? " This session opens in the Quiz Duel app." : "");
      }
      else { fields.set(Object.assign({}, FOCUS_DEFAULT, store.get("qd-focus-mine") || {}), false); note.textContent = typed ? "That focus code isn't right. Check it, or clear the box to pick your own times." : ""; note.className = "msg bad";
        games.disabled = false; games.checked = !!(store.get("qd-focus-mine") || {}).games; }
      gamesNote.textContent = IN_APP ? "" : " (opens in the Quiz Duel app)";
    }
    const start = () => {
      if (code.value.trim() && !locked) { code.focus(); return; }
      const got = locked ? focusParse(code.value.trim()) : null;
      const cfg = { focus: r.focus * 60, brk: r.brk * 60, rounds: r.rounds, pauses: r.pauses, pauseSecs: r.pauseSecs, goal: goal.value.trim(), locked, code: locked ? code.value.trim().toUpperCase() : "",
        pinHash: got ? got.pinHash : "", body: got ? got.body : "", games: got ? got.games : games.checked,
        sec: got ? got.sec : "low", music: got ? got.music : M.Music.GROUPS.map(([g]) => g) };
      if ((cfg.games || cfg.sec === "high") && !IN_APP) { focusNeedApp(cfg); return; }
      focusRun(cfg);
    };
    show(topbar(APP, "Focus session"), h("main", { class: "narrow" }, card(h("h2", {}, "Focus session"),
      h("p", { class: "muted" }, "A study timer: focus with nothing else on screen, take a short break, repeat. It stops by itself after the last round."),
      h("label", { class: "field" }, h("span", {}, "Focus code from your teacher (leave empty to pick your own times)"), code), note,
      fields.el,
      h("label", { class: "field" }, h("span", {}, "What are you working on? (optional)"), goal),
      h("label", { class: "check" }, games, " ", h("b", {}, "Anti-game"), ": no games or game websites until the session ends", gamesNote),
      h("div", { class: "row" }, h("button", { class: "btn big", onclick: start }, "Start focusing"), h("button", { class: "btn ghost", onclick: home }, "Back")))));
    check();
  }
  // anti-game focus sessions run in the app: open it with the same code or the same times
  function focusNeedApp(cfg) {
    const mine = [cfg.focus / 60, cfg.brk / 60, cfg.rounds, cfg.pauses, cfg.pauseSecs].join("-");
    const link = "quizduel://focus?" + (cfg.locked ? "focus=" + encodeURIComponent(cfg.code) : "mine=" + mine + "-G");
    show(topbar(APP, "Focus session"), h("main", { class: "narrow" }, card(
      h("h2", {}, cfg.sec === "high" ? "This focus session runs in the Quiz Duel app" : "Anti-game sessions run in the Quiz Duel app"),
      h("p", {}, cfg.sec === "high" ? "Your teacher set this session to High security, so it runs in the Quiz Duel app, which locks the computer until the session ends."
        : "A website can't stop games, so this session runs in the Quiz Duel app. It blocks game websites and closes games like Roblox until the session ends."),
      h("button", { class: "btn big", onclick: () => { location.href = link; } }, "Open the Quiz Duel app"),
      h("div", { class: "notice app-help" }, h("b", {}, "The app didn't open?"),
        h("p", {}, "Open ", h("b", {}, "Quiz Duel"), " yourself, choose ", h("b", {}, "Start a focus session"), cfg.locked ? " and type this focus code:" : " and tick Anti-game."),
        cfg.locked ? h("div", { class: "bigcode mono focus-code" }, cfg.code) : null),
      h("h3", {}, "Don't have the app yet?"), appDownloads(true),
      h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => focusSetup(cfg.locked ? cfg.code : "") }, "Back")))));
    location.href = link;
  }
  const Focus = { active: false, phase: null, onLeave: null };
  function focusRun(cfg, resumed) {
    const st = resumed || { round: 1, phase: "focus", ends: Date.now() + cfg.focus * 1000, pausesLeft: cfg.pauses, remaining: 0, left: 0, focused: 0, pausesUsed: 0, lastLeft: 0, phaseStart: Date.now() };
    // a session on the teacher's rules is remembered, so reloading the page doesn't get a student out of it
    const remember = () => { if (cfg.locked) store.set("qd-focus-run", { cfg, st }); };
    const el = document.documentElement;
    if (!IN_APP && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    M.Music.chime(1);
    const gamesMsg = h("p", { class: "muted small", "aria-live": "polite" });
    const sec = cfg.sec || "low", appLock = IN_APP && (cfg.games || sec === "high");
    if (appLock) {
      const level = sec === "high" ? 1 : 0;           // High also closes other music apps (our focus music still plays)
      QDA.closeApps(level, !!cfg.games).then((closed) => {
        gamesMsg.textContent = (cfg.games ? "Anti-game is on" : "The computer is locked for this session") + (closed && closed.length ? `: closed ${closed.join(", ")}.` : ".");
      }, () => {});
      QDA.lock(true, { level, games: !!cfg.games, strict: sec === "high" }).catch(() => {});
    } else if (cfg.games) gamesMsg.textContent = "Anti-game only works in the Quiz Duel app.";
    // Medium / High: leaving covers the timer with a warning until the student comes back
    const awayCover = h("div", { class: "focus-away", hidden: true, role: "alert" }, h("h2", {}, "You left the focus session"),
      h("p", {}, "This counts as leaving. Come back and keep going \u2014 the timer didn't stop."),
      h("button", { class: "btn big", type: "button", onclick: () => { awayCover.hidden = true; if (!IN_APP && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {}); } }, "I'm back"));
    const phaseEl = h("p", { class: "focus-phase" }), timeEl = h("div", { class: "focus-time", role: "timer" }), fill = h("div", { class: "bar-fill focus-fill" });
    const dots = h("div", { class: "focus-dots", "aria-hidden": "true" });
    const info = h("p", { class: "muted focus-info", "aria-live": "polite" });
    const pauseBtn = h("button", { class: "btn big", type: "button", onclick: () => pauseOrResume() });
    const skipBtn = h("button", { class: "btn ghost", type: "button", hidden: true, onclick: () => { if (st.phase === "break") { st.ends = Date.now(); tick(); } } }, "Skip the break");
    const fsBtn = h("button", { class: "btn ghost", type: "button", hidden: true, onclick: () => { if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } }, "Back to full screen");
    let endArmed = 0;
    const pinMsg = h("span", { class: "msg bad" });
    const pinBox = h("input", { class: "input tiny mono", type: "password", inputmode: "numeric", maxlength: 6, autocomplete: "off", "aria-label": "Teacher end code" });
    const pinRow = h("form", { class: "row center focus-pin", hidden: true, onsubmit: (e) => {
      e.preventDefault();
      if (focusPinHash(pinBox.value.trim(), cfg.body) === cfg.pinHash) finish(true);
      else { pinMsg.textContent = "That's not the teacher's end code."; pinBox.value = ""; pinBox.focus(); }
    } }, h("label", {}, "Teacher end code"), pinBox, h("button", { class: "btn small", type: "submit" }, "End"), pinMsg);
    const endBtn = cfg.locked
      ? h("button", { class: "btn ghost", type: "button", onclick: () => { pinRow.hidden = !pinRow.hidden; pinMsg.textContent = ""; if (!pinRow.hidden) pinBox.focus(); } }, "Teacher: end session")
      : h("button", { class: "btn ghost", type: "button", onclick: () => {
        if (Date.now() - endArmed < 4000) { finish(true); return; }
        endArmed = Date.now(); endBtn.textContent = "Press again to end the session"; later(4000, () => { endBtn.textContent = "End session"; });
      } }, "End session");
    function pauseOrResume() {
      const now = Date.now();
      if (st.phase === "focus" && st.pausesLeft > 0) {
        st.focused += (now - st.phaseStart) / 1000; st.remaining = st.ends - now; st.phase = "pause"; st.ends = now + cfg.pauseSecs * 1000; st.pausesLeft--; st.pausesUsed++;
      } else if (st.phase === "pause") resume(now);
      remember();
      paint();
    }
    function resume(now) { st.phase = "focus"; st.ends = now + st.remaining; st.phaseStart = now; }
    function tick() {
      if (!Focus.active) return;
      const now = Date.now();
      if (now >= st.ends) {
        if (st.phase === "pause") { resume(now); M.Music.chime(1); }
        else if (st.phase === "focus") {
          st.focused += (st.ends - st.phaseStart) / 1000;
          if (st.round >= cfg.rounds) { finish(false); return; }
          st.phase = "break"; st.ends = now + cfg.brk * 1000; M.Music.chime(2);
        } else { st.round++; st.phase = "focus"; st.ends = now + cfg.focus * 1000; st.phaseStart = now; M.Music.chime(1); }
        remember();
      }
      paint();
    }
    function paint() {
      const left = Math.max(0, st.ends - Date.now()), secs = Math.ceil(left / 1000);
      const total = (st.phase === "focus" ? cfg.focus : st.phase === "break" ? cfg.brk : cfg.pauseSecs) * 1000;
      Focus.phase = st.phase;
      box.className = "card focus-card is-" + st.phase;
      phaseEl.textContent = st.phase === "focus" ? `Focus \u2014 round ${st.round} of ${cfg.rounds}` : st.phase === "break" ? "Break" : "Paused";
      timeEl.textContent = clock(secs);
      fill.style.width = Math.min(100, 100 - (st.phase === "pause" ? left : (st.phase === "focus" ? left : left)) / total * 100) + "%";
      setKids(dots, Array.from({ length: cfg.rounds }, (_, i) => h("span", { class: "focus-dot" + (i + 1 < st.round ? " done" : i + 1 === st.round ? " now" : "") })));
      pauseBtn.hidden = st.phase === "break";
      pauseBtn.textContent = st.phase === "pause" ? "Keep going" : "Pause";
      pauseBtn.disabled = st.phase === "focus" && st.pausesLeft <= 0;
      skipBtn.hidden = st.phase !== "break";
      fsBtn.hidden = IN_APP || !el.requestFullscreen || !!document.fullscreenElement;
      const pausesText = cfg.pauses === 0 ? "No pauses in this session." : `${st.pausesLeft} of ${cfg.pauses} pause${cfg.pauses === 1 ? "" : "s"} left (up to ${clock(cfg.pauseSecs)} each).`;
      info.textContent = st.phase === "pause" ? `The timer starts again by itself in ${clock(secs)}. ${st.pausesLeft} pause${st.pausesLeft === 1 ? "" : "s"} left after this one.`
        : st.phase === "break" ? `Stand up, drink some water. Round ${st.round + 1} starts by itself.`
        : pausesText + (st.left ? `  You left this page ${st.left} time${st.left === 1 ? "" : "s"}.` : "");
      document.title = `${clock(secs)} ${st.phase === "focus" ? "Focus" : st.phase === "break" ? "Break" : "Paused"} \u2014 ${APP}`;
    }
    function finish(early) {
      if (!Focus.active) return;
      awayCover.hidden = true;
      if (early && st.phase === "focus") st.focused += (Date.now() - st.phaseStart) / 1000;
      Focus.active = false; Focus.locked = false; Focus.onLeave = null; document.title = APP;
      if (appLock) QDA.lock(false).catch(() => {});
      store.del("qd-focus-run");
      MusicBar.hide();
      if (!IN_APP && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      if (!early) M.Music.chime(3);
      const mins = Math.round(st.focused / 60), done = early ? st.round - 1 : cfg.rounds;
      show(topbar(APP, "Focus session"), h("main", { class: "narrow" }, card(
        h("h2", {}, early ? "Session ended early" : "Session complete"),
        cfg.goal ? h("p", { class: "muted" }, "You worked on: " + cfg.goal) : null,
        h("div", { class: "stats" },
          h("div", { class: "stat" }, h("span", { class: "stat-v" }, mins < 1 ? "<1" : String(mins)), h("span", { class: "stat-l" }, "minutes focused")),
          h("div", { class: "stat" }, h("span", { class: "stat-v" }, `${done} / ${cfg.rounds}`), h("span", { class: "stat-l" }, "rounds finished")),
          h("div", { class: "stat" }, h("span", { class: "stat-v" }, `${st.pausesUsed} / ${cfg.pauses}`), h("span", { class: "stat-l" }, "pauses used")),
          h("div", { class: "stat" }, h("span", { class: "stat-v" }, String(st.left)), h("span", { class: "stat-l" }, "times left the page"))),
        h("div", { class: "row" }, h("button", { class: "btn", onclick: home }, "Done"), h("button", { class: "btn ghost", onclick: () => focusSetup() }, "Another session")))));
    }
    const box = h("section", { class: "card focus-card" }, phaseEl, cfg.goal ? h("p", { class: "focus-goal" }, cfg.goal) : null, timeEl,
      h("div", { class: "bar" }, fill), dots, info, gamesMsg, h("div", { class: "row center" }, pauseBtn, skipBtn, fsBtn, endBtn), pinRow, awayCover);
    show(topbar([APP, statusChip(cfg.locked ? cfg.code : "Own session")], cfg.locked ? "Focus session \u00b7 teacher's rules" : "Focus session"), h("main", { class: "narrow focus-main" }, box));
    Focus.active = true; Focus.locked = !!cfg.locked; Focus.code = cfg.code || ""; Focus.end = () => finish(true);
    Focus.onLeave = () => {
      const now = Date.now();
      if (st.phase === "focus" && now - st.lastLeft > 3000) { st.lastLeft = now; st.left++; remember(); paint(); }
      if (sec !== "low" && st.phase === "focus") awayCover.hidden = false;
    };
    if (resumed && Date.now() - st.lastLeft > 3000) { st.left++; st.lastLeft = Date.now(); }       // coming back after a reload counts as leaving the page
    remember();
    MusicBar.show(Array.isArray(cfg.music) ? cfg.music : M.Music.GROUPS.map(([g]) => g), true);
    paint();
    every(250, tick);
    Focus.repaint = paint;
  }
  document.addEventListener("fullscreenchange", () => { if (Focus.active && Focus.repaint) Focus.repaint(); });
  document.addEventListener("visibilitychange", () => { if (Focus.active && document.visibilityState === "hidden" && Focus.onLeave) Focus.onLeave(); });
  window.addEventListener("blur", () => { if (Focus.active && Focus.onLeave) Focus.onLeave(); });

  // ================================================================ teacher: write a quiz (any subject)
  const Q_TYPES = [["choice", "Multiple choice"], ["text", "Short answer (words)"], ["long", "Long answer (you grade it)"], ["yesno", "Yes / No"], ["math", "Math answer (number, interval, ...)"]];
  const TYPE_TAG = { choice: "choice", text: "short", long: "long", yesno: "yes/no" };
  const BASE_TIME = { choice: 20, text: 25, long: 120, yesno: 12, math: 40 };

  // ================================================================ printing (paper copies for the teacher)
  // Builds the page in a hidden print area, prints it, then removes it. Works in any browser's print dialog
  // (choose "Save as PDF" there to keep a file).
  function printOut(title, ...body) {
    const old = document.getElementById("print-area"); if (old) old.remove();
    const area = h("div", { id: "print-area" }, ...body);
    document.body.append(area); document.body.classList.add("printing");
    const was = document.title; document.title = title;
    const done = () => { document.body.classList.remove("printing"); area.remove(); document.title = was; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains("printing")) done(); }, 1000); }, 50);
  }
  const lines = (n) => h("div", { class: "p-lines" }, Array.from({ length: n }, () => h("div", { class: "p-line" })));
  // one question on paper; key = show the answer
  function printQuestion(p, i, key) {
    const kind = p.kind;
    const kids = [h("div", { class: "p-q" }, h("b", {}, `${i + 1}. `), p.q)];
    if (kind === "choice") kids.push(h("ol", { class: "p-opts" }, p.options.map((o, j) => h("li", { class: key && j === p.ans ? "p-right" : "" }, h("span", { class: "p-bubble" }, String.fromCharCode(65 + j)), o, key && j === p.ans ? "  ✓" : ""))));
    else if (kind === "yesno") kids.push(h("p", { class: "p-yn" }, ["Yes", "No"].map((v) => h("span", { class: key && p.ans === v.toLowerCase() ? "p-right" : "" }, h("span", { class: "p-bubble" }, ""), v + (key && p.ans === v.toLowerCase() ? "  ✓" : "")))));
    else if (!key) kids.push(lines(kind === "long" ? 8 : 1));
    if (key) {
      if (kind === "long") kids.push(h("p", { class: "p-ans" }, h("b", {}, "Model answer: "), p.sol || "(none written — you grade it)"));
      else if (kind !== "choice" && kind !== "yesno") kids.push(h("p", { class: "p-ans" }, h("b", {}, "Answer: "), kind === "text" ? p.ans.join("  /  ") : M.answerText(p)));
      if (p.teacherSol && p.sol && kind !== "long") kids.push(h("p", { class: "p-ans muted" }, p.sol));
    }
    return h("div", { class: "p-item" }, ...kids);
  }
  // the quiz on paper, for students (blank) or as an answer key
  function printQuiz(name, questions, key, period) {
    printOut(name + (key ? " — answer key" : ""),
      h("div", { class: "p-head" }, h("h1", {}, name + (key ? " — Answer key" : "")),
        key ? h("p", {}, `${questions.length} questions` + (period ? ` · ${period}` : ""))
          : h("div", { class: "p-name" }, h("span", {}, "Name ", h("span", { class: "p-blank" })), h("span", {}, "Date ", h("span", { class: "p-blank short" })), h("span", {}, "Period ", h("span", { class: "p-blank short" }, period || "")))),
      questions.map((p, i) => printQuestion(p, i, key)));
  }
  // a little "Print" menu: quiz for students / answer key
  function printMenu(getName, getQuestions, period) {
    const wrap = h("span", { class: "print-menu" });
    const go = (key) => { const qs = getQuestions(); if (!qs.length) { alert("This quiz has no questions yet."); return; } printQuiz(getName(), qs, key, period); };
    const sel = h("select", { class: "input small", "aria-label": "Print", onchange: (e) => { const v = e.target.value; e.target.value = ""; if (v) go(v === "key"); } },
      h("option", { value: "" }, "Print..."), h("option", { value: "quiz" }, "Print the quiz (for students)"), h("option", { value: "key" }, "Print the answer key"));
    wrap.append(sel); return wrap;
  }

  function editor(set, note) {
    let idx = null, type = "choice";
    let opts = ["", "", "", ""], correct = 0, textVal = "", ynVal = "yes", mathVal = "", mathKind = "";
    const tools = { spell: false, grammar: false, dict: false };
    const toolBox = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", "data-tool": k, onchange: (e) => { tools[k] = e.target.checked; } }), label);
    const toolsEl = h("div", { class: "tool-opts" }, h("p", { class: "label" }, "Help the student may use on this question"),
      toolBox("spell", "Spell check (misspelled words are underlined in written answers)"),
      toolBox("grammar", "Grammar check (a \u201cCheck my writing\u201d button on written answers)"),
      toolBox("dict", "Dictionary (select a word to see its meaning and an example sentence)"));
    const paintTools = () => toolsEl.querySelectorAll("input").forEach((el) => { el.checked = !!tools[el.dataset.tool]; });
    const name = h("input", { class: "input", value: set.name, maxlength: 40, "aria-label": "Quiz name", oninput: (e) => { set.name = e.target.value.trim() || "Untitled quiz"; saveSets(); } });
    const list = h("ol", { class: "qlist" });
    const q = h("textarea", { class: "input", rows: 4, placeholder: "Type the question..." });
    const typeSel = h("select", { class: "input", "aria-label": "Question type", onchange: (e) => { type = e.target.value; drawFields(); } }, Q_TYPES.map(([k, n]) => h("option", { value: k }, n)));
    const fields = h("div", { class: "fields" });
    const solLbl = h("span", {}, "");
    const sol = h("textarea", { class: "input", rows: 3 });
    const msg = h("p", { class: "msg" });

    function drawFields() {
      solLbl.textContent = type === "long" ? "Model answer or rubric (optional — you see it while grading)" : "Explanation (optional — shown only if you allow answers)";
      if (type === "choice") {
        setKids(fields, h("p", { class: "label" }, "Choices — click the circle next to the correct one"),
          opts.map((o, i) => h("div", { class: "opt-row" },
            h("input", { type: "radio", name: "correct", checked: i === correct, onchange: () => { correct = i; }, "aria-label": `choice ${i + 1} is correct` }),
            h("input", { class: "input", value: o, placeholder: `Choice ${i + 1}`, oninput: (e) => { opts[i] = e.target.value; } }),
            opts.length > 2 ? h("button", { class: "btn small ghost", type: "button", onclick: () => {
              opts.splice(i, 1); if (correct > i || correct >= opts.length) correct = Math.max(0, correct - 1); drawFields();
            } }, "Remove") : null)),
          opts.length < 8 ? h("button", { class: "btn small ghost", type: "button", onclick: () => { opts.push(""); drawFields(); } }, "+ Add a choice") : null);
      } else if (type === "text") {
        setKids(fields, h("label", { class: "field" }, h("span", {}, "Accepted answers — one per line"),
          h("textarea", { class: "input", rows: 3, placeholder: "photosynthesis\nphoto synthesis", value: textVal, oninput: (e) => { textVal = e.target.value; } })),
          h("p", { class: "hint" }, "Capital letters, punctuation and a leading “the” don't matter. Add spellings you'd also accept. You can still change a student's points on the dashboard."));
      } else if (type === "long") {
        setKids(fields, h("p", { class: "hint" }, "Students write a paragraph. Nothing is graded automatically — you read each answer on your dashboard and give it 0, ½ or 1 point."));
      } else if (type === "yesno") {
        setKids(fields, h("p", { class: "label" }, "Correct answer"),
          ["yes", "no"].map((v) => h("label", { class: "radio inline" }, h("input", { type: "radio", name: "yn", checked: ynVal === v, onchange: () => { ynVal = v; } }), v === "yes" ? "Yes" : "No")));
      } else {
        setKids(fields, h("div", { class: "row" },
          h("label", { class: "field grow" }, h("span", {}, "Correct answer"), h("input", { class: "input mono", value: mathVal, oninput: (e) => { mathVal = e.target.value; } })),
          h("label", { class: "field" }, h("span", {}, "Kind of answer"), h("select", { class: "input", onchange: (e) => { mathKind = e.target.value; } },
            M.ANSWER_TYPES.filter(([, k]) => k !== "yesno").map(([n, k]) => h("option", { value: k, selected: k === mathKind }, n))))),
          h("p", { class: "hint" }, "Examples:  7   -5/2   |   -2, 4   none   |   [-5, 5]   (-inf, 3]   |   x > 3   -2 < x <= 5   |   $11025.00   |   (2, -5)   |   4x^2 - 1   |   1+5i, 1-5i"),
          h("p", { class: "hint" }, "A dropped negative or a mixed-up < > sign earns half credit. An open interval like (2, 5) looks like a point — choose Kind: Interval for it."));
      }
    }
    function refresh() {
      list.replaceChildren(...set.questions.map((p, i) => h("li", { class: i === idx ? "sel" : "", onclick: () => pick(i) },
        h("span", { class: "type-tag" }, TYPE_TAG[p.kind] || "math"), p.q.split("\n")[0].slice(0, 48))));
    }
    function pick(i) {
      idx = i; const p = set.questions[i];
      q.value = p.q;
      type = TYPE_TAG[p.kind] ? p.kind : "math";
      typeSel.value = type;
      if (type === "choice") { opts = p.options.slice(); correct = p.ans; }
      else if (type === "text") textVal = p.ans.join("\n");
      else if (type === "yesno") ynVal = p.ans;
      else if (type === "math") { mathVal = M.answerText(p).replace(/∞/g, "inf"); mathKind = p.kind; }
      sol.value = p.teacherSol ? p.sol : "";
      Object.assign(tools, { spell: false, grammar: false, dict: false }, p.tools || {}); paintTools();
      drawFields();
      msg.textContent = `Editing question ${i + 1}.`; msg.className = "msg"; refresh();
    }
    function blank() {
      idx = null; q.value = ""; sol.value = ""; opts = ["", "", "", ""]; correct = 0; textVal = ""; ynVal = "yes"; mathVal = ""; mathKind = "";
      drawFields(); msg.textContent = "New question."; msg.className = "msg"; refresh(); q.focus();
    }
    function save() {
      const fail = (t) => { msg.textContent = t; msg.className = "msg bad"; };
      if (!q.value.trim()) return fail("Type the question.");
      const p = { topic: "Question", q: q.value.trim(), sol: "", base: BASE_TIME[type] };
      if (type === "choice") {
        const clean = opts.map((o) => o.trim());
        if (clean.filter(Boolean).length < 2) return fail("Write at least two choices.");
        if (!clean[correct]) return fail("Click the circle next to the correct choice (it can't be blank).");
        p.kind = "choice"; p.options = clean.filter(Boolean); p.ans = clean.slice(0, correct).filter(Boolean).length;
      } else if (type === "text") {
        const lines = textVal.split("\n").map((x) => x.trim()).filter(Boolean);
        if (!lines.length) return fail("Type at least one accepted answer.");
        p.kind = "text"; p.ans = lines;
      } else if (type === "long") { p.kind = "long"; p.ans = null; }
      else if (type === "yesno") { p.kind = "yesno"; p.ans = ynVal; }
      else {
        try { [p.kind, p.ans] = M.parseAnswer(mathVal, mathKind || null); } catch (e) { return fail(e.message); }
      }
      const s = sol.value.trim();
      p.sol = s || (p.kind === "long" ? "" : `The correct answer is ${M.answerText(p)}.`);
      p.teacherSol = !!s;
      if (tools.spell || tools.grammar || tools.dict) p.tools = Object.assign({}, tools);
      if (idx === null) { set.questions.push(p); idx = set.questions.length - 1; } else set.questions[idx] = p;
      saveSets(); refresh();
      msg.textContent = `Saved question ${idx + 1}` + (p.kind === "long" ? " (you'll grade it yourself)." : `. Correct answer: ${M.answerText(p)}`);
      msg.className = "msg good";
    }
    function del() { if (idx === null) return; set.questions.splice(idx, 1); saveSets(); blank(); }
    function move(d) { if (idx === null) return; const j = idx + d; if (j < 0 || j >= set.questions.length) return; [set.questions[idx], set.questions[j]] = [set.questions[j], set.questions[idx]]; idx = j; saveSets(); refresh(); }
    function exportSet() {
      const data = { app: "quiz-duel", name: set.name, questions: set.questions.map(M.encProb) };
      download(`${set.name.replace(/[^\w -]+/g, "").trim() || "quiz"}.quiz.json`, new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    }
    function delSet() {
      if (!confirm(`Delete the quiz "${set.name}" and all its questions?`)) return;
      S.sets = S.sets.filter((s) => s !== set); saveSets(); builder(false);
    }
    show(topbar(APP, "Teacher — write a quiz"), h("main", { class: "wide" },
      h("div", { class: "row quiz-name" }, h("label", { class: "field grow" }, h("span", {}, "Quiz name"), name),
        h("button", { class: "btn small ghost", onclick: () => { if (!set.questions.length) { alert("This quiz has no questions yet."); return; } preview(set.name, null, set.questions, () => editor(set)); } }, "Preview as a student"),
        printMenu(() => set.name, () => set.questions),
        h("button", { class: "btn small ghost", onclick: exportSet }, "Export (share with a teacher)"),
        h("button", { class: "btn small ghost", onclick: delSet }, "Delete this quiz")),
      h("div", { class: "editor" },
        card(h("h3", {}, "Questions"), list, h("div", { class: "row small-gap" },
          h("button", { class: "btn small", onclick: blank }, "+ New"), h("button", { class: "btn small ghost", onclick: del }, "Delete"),
          h("button", { class: "btn small ghost", onclick: () => move(-1) }, "Up"), h("button", { class: "btn small ghost", onclick: () => move(1) }, "Down"))),
        card(h("label", { class: "field" }, h("span", {}, "Question"), q),
          h("label", { class: "field" }, h("span", {}, "Type of question"), typeSel),
          fields,
          toolsEl,
          h("label", { class: "field" }, solLbl, sol),
          msg, h("div", { class: "row" }, h("button", { class: "btn", onclick: save }, "Save question"),
            h("button", { class: "btn good", onclick: () => { S.builderState && (S.builderState.src = "custom", S.builderState.setId = set.id); builder(false); } }, "Done"))))));
    drawFields(); refresh();
    if (note) { msg.textContent = note; msg.className = "msg good"; }
  }

  // ================================================================ teacher: running quizzes
  // A runner is one live quiz: its connection to the students plus all the grading. Every runner keeps
  // working in this tab, whichever dashboard is on screen.
  function makeRunner(live) {
    live.graded = live.graded || {}; live.answers = live.answers || {}; live.keys = live.keys || {};
    live.seen = live.seen || []; live.log = live.log || []; live.students = live.students || {};
    const full = live.full.map(M.decProb);
    const r = { live, full, dirty: true, status: "connecting", stopped: false, typing: {}, onTyping: null };
    const log = r.log = (text) => {
      live.log.push([Date.now(), text]);
      if (live.log.length > 400) live.log.splice(0, live.log.length - 400);
      r.dirty = true;
    };
    function student(ev) {
      if (!live.students[ev.sid]) live.students[ev.sid] = { name: ev.name || "?", email: "", state: "lobby", i: 0, right: 0, half: 0, wrong: 0, skipped: 0, togr: 0, score: 0, left: 0, monitor: 0, reloads: 0, frozen: null, wants: false, last: 0, total: live.total, app: !!ev.app, silent: false };
      return live.students[ev.sid];
    }
    const retally = r.retally = (sid) => {
      const s = live.students[sid]; if (!s) return;
      Object.assign(s, { right: 0, half: 0, wrong: 0, skipped: 0, togr: 0, score: 0 });
      for (const a of Object.values(live.answers)) {
        if (a.sid !== sid) continue;
        if (a.skipped) s.skipped++;
        else if (a.pts === null) s.togr++;
        else if (a.pts === 1) s.right++;
        else if (a.pts === 0.5) s.half++;
        else s.wrong++;
        s.score += a.pts || 0;
      }
    };
    // returns the grading result for answers (sent back to the student)
    function apply(ev) {
      if (ev.type === "typing") {                 // live view only: kept in memory, not logged or saved
        const s0 = live.students[ev.sid];
        if (!s0 || s0.state === "done" || s0.state === "redone") return null;
        const qn = Math.max(1, Math.min(full.length, +ev.qn || 1));
        r.typing[ev.sid] = { qn, text: String(ev.text || "").slice(0, 20000), at: Date.now() };
        s0.last = Date.now();
        if (r.onTyping) r.onTyping(ev.sid);
        return null;
      }
      if (!live.students[ev.sid] && Object.keys(live.students).some((k) => k.startsWith(ev.sid + "~")) && ev.type === "hb") return null;   // an old try
      if (ev.eid && live.graded[ev.eid]) return live.graded[ev.eid];        // answer sent twice after a reconnect
      if (ev.eid && live.seen.includes(ev.eid)) return null;
      if (ev.type !== "hb" && ev.eid) { live.seen.push(ev.eid); if (live.seen.length > 3000) live.seen.splice(0, 1000); }
      const s = student(ev), name = s.name;
      s.last = Date.now();
      if (ev.app) s.app = true;
      if (s.silent) { s.silent = false; log(`${name} is connected again.`); }
      if (typeof ev.i === "number") s.i = Math.max(s.i, ev.i);
      const t = ev.type;
      let reply = null;
      if (t === "join") {
        s.total = ev.total || s.total;
        if (ev.email && EMAIL_RE.test(ev.email)) s.email = String(ev.email).toLowerCase().slice(0, 80);
        log(ev.rejoin ? `${name} rejoined after reloading the page.` : ev.key ? `${name} came back with a key.` : `${name} joined${ev.app ? " (Quiz Duel app)" : ""}.`);
      }
      else if (t === "start") { s.state = "working"; log(`${name} started the quiz.`); }
      else if (t === "ans") {
        const qn = ev.qn || ev.i;
        const p = full[qn - 1];
        const pts = !p || ev.skipped ? 0 : M.grade(p, ev.raw || "");        // null = long answer, waits for the teacher
        live.answers[ev.eid] = { sid: ev.sid, qn, raw: String(ev.raw || "").slice(0, 60000), skipped: !!ev.skipped, secs: ev.secs, pts, t: Date.now() };
        reply = { pts, waiting: pts === null, ans: live.show && p ? M.answerText(p) : null, sol: live.show && p ? p.sol : null };
        live.graded[ev.eid] = reply;
        retally(ev.sid);
        if (s.state === "lobby") s.state = "working";
        const word = ev.skipped ? "skipped" : pts === null ? "NEEDS YOUR GRADE" : pts === 1 ? "RIGHT" : pts === 0.5 ? "half (sign slip)" : "wrong";
        const shown = ev.skipped ? "" : p && p.kind === "long" ? "  — long answer" : `  — answered "${M.shownAnswer(p || {}, ev.raw).slice(0, 40)}"`;
        log(`${name}  question ${qn}: ${word}${shown}  (${ev.secs}s)${ev.late ? "  [sent after being offline]" : ""}`);
      } else if (t === "viol") {
        const why = ev.why;
        if (ev.soft) { s.left++; log(`! ${name}${{ sleep: "'s computer went to sleep", lockscreen: " locked the screen", closed: "'s app was closed, then they came back" }[why] || " left the quiz page"} (question ${ev.i}). Low security: not frozen.`); }
        else if (why === "monitor") { s.monitor++; s.frozen = "extra monitor"; log(`!! ${name} has an extra monitor (question ${ev.i}). Frozen.`); }
        else if (why === "reload") { s.reloads++; s.left++; s.frozen = "reloaded page"; log(`!! ${name} reloaded the quiz page (question ${ev.i}). Frozen.`); }
        else if (why === "sleep") { s.left++; s.frozen = "computer slept"; log(`!! ${name}'s computer went to sleep or the lid was closed${ev.secs ? ` for about ${Math.round(ev.secs / 60) || 1} min` : ""} (question ${ev.i}). Frozen.`); }
        else if (why === "lockscreen") { s.left++; s.frozen = "locked the screen"; log(`!! ${name} locked the computer screen (Windows+L or similar) (question ${ev.i}). Frozen.`); }
        else if (why === "closed") { s.left++; s.frozen = "app was closed"; log(`!! ${name}'s Quiz Duel app was closed or the computer restarted, then they came back (question ${ev.i}). Frozen.`); }
        else { s.left++; s.frozen = "left the quiz"; log(`!! ${name} LEFT the quiz window (question ${ev.i}). Frozen.`); }
        if (!ev.soft) s.wants = false;
      } else if (t === "res") {
        if (ev.how === "dict") log(`${name} looked up the word "${ev.what}" (question ${ev.i}).`);
        else if (ev.how === "weak") log(`! On ${name}'s computer Windows didn't let Quiz Duel turn off: ${String(ev.what).slice(0, 200)}. Watch this student; leaving is still caught.`);
        else if (ev.how === "grammar") log(`${name} used the grammar check (question ${ev.i}).`);
        else if (ev.how === "back") log(`${name} came back to the quiz page.`);
        else if (ev.how === "apps") log(`Quiz Duel closed ${ev.what} on ${name}'s computer.`);
        else if (ev.how === "offline") log(`${name} was offline for ${ev.what}. Their answers were saved on their computer and sent when they came back.`);
        else log(ev.how === "window" ? `${name} opened "${ev.what}" in its own window (question ${ev.i}).` : ev.how === "closed" ? `${name} closed the reference window.` : `${name} opened the reference "${ev.what}" (question ${ev.i}).`);
      } else if (t === "unfrozen") { s.frozen = null; log(`${name} was unlocked (${ev.how || ""}).`); }
      else if (t === "leave_req") { s.wants = true; log(`${name} asked to LEAVE (question ${ev.i}). Tick them and click "Let leave", or type the unlock code on their screen.`); }
      else if (t === "leave_cancel") { s.wants = false; log(`${name} went back to the quiz.`); }
      else if (t === "quit") { s.state = "quit"; s.frozen = null; s.wants = false; log(`${name} LEFT the quiz early (${ev.how === "teacher" ? "you let them leave" : ev.how === "emergency" ? "used the emergency keys" : "unlock code typed"}) with ${M.fmtPts(s.score)} points.`); }
      else if (t === "done") { s.state = "done"; s.frozen = null; s.wants = false; log(`${name} FINISHED: ${M.fmtPts(s.score)} points${s.togr ? ` so far (${s.togr} to grade)` : ""}.`); }
      else if (t === "hb") { if (ev.frozen === false && s.frozen) s.frozen = null; if (s.state === "lobby" && ev.i > 0) s.state = "working"; }
      r.dirty = true;
      return reply;
    }
    // ---- who may come in: one email = one student. Coming back after finishing, or from another
    // computer, needs a key from the teacher.
    const findByEmail = (email) => Object.entries(live.students).find(([, x]) => x.email === email && x.state !== "redone");
    function archive(oldSid) {
      let n = 1; while (live.students[`${oldSid}~${n}`]) n++;
      const arch = `${oldSid}~${n}`, s = live.students[oldSid];
      s.state = "redone"; s.attempt = n; s.frozen = null; s.wants = false;
      live.students[arch] = s; delete live.students[oldSid];
      for (const a of Object.values(live.answers)) if (a.sid === oldSid) a.sid = arch;
      if (r.host) { r.host.pending.delete(oldSid); r.host.addr.delete(oldSid); }
    }
    function moveTo(oldSid, newSid) {
      if (oldSid === newSid) return;
      live.students[newSid] = live.students[oldSid]; delete live.students[oldSid];
      for (const a of Object.values(live.answers)) if (a.sid === oldSid) a.sid = newSid;
      if (r.host) { r.host.pending.delete(oldSid); r.host.addr.delete(oldSid); }
    }
    const resumeData = (sid) => Object.entries(live.answers).filter(([, a]) => a.sid === sid).sort((x, y) => x[1].qn - y[1].qn)
      .map(([eid, a]) => ({ eid, qn: a.qn, raw: a.raw, skipped: a.skipped, secs: a.secs, pts: a.pts, waiting: a.pts === null && !a.skipped }));
    function admit(msg) {
      const email = String(msg.email || "").toLowerCase().slice(0, 80);
      const key = String(msg.key || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const owner = email ? findByEmail(email) : null;
      if (key) {
        const k = live.keys[key];
        if (k && k.used && k.by === msg.sid) return { ok: true };            // the same student saying hello again
        if (!k || k.used || (k.email && k.email !== email)) return { ok: false, why: "badkey" };
        k.used = Date.now(); k.by = msg.sid;
        const oldSid = owner ? owner[0] : null;
        if (k.type === "redo") {
          if (oldSid) archive(oldSid);
          log(`${msg.name || email} used a REDO key: starting over (the earlier try is kept in your list).`);
          return { ok: true };
        }
        if (oldSid) {
          moveTo(oldSid, msg.sid);
          const s = live.students[msg.sid];
          s.state = s.i > 0 ? "working" : "lobby"; s.frozen = null; s.wants = false; s.silent = false;
          log(`${s.name} used a CONTINUE key: picking up where they left off.`);
          return { ok: true, resume: resumeData(msg.sid) };
        }
        return { ok: true };
      }
      const same = live.students[msg.sid];
      if (owner) {
        const [osid, s] = owner;
        if ((s.state === "done" || s.state === "quit") && !(msg.resend && osid === msg.sid)) return { ok: false, why: "done" };
        if (osid !== msg.sid) { log(`!! ${s.name} tried to join again from another computer or browser. Give them a continue key if that's OK.`); return { ok: false, why: "elsewhere" }; }
      }
      if (same && (same.state === "done" || same.state === "quit") && !msg.resend) return { ok: false, why: "done" };
      return { ok: true };
    }
    r.makeKey = (sid, type) => {
      const s = live.students[sid]; if (!s) return null;
      let key; do key = randomCode(6, CODE_CHARS); while (live.keys[key]);
      live.keys[key] = { email: s.email || "", type, sid, name: s.name, made: Date.now(), used: 0 };
      log(`You made a ${type.toUpperCase()} key for ${s.name}: ${key}`);
      return key;
    };
    // the teacher gives (or changes) the points for one answer
    r.setGrade = (eid, pts) => {
      const a = live.answers[eid]; if (!a) return;
      a.pts = pts;
      if (live.graded[eid]) { live.graded[eid].pts = pts; live.graded[eid].waiting = false; }
      retally(a.sid);
      r.host.send(a.sid, { cmd: "grade", eid, pts });
      log(`You gave ${live.students[a.sid] ? live.students[a.sid].name : "a student"} ${pts === 0.5 ? "1/2" : pts} for question ${a.qn}.`);
    };
    r.send = (sid, cmd) => r.host.send(sid, cmd);
    // notices students who went quiet (closed the quiz, lost the internet)
    r.tick = () => {
      for (const s of Object.values(live.students)) {
        if (s.state === "working" && !s.silent && Date.now() - s.last > 20000) { s.silent = true; log(`!! ${s.name} DISCONNECTED in the middle of the quiz — closed it, or lost the internet (their answers are saved on their computer).`); }
      }
      if (r.dirty) { Runners.save(); r.dirty = false; r.changed = true; }
    };
    r.host = new Host(live.code, live.token, live.payload, { event: apply, admit, status: (st) => { r.status = st; r.changed = true; } });
    r.stop = () => { r.stopped = true; r.host.stop(); };
    return r;
  }
  const Runners = {
    list: [], started: false, timer: null,
    load() {
      let saved = store.get("qd-live");
      if (!Array.isArray(saved)) { const one = store.get("md-teacher"); saved = one && one.code && one.full ? [one] : []; store.del("md-teacher"); }
      return saved.filter((L) => L && L.code && L.full);
    },
    startAll() {
      if (this.started) return;
      this.started = true;
      this.list = this.load().map(makeRunner);
      this.timer = setInterval(() => { for (const r of this.list) r.tick(); }, 1000);
    },
    save() { store.set("qd-live", this.list.map((r) => r.live)); },
    add(live) { this.startAll(); const r = makeRunner(live); this.list.push(r); this.save(); return r; },
    remove(r) { r.stop(); this.list = this.list.filter((x) => x !== r); this.save(); },
  };

  // ---- one quiz's dashboard
  function dashboard(run) {
    const live = run.live, full = run.full;
    const statusEl = h("span", { class: "pill" }, "Connecting...");
    const tbody = h("tbody");
    const logEl = h("div", { class: "log mono" });
    const msg = h("span", { class: "muted" });
    const needEl = h("div", { class: "notice need-grade", hidden: true });
    const review = h("section", { class: "card review", hidden: true });
    const selected = new Set();
    let reviewMode = null, logLen = -1;

    function statusOf(s) {
      const quiet = Date.now() - s.last;
      if (s.state === "redone") return [`Earlier try ${s.attempt || ""} (redo given)`, "gone"];
      if (s.frozen) return ["FROZEN — " + s.frozen, "frozen"];
      if (s.state === "working" && quiet > 20000) return ["DISCONNECTED — closed it or offline?", "frozen"];
      if (s.wants && s.state === "working") return ["Wants to leave", "leave"];
      if (s.state === "done") return ["Finished", "done"];
      if (s.state === "quit") return ["Left early", "gone"];
      if (quiet > 30000 && s.state === "lobby") return ["No signal", "gone"];
      if (s.state === "working") return ["Working", ""];
      return ["Waiting to start", ""];
    }
    function ago(ms) { const s = Math.floor((Date.now() - ms) / 1000); return s < 5 ? "just now" : s < 120 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`; }
    const setGrade = (eid, pts) => { run.setGrade(eid, pts); render(true); };
    function keyBox(sid) {
      const s = live.students[sid];
      const out = h("div", { class: "keys" });
      const mine = Object.entries(live.keys).filter(([, k]) => k.sid === sid || (k.email && k.email === s.email));
      const give = (type) => { const key = run.makeKey(sid, type); render(true); drawReview(); const el = review.querySelector(".key-new"); if (el) el.scrollIntoView({ block: "nearest" }); return key; };
      setKids(out,
        h("div", { class: "row small-gap" }, h("b", {}, "Let them back in:"),
          h("button", { class: "btn small", onclick: () => give("continue") }, "Give a continue key"),
          h("button", { class: "btn small ghost", onclick: () => give("redo") }, "Give a redo key")),
        h("p", { class: "hint" }, "Continue = pick up where they stopped, on any computer. Redo = start the quiz over (the first try stays in your list). The student joins again with their email and types the key."),
        mine.length ? h("ul", { class: "key-list" }, mine.sort((x, y) => y[1].made - x[1].made).map(([key, k], i) => h("li", { class: i === 0 && !k.used ? "key-new" : "" },
          h("span", { class: "bigkey mono" }, key), ` ${k.type} key — ${k.used ? "used " + ago(k.used) : "not used yet"}`))) : null);
      return out;
    }
    // live view of one student: which question they're on and what they're typing right now
    const liveBox = h("div", { class: "live-view" });
    function paintLive() {
      if (!reviewMode || !reviewMode.sid || !live.students[reviewMode.sid]) return;
      const s = live.students[reviewMode.sid], t = run.typing[reviewMode.sid];
      const working = s.state === "working" || s.state === "lobby";
      if (!working) { setKids(liveBox, h("p", { class: "live-head" }, h("span", { class: "live-dot off" }), s.state === "done" ? "Finished — see the answers below." : "Not in the quiz right now.")); return; }
      const qn = t && Date.now() - t.at < 60000 ? t.qn : Math.min(s.i + 1, s.total || full.length);
      const p = full[qn - 1] || { q: "", kind: "text" };
      const fresh = t && t.qn === qn && t.text;
      setKids(liveBox,
        h("p", { class: "live-head" }, h("span", { class: "live-dot" + (fresh && Date.now() - t.at < 8000 ? " typing" : "") }), h("b", {}, "Live"), ` — ${s.frozen ? "frozen, " : ""}on question ${qn} of ${s.total || full.length}`,
          fresh ? h("span", { class: "muted small" }, `  · updated ${ago(t.at)}`) : null),
        h("p", { class: "rev-q" }, p.q.split("\n")[0]),
        fresh ? (p.kind === "long" ? h("div", { class: "rev-a paper live-text" }, richClean(t.text)) : h("pre", { class: "rev-a live-text" }, p.kind === "choice" && p.options && p.options[+t.text] !== undefined ? p.options[+t.text] : t.text))
          : h("p", { class: "muted small" }, "Nothing typed yet on this question. What they type shows up here every few seconds."));
    }
    run.onTyping = (sid) => { if (reviewMode && reviewMode.sid === sid && liveBox.isConnected) paintLive(); };
    function drawReview() {
      if (!reviewMode) { review.hidden = true; return; }
      review.hidden = false;
      let items = Object.entries(live.answers), head;
      if (reviewMode.pending) { items = items.filter(([, a]) => a.pts === null && !a.skipped && live.students[a.sid]); head = "Answers waiting for your grade"; }
      else {
        const s = live.students[reviewMode.sid];
        if (!s) { reviewMode = null; review.hidden = true; return; }
        items = items.filter(([, a]) => a.sid === reviewMode.sid); head = `${s.name}'s answers` + (s.email ? `  (${s.email})` : "");
      }
      items.sort((x, y) => x[1].qn - y[1].qn || x[1].t - y[1].t);
      setKids(review,
        h("div", { class: "row" }, h("h3", {}, head), h("div", { class: "spacer" }), h("button", { class: "btn small ghost", onclick: () => { reviewMode = null; drawReview(); } }, "Close")),
        reviewMode.sid && live.students[reviewMode.sid].state !== "redone" ? liveBox : null,
        reviewMode.sid && live.students[reviewMode.sid].state !== "redone" ? keyBox(reviewMode.sid) : null,
        reviewMode.sid ? h("h4", { class: "rev-sub" }, "Handed-in answers") : null,
        items.length ? items.map(([eid, a]) => {
          const p = full[a.qn - 1] || { q: "", kind: "text" };
          const need = a.pts === null && !a.skipped;
          return h("div", { class: "rev-item" + (need ? " need" : "") },
            h("p", { class: "rev-q" }, h("b", {}, `Question ${a.qn}. `), p.q.split("\n")[0], reviewMode.pending ? h("span", { class: "muted" }, `  — ${live.students[a.sid].name}`) : null),
            a.skipped ? h("pre", { class: "rev-a" }, "(skipped)") : answerView(p, a.raw, "rev-a"),
            p.kind === "long" ? (p.sol ? h("p", { class: "muted small" }, "Model answer: " + p.sol) : null) : h("p", { class: "muted small" }, "Correct answer: " + M.answerText(p)),
            h("div", { class: "row small-gap" }, h("span", { class: "muted small" }, need ? "Give points:" : "Points:"),
              [0, 0.5, 1].map((v) => h("button", { class: "btn small " + (a.pts === v ? "" : "ghost"), onclick: () => setGrade(eid, v), "aria-pressed": a.pts === v ? "true" : "false" }, v === 0.5 ? "½" : String(v)))));
        }) : h("p", { class: "muted" }, reviewMode.pending ? "Nothing is waiting. Nice." : "No answers yet."));
      paintLive();
    }
    function render(force) {
      const txt = { online: "Live — students can join", connecting: "Connecting...", reconnecting: "Reconnecting...", error: "Can't reach the connection service — check the internet." }[run.status] || run.status;
      statusEl.textContent = txt; statusEl.className = "pill " + (run.status === "online" ? "good" : run.status === "error" ? "bad" : "warn");
      const rows = Object.entries(live.students).sort((a, b) => (a[1].state === "redone") - (b[1].state === "redone") || a[1].name.toLowerCase().localeCompare(b[1].name.toLowerCase()));
      tbody.replaceChildren(...(rows.length ? rows.map(([sid, s]) => {
        const [st, cls] = statusOf(s);
        const box = s.state === "redone" ? "" : h("input", { type: "checkbox", checked: selected.has(sid), onchange: (e) => { if (e.target.checked) selected.add(sid); else selected.delete(sid); }, "aria-label": "select " + s.name });
        const nameBtn = h("button", { class: "name-btn", title: "Watch this student live and see their answers", onclick: () => { reviewMode = { sid }; drawReview(); review.scrollIntoView({ block: "nearest" }); } }, s.name);
        return h("tr", { class: cls }, h("td", {}, box), h("td", { class: "name" }, nameBtn, s.email ? h("div", { class: "email muted small" }, s.email) : null), h("td", {}, st), h("td", { class: "num" }, `${s.i}/${s.total}`),
          h("td", { class: "num" }, s.right), h("td", { class: "num" }, s.half), h("td", { class: "num" }, s.wrong), h("td", { class: "num" }, s.skipped),
          h("td", { class: "num" + (s.togr ? " togr" : "") }, s.togr || 0),
          h("td", { class: "num strong" }, M.fmtPts(s.score)), h("td", { class: "num" }, s.left), h("td", { class: "num" }, s.monitor),
          h("td", { class: "num" }, s.app ? "✓" : "–"), h("td", { class: "num muted" }, ago(s.last)));
      }) : [h("tr", {}, h("td", { colspan: 14, class: "empty" }, "No students yet. Tell them to open this website, choose Student, and type the code."))]));
      const waiting = Object.values(live.answers).filter((a) => a.pts === null && !a.skipped && live.students[a.sid] && live.students[a.sid].state !== "redone").length;
      needEl.hidden = !waiting;
      if (waiting) setKids(needEl, `${waiting} answer${waiting === 1 ? " is" : "s are"} waiting for your grade. `,
        h("button", { class: "btn small", onclick: () => { reviewMode = { pending: true }; drawReview(); review.scrollIntoView({ block: "nearest" }); } }, "Grade now"));
      if (force || run.changed || live.log.length !== logLen) {
        logLen = live.log.length; run.changed = false;
        logEl.replaceChildren(...live.log.slice(-150).map(([t, x]) => h("div", { class: x.startsWith("!!") ? "bad" : x.startsWith("!") ? "warn" : "" }, new Date(t).toLocaleTimeString() + "  " + x)));
        logEl.scrollTop = logEl.scrollHeight;
        if (reviewMode && !review.contains(document.activeElement)) drawReview();
      }
    }
    function act(cmd, label, onlyFrozen) {
      let ids = Array.from(selected).filter((sid) => live.students[sid]);
      if (onlyFrozen) ids = Object.keys(live.students).filter((sid) => live.students[sid].frozen);
      if (!ids.length) { msg.textContent = onlyFrozen ? "Nobody is frozen." : "Tick a student's box first."; return; }
      ids.forEach((sid) => { run.send(sid, cmd); run.log(`${label} ${live.students[sid].name}.`); });
      msg.textContent = "";
      render(true);
    }
    function csv() {
      const cell = (c) => `"${String(c).replace(/"/g, '""')}"`;
      const rows = [["Class / period", live.period || ""], [],
        ["Student", "Email", "Status", "Questions done", "Right", "Half", "Wrong", "Skipped", "Waiting for grade", "Score", "Times left the quiz", "Extra monitor", "Quiz Duel app"]];
      const byName = Object.entries(live.students).sort((a, b) => a[1].name.localeCompare(b[1].name));
      for (const [, s] of byName) rows.push([s.name + (s.state === "redone" ? ` (try ${s.attempt})` : ""), s.email || "", s.state, s.i, s.right, s.half, s.wrong, s.skipped, s.togr, M.fmtPts(s.score), s.left, s.monitor, s.app ? "yes" : "no"]);
      rows.push([], ["Student", "Email", "Question #", "Question", "Their answer", "Points"]);
      for (const [sid, s] of byName) {
        for (const a of Object.values(live.answers).filter((x) => x.sid === sid).sort((x, y) => x.qn - y.qn)) {
          const p = full[a.qn - 1] || { q: "" };
          rows.push([s.name + (s.state === "redone" ? ` (try ${s.attempt})` : ""), s.email || "", a.qn, p.q.split("\n")[0], a.skipped ? "(skipped)" : shownRaw(p, a.raw), a.pts === null ? "not graded" : M.fmtPts(a.pts)]);
        }
      }
      download(`results_${(live.period || live.code).replace(/[^\w-]+/g, "_")}.csv`, new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" }));
    }
    // results on paper: the class table, then each student's answers on their own page
    function printResults(withAnswers) {
      const byName = Object.entries(live.students).filter(([, s]) => s.state !== "redone").sort((a, b) => a[1].name.localeCompare(b[1].name));
      if (!byName.length) { msg.textContent = "No students yet."; return; }
      const nm = (live.period ? live.period + " — " : "") + live.title;
      const table = h("table", { class: "p-table" },
        h("thead", {}, h("tr", {}, ["Student", "Email", "Done", "Right", "Half", "Wrong", "Skipped", "To grade", "Score", "Left quiz"].map((x) => h("th", {}, x)))),
        h("tbody", {}, byName.map(([, s]) => h("tr", {}, h("td", {}, s.name), h("td", {}, s.email || ""), h("td", {}, `${s.i}/${s.total}`), h("td", {}, s.right), h("td", {}, s.half), h("td", {}, s.wrong), h("td", {}, s.skipped), h("td", {}, s.togr || 0), h("td", {}, h("b", {}, M.fmtPts(s.score))), h("td", {}, s.left)))));
      const pages = withAnswers ? byName.map(([sid, s]) => h("div", { class: "p-student" },
        h("h2", {}, s.name), h("p", { class: "muted" }, (s.email ? s.email + " · " : "") + `Score ${M.fmtPts(s.score)} out of ${s.total}`),
        Object.values(live.answers).some((a) => a.sid === sid) ? null : h("p", {}, "No answers yet."),
        Object.values(live.answers).filter((a) => a.sid === sid).sort((x, y) => x.qn - y.qn).map((a) => {
          const p = full[a.qn - 1] || { q: "", kind: "text" };
          return h("div", { class: "p-item" }, h("div", { class: "p-q" }, h("b", {}, `${a.qn}. `), p.q),
            h("p", { class: "p-their" }, h("b", {}, "Answer: "), a.skipped ? "(skipped)" : shownRaw(p, a.raw)),
            h("p", { class: "p-ans" }, p.kind === "long" ? (p.sol ? "Model answer: " + p.sol : "") : "Correct answer: " + M.answerText(p)),
            h("p", { class: "p-pts" }, "Points: " + (a.pts === null ? "not graded yet" : M.fmtPts(a.pts))));
        }))) : [];
      printOut("Results — " + nm, h("div", { class: "p-head" }, h("h1", {}, "Results — " + nm), h("p", {}, `Quiz code ${live.code} · ${live.total} questions · printed ${new Date().toLocaleString()}`)), table, pages);
    }
    const resultsSel = h("select", { class: "input small", "aria-label": "Print", onchange: (e) => { const v = e.target.value; e.target.value = "";
      if (v === "table") printResults(false); else if (v === "all") printResults(true); else if (v) printQuiz(live.title, full, v === "key", live.period); } },
      h("option", { value: "" }, "Print..."), h("option", { value: "table" }, "Print the results table"), h("option", { value: "all" }, "Print results + every student's answers"),
      h("option", { value: "quiz" }, "Print the quiz (for students)"), h("option", { value: "key" }, "Print the answer key"));
    function endQuiz() {
      if (!confirm(`End "${live.title}"${live.period ? ` (${live.period})` : ""}? Students won't be able to send any more answers. Save the results first if you need them.`)) return;
      Runners.remove(run);
      if (Runners.list.length) quizList(); else builder(false);
    }
    const level = secLevel(live);
    const secText = { low: "Any browser. Leaving the quiz page is reported in the log, nothing is locked.",
      medium: "Any browser, locked: full screen, no copy/paste, one screen. Students freeze if they leave.",
      high: "Quiz Duel app required. Students in a browser are sent a download link and the app opens with their code." }[level];
    const tabs = Runners.list.length > 1 ? h("div", { class: "quiz-tabs" }, Runners.list.map((r) => h("button", {
      class: "quiz-tab", "aria-current": r === run ? "true" : "false", onclick: () => { if (r !== run) dashboard(r); } }, (r.live.period || r.live.title) + "  ·  " + r.live.code))) : null;

    show(topbar(APP, (live.period ? live.period + " — " : "") + live.title, statusEl), h("main", { class: "wide" },
      h("div", { class: "row" }, tabs, h("div", { class: "spacer" }),
        h("button", { class: "btn small ghost", onclick: quizList }, "All my quizzes"), h("button", { class: "btn small", onclick: () => builder(false) }, "+ New quiz")),
      h("div", { class: "dash-top three" },
        card(h("p", { class: "label" }, "Quiz code" + (live.period ? ` — ${live.period}` : "")), h("div", { class: "bigcode mono" }, live.code),
          h("p", { class: "muted" }, `${live.total} questions. Students open this website → Student → type their name, email and the code.`)),
        card(h("p", { class: "label" }, "Unlock code — keep it secret"), h("div", { class: "pin mono" }, live.pin),
          h("p", { class: "muted" }, "Type it on a student's screen to unfreeze them or let them leave.")),
        card(h("p", { class: "label" }, "Security: " + SECURITY[level] + (live.closeGames ? " + Anti-game" : "")), h("p", { class: "muted" }, secText),
          live.closeGames ? h("p", { class: "muted" }, "Anti-game: students need the Quiz Duel app; it blocks game websites and closes games like Roblox.") : null,
          (level === "high" || live.closeGames) && (DOWNLOADS.win || DOWNLOADS.mac) ? h("p", { class: "small" }, "App download: ",
            DOWNLOADS.win ? h("a", { href: DOWNLOADS.win }, "Windows") : null, DOWNLOADS.win && DOWNLOADS.mac ? " · " : "", DOWNLOADS.mac ? h("a", { href: DOWNLOADS.mac }, "Mac") : null) : null)),
      needEl,
      h("section", { class: "card table-card" },
        h("div", { class: "table-wrap" }, h("table", { class: "dash" },
          h("thead", {}, h("tr", {}, ["", "Student", "Status", "Q", "Right", "Half", "Wrong", "Skip", "To grade", "Score", "Left", "Monitor", "App", "Seen"].map((x) => h("th", {}, x)))), tbody)),
        h("p", { class: "hint" }, "Click a student's name to read their answers, change points, or give them a continue or redo key."),
        h("div", { class: "row wrap" },
          h("button", { class: "btn small", onclick: () => act("unlock", "Sent unlock to") }, "Unlock"),
          h("button", { class: "btn small warn", onclick: () => act("unlock", "Sent unlock to", true) }, "Unlock all frozen"),
          h("button", { class: "btn small navy", onclick: () => act("leave", "Let leave:") }, "Let leave"),
          h("button", { class: "btn small good", onclick: csv }, "Save results (CSV)"), resultsSel,
          h("button", { class: "btn small ghost", onclick: () => { let st = null; try { st = unseal(live.code, live.payload).settings; } catch (e) {} preview(live.title, st, full, () => dashboard(run)); } }, "Preview as a student"), msg, h("div", { class: "spacer" }),
          h("button", { class: "btn small ghost", onclick: endQuiz }, "End quiz"))),
      review,
      card(h("p", { class: "label" }, "What's happening"), logEl),
      h("p", { class: "muted center" }, "Keep this tab open during the quiz — it checks the answers for all your running quizzes. If you close it by accident, open the website again and sign in; your quizzes come back.")));
    render(true);
    every(1000, () => { render(false); if (reviewMode && reviewMode.sid) paintLive(); });
  }

  // ================================================================ lockdown (browser)
  const Lock = {
    on: false, soft: false, away: false, lost: 0, grace: 0, monTick: 0, timer: null,
    start(st) {
      this.soft = secLevel(st) === "low";
      this.on = !this.soft; this.lost = 0; this.monTick = 0; this.away = false;
      if (!this.soft) this.enterFullscreen();
      if (IN_APP && needsApp(st)) QDA.lock(true, { level: secLevel(st) === "high" ? +st.closeApps || 0 : 0, games: !!st.closeGames, strict: secLevel(st) === "high" }).catch(() => {});
      clearInterval(this.timer);
      this.timer = setInterval(() => this.watch(), 300);
    },
    stop() {
      this.on = false; this.soft = false; clearInterval(this.timer);
      if (IN_APP) QDA.lock(false).catch(() => {});
      else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    },
    enterFullscreen() {
      const el = document.documentElement;
      this.grace = Date.now() + 1500;
      if (!IN_APP && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    },
    watch() {
      if (this.soft) {                                   // low security: tell the teacher, don't freeze
        const away = document.visibilityState === "hidden" || !document.hasFocus();
        if (away && !this.away && ++this.lost >= 2) { this.away = true; if (S.client) S.client.send("viol", { why: "left", soft: true }); }
        if (!away) { this.lost = 0; if (this.away) { this.away = false; if (S.client) S.client.send("res", { how: "back" }); } }
        return;
      }
      if (!this.on) return;
      if (Refs.away()) { this.lost = 0; this.grace = Date.now() + 1500; return; }     // reading an allowed page in its own window
      const ov = Q.overlay;
      const watching = !ov || ov.why === "leave" || ov.why === "unlocked";   // frozen screens are already frozen
      if (!watching) return;
      const clearSoft = () => {
        if (Q.overlay) { const wasLeave = Q.overlay.why === "leave"; Q.dropOverlay(); if (wasLeave && S.client) S.client.send("leave_cancel"); }
      };
      const away = document.visibilityState === "hidden" || !document.hasFocus();
      if (away && Date.now() > this.grace) {
        if (++this.lost >= 2) { clearSoft(); Q.violation("left"); return; }
      } else this.lost = 0;
      if (++this.monTick >= 6) {
        this.monTick = 0;
        if (extraMonitor()) { clearSoft(); Q.violation("monitor"); }
      }
    },
  };
  document.addEventListener("fullscreenchange", () => {
    if (!Lock.on || IN_APP || document.fullscreenElement || Q.overlay || Date.now() < Lock.grace || Refs.away()) return;
    // Switching tabs also drops full screen - give the "left the quiz" check a moment to catch that first.
    setTimeout(() => {
      if (Lock.on && !document.fullscreenElement && !Q.overlay && document.visibilityState === "visible" && document.hasFocus()) Q.requestLeave();
    }, 700);
  });
  document.addEventListener("keydown", (e) => { if (Lock.on && e.key === "Escape") { e.preventDefault(); Q.requestLeave(); } });
  // sleep / lid closed / screen locked: counts as leaving. In the app the computer tells us; in a browser we notice
  // that the page's clock jumped (timers don't run while the computer sleeps).
  function awayEvent(kind, secs) {
    if (!Q.active) return;
    if (Lock.on) Q.violation(kind, secs ? { secs } : null);
    else if (S.client) S.client.send("viol", { why: kind, soft: true, secs: secs || 0 });
  }
  let tickAt = Date.now();
  setInterval(() => {
    const now = Date.now(), gap = now - tickAt; tickAt = now;
    if (gap > 20000 && Q.active && !IN_APP) awayEvent("sleep", Math.round(gap / 1000));
  }, 2000);
  // the app downloaded a new version: offer to restart (never in the middle of a quiz or focus session)
  function updateBox(version) {
    if (!QDA || !QDA.installUpdate || document.querySelector(".update-box")) return;
    if (Q.active || Focus.active) { setTimeout(() => updateBox(version), 30000); return; }
    const box = h("div", { class: "update-box card", role: "dialog", "aria-label": "Update ready" },
      h("b", {}, "A new version of Quiz Duel is ready"), h("p", { class: "muted small" }, (version ? "Version " + version + ". " : "") + "It takes a few seconds and opens again by itself."),
      h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => { box.querySelector("p").textContent = "Updating..."; QDA.installUpdate().then((ok) => { if (!ok) box.remove(); }, () => box.remove()); } }, "Restart & update"),
        h("button", { class: "btn ghost", onclick: () => box.remove() }, "Later")));
    document.body.append(box);
  }
  if (QDA) QDA.on((m) => {
    if (!m) return;
    if (m.type === "displays") { appDisplays = +m.data || 1; if (Lock.on && appDisplays > 1 && !(Q.overlay && Q.overlay.why === "monitor")) Q.violation("monitor"); }
    else if (m.type === "left" && Lock.on && Date.now() > Lock.grace) Q.violation("left");
    else if ((m.type === "sleep" || m.type === "lockscreen") && Q.active) awayEvent(m.type, m.data && m.data.secs);
    else if (m.type === "update-ready") updateBox(m.data);
    else if (m.type === "lockdown-weak" && S.client && Array.isArray(m.data)) S.client.send("res", { how: "weak", what: m.data.join(", ") });
    else if (m.type === "apps-closed" && S.client && Array.isArray(m.data)) S.client.send("res", { how: "apps", what: m.data.join(", ") });
  });
  // during a quiz or focus session, links that would leave the page (like the "Powered by Netlify" badge) do nothing
  document.addEventListener("click", (e) => {
    if (!(Q.active || (typeof Focus !== "undefined" && Focus.active))) return;
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    let u; try { u = new URL(a.href, location.href); } catch (er) { return; }
    if (u.origin !== location.origin || a.target === "_blank") { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // no copying the quiz out, and no pasting text in from outside (only things copied inside your own answer)
  let innerClip = "";
  document.addEventListener("copy", () => { if (Q.active) { try { innerClip = String(window.getSelection() || ""); } catch (e) {} } }, true);
  document.addEventListener("beforeinput", (e) => {
    if (Q.active && (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop" || e.inputType === "insertFromPasteAsQuotation")) e.preventDefault();
  }, true);
  for (const evName of ["copy", "cut", "paste", "contextmenu", "drop", "dragstart"]) {
    document.addEventListener(evName, (e) => {
      if (!Q.active) return;
      if (evName === "contextmenu" && e.target && e.target.closest && e.target.closest('[spellcheck="true"]')) return;   // spelling suggestions
      e.preventDefault();
    }, true);
  }
  // ---- writing help the teacher can allow per question
  // A basic grammar check that runs in the browser (nothing is sent anywhere). It points things out; it never rewrites.
  const AN_SOUND = /^(hour|honest|honor|heir|[aeiou])/i, A_SOUND = /^(uni(?!n|m)|use|usu|eu|one|once|ubiq|uran|utens|util)/i;
  const MIXUPS = [[/\b(could|should|would|must|might) of\b/gi, "Use \u201chave\u201d here, not \u201cof\u201d"], [/\balot\b/gi, "\u201cA lot\u201d is two words"], [/\b(more|less|better|worse|bigger|smaller|faster|rather|other) then\b/gi, "Use \u201cthan\u201d to compare"],
    [/\bto (much|many)\b/gi, "Use \u201ctoo\u201d here"], [/\byour welcome\b/gi, "\u201cYou\u2019re welcome\u201d"], [/\bthere (is|are) (his|her|my|our|your)\b/gi, "Check \u201cthere\u201d / \u201ctheir\u201d"], [/\bits (a|an|the|not|been|going)\b/gi, "\u201cIt\u2019s\u201d (it is) needs an apostrophe"],
    [/\b(dont|doesnt|didnt|cant|wont|isnt|arent|wasnt|werent|couldnt|shouldnt|wouldnt|im|ive|thats|theyre|youre)\b/gi, "Missing apostrophe"], [/\bbecause of the fact that\b/gi, "\u201cBecause\u201d is enough"]];
  function grammarCheck(text) {
    const out = [], add = (msg, at) => { if (out.length < 12) out.push({ msg, near: text.slice(Math.max(0, at - 12), at + 28).replace(/\s+/g, " ").trim() }); };
    let m;
    const rx = (re, fn) => { re.lastIndex = 0; while ((m = re.exec(text))) { fn(m); if (m.index === re.lastIndex) re.lastIndex++; } };
    rx(/\b([A-Za-z']+)\s+\1\b/gi, (x) => { if (!/^(that|had|is)$/i.test(x[1])) add(`The word \u201c${x[1]}\u201d is written twice`, x.index); });
    rx(/(^|[.!?]\s+)([a-z])/g, (x) => add("Start the sentence with a capital letter", x.index + x[1].length));
    rx(/(^|\s)i(?=\s|'|\u2019|[.,!?]|$)/g, (x) => add("Write \u201cI\u201d as a capital letter", x.index + x[1].length));
    rx(/ {2,}(?=\S)/g, (x) => add("Extra spaces", x.index));
    rx(/\s+[,.;:!?]/g, (x) => add("No space before punctuation", x.index));
    rx(/[,;:](?=[A-Za-z])/g, (x) => add("Put a space after the punctuation mark", x.index));
    rx(/\b(a|an)\s+([A-Za-z]+)/gi, (x) => {
      const an = /^an$/i.test(x[1]), w = x[2];
      const vowelSound = AN_SOUND.test(w) && !A_SOUND.test(w);
      if (an && !vowelSound) add(`Use \u201ca\u201d before \u201c${w}\u201d`, x.index); else if (!an && vowelSound) add(`Use \u201can\u201d before \u201c${w}\u201d`, x.index);
    });
    for (const [re, msg] of MIXUPS) rx(re, (x) => add(msg, x.index));
    const trimmed = text.trim();
    if (trimmed.split(/\s+/).length >= 4 && !/[.!?)"\u201d]$/.test(trimmed)) add("End your last sentence with a period, question mark or exclamation mark", Math.max(0, text.length - 20));
    let pos = 0;
    for (const sent of (text.match(/[^.!?]+[.!?]*\s*/g) || [])) { if (sent.split(/\s+/).length > 40) add("This sentence is very long. Could it be two sentences?", pos); pos += sent.length + 1; }
    return out;
  }
  // Adds the allowed help under one answer box. getText() returns the plain text written so far.
  function studentTools(p, getText) {
    const t = p.tools || {};
    if (!t.grammar || (p.kind !== "long" && p.kind !== "text")) return null;
    const list = h("div", { class: "gram-list", "aria-live": "polite" });
    const btn = h("button", { class: "btn small ghost", type: "button", onclick: () => {
      const text = getText();
      if (!text.trim()) { setKids(list, h("p", { class: "muted small" }, "Write something first.")); return; }
      const found = grammarCheck(text);
      if (S.client) S.client.send("res", { how: "grammar", what: String(found.length) });
      setKids(list, found.length ? h("ul", {}, found.map((f) => h("li", {}, h("b", {}, f.msg), h("span", { class: "muted" }, `  \u2014 near \u201c${f.near}\u201d`))))
        : h("p", { class: "good small" }, "The basic check found nothing to fix."));
    } }, "Check my writing");
    return h("div", { class: "gram" }, btn, list);
  }
  // Dictionary: select one word in the question or in your answer to see what it means.
  const Dict = {
    on: false, chip: null, pop: null, cache: {},
    enable(yes) { this.on = !!yes; this.clear(); document.body.classList.toggle("dict-on", this.on); },
    clear() { if (this.chip) { this.chip.remove(); this.chip = null; } if (this.pop) { this.pop.remove(); this.pop = null; } },
    selected(e) {
      const el = e.target;
      let text = "", rect = null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && typeof el.selectionStart === "number") { text = el.value.slice(el.selectionStart, el.selectionEnd); rect = el.getBoundingClientRect(); }
      else { const sel = window.getSelection(); if (sel && sel.rangeCount && !sel.isCollapsed) { text = sel.toString(); rect = sel.getRangeAt(0).getBoundingClientRect(); } }
      const word = text.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
      return /^[A-Za-z][A-Za-z'\u2019-]{1,29}$/.test(word) ? { word: word.toLowerCase().replace(/\u2019/g, "'"), rect } : null;
    },
    onSelect(e) {
      if (!this.on || !Q.active || (e.target && e.target.closest && e.target.closest(".dict-chip, .dict-pop, .ref-panel, .music-bar, .topbar"))) return;
      const got = this.selected(e);
      if (this.chip) { this.chip.remove(); this.chip = null; }
      if (!got) return;
      this.chip = h("button", { class: "dict-chip", type: "button", onmousedown: (ev) => ev.preventDefault(), onclick: () => this.lookup(got.word, got.rect) }, `Meaning of \u201c${got.word}\u201d`);
      this.place(this.chip, got.rect);
    },
    place(el, rect) {
      document.body.append(el);
      const w = el.offsetWidth, hgt = el.offsetHeight;
      el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left)) + "px";
      el.style.top = (rect.bottom + hgt + 12 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - hgt - 6)) + "px";
    },
    async lookup(word, rect) {
      this.clear();
      const body = h("div", {}, h("p", { class: "muted" }, "Looking it up..."));
      this.pop = h("div", { class: "dict-pop", role: "dialog", "aria-label": `Meaning of ${word}` },
        h("div", { class: "dict-head" }, h("b", { class: "dict-word" }, word), h("button", { class: "btn small ghost", type: "button", onclick: () => this.clear() }, "Close")), body);
      this.place(this.pop, rect);
      if (S.client) S.client.send("res", { how: "dict", what: word });
      let data = this.cache[word];
      if (data === undefined) {
        try {
          const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word));
          data = r.status === 404 ? null : r.ok ? await r.json() : undefined;
        } catch (e) { data = undefined; }
        if (data !== undefined) this.cache[word] = data;
      }
      if (!this.pop) return;
      if (data === undefined) { setKids(body, h("p", { class: "bad" }, "The dictionary can't be reached right now.")); return; }
      const meanings = Array.isArray(data) ? data.flatMap((en) => en.meanings || []) : [];
      if (!meanings.length) { setKids(body, h("p", {}, "No meaning found for this word. Check the spelling, or try the basic form of the word.")); return; }
      const kids = [];
      for (const mng of meanings.slice(0, 3)) {
        const defs = (mng.definitions || []).filter((d) => d && d.definition);
        if (!defs.length) continue;
        const withEx = defs.find((d) => d.example) || defs[0];
        kids.push(h("div", { class: "dict-m" }, h("span", { class: "type-tag" }, mng.partOfSpeech || "word"), h("span", {}, withEx.definition),
          withEx.example ? h("p", { class: "dict-ex" }, "Example: ", h("i", {}, withEx.example)) : h("p", { class: "dict-ex muted" }, "No example sentence for this meaning.")));
      }
      setKids(body, kids);
      this.place(this.pop, rect);
    },
  };
  for (const evName of ["mouseup", "keyup", "dblclick"]) document.addEventListener(evName, (e) => { if (Dict.on) setTimeout(() => Dict.onSelect(e), 0); });

  // ---- reference pages the teacher allowed: shown inside the quiz, held to those websites only
  const Refs = {
    list: [], notes: "", el: null, win: null, poll: null, back: 0, framed: true, cspHosts: null,
    parse(text) {
      let u; try { u = new URL(String(text || "").trim()); } catch (e) { return null; }
      const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
      return u.protocol === "https:" || (u.protocol === "http:" && local) ? u : null;
    },
    // music and video websites are never allowed as reference pages
    media(u) {
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      return ["youtube.com", "youtu.be", "youtube-nocookie.com", "music.youtube.com", "spotify.com", "soundcloud.com", "music.apple.com", "pandora.com", "deezer.com", "tidal.com", "music.amazon.com", "bandcamp.com",
        "iheart.com", "tunein.com", "audiomack.com", "last.fm", "genius.com", "tiktok.com", "twitch.tv", "vimeo.com", "dailymotion.com", "netflix.com", "hulu.com", "disneyplus.com", "primevideo.com", "kick.com"]
        .some((d) => host === d || host.endsWith("." + d));
    },
    setup(st) {
      this.close();
      this.allowWin = !!st.refWin;
      this.list = (st.refs || []).map((r) => ({ title: String(r.title || ""), u: this.parse(r.url) })).filter((r) => r.u && !this.media(r.u)).slice(0, 5);
      this.notes = String(st.refNotes || "");
      if (!this.list.length) return;
      // The browser itself refuses to load any other website inside the reference frame.
      const hosts = Array.from(new Set(this.list.map((r) => r.u.origin))).sort().join(" ");
      if (this.cspHosts === null) {
        document.head.append(h("meta", { "http-equiv": "Content-Security-Policy", content: "frame-src " + hosts }));
        this.cspHosts = hosts;
      }
      this.framed = this.cspHosts === hosts;        // a second quiz with other sites (same page load) can only use the window
      if (IN_APP) QDA.allowReferences(Array.from(new Set(this.list.map((r) => r.u.origin)))).catch(() => {});
    },
    any() { return this.list.length > 0 || !!this.notes; },
    away() { return (this.win && !this.win.closed) || Date.now() < this.back; },
    button() { return this.any() ? h("button", { class: "btn tiny-btn", type: "button", onclick: () => (this.el ? this.close() : this.open(0)) }, "References") : null; },
    open(idx) {
      this.close();
      const tabs = this.list.map((r) => ({ label: r.title, ref: r }));
      if (this.notes) tabs.push({ label: "Teacher's notes", notes: true });
      const body = h("div", { class: "ref-body" }), foot = h("div", { class: "ref-foot" });
      const tabEls = tabs.map((t, i) => h("button", { class: "ref-tab", type: "button", role: "tab", onclick: () => pick(i) }, t.label));
      const pick = (i) => {
        const t = tabs[i];
        tabEls.forEach((b, k) => b.setAttribute("aria-selected", String(k === i)));
        if (t.notes) { setKids(body, h("div", { class: "paper ref-notes" }, this.notes)); setKids(foot, h("span", { class: "muted small" }, "Notes from your teacher.")); return; }
        if (S.client) S.client.send("res", { what: t.ref.title, how: "panel" });
        setKids(body, this.framed
          ? h("iframe", { class: "ref-frame", src: t.ref.u.href, title: t.ref.title, sandbox: "allow-scripts allow-same-origin allow-forms", referrerpolicy: "no-referrer",
            allow: "autoplay 'none'; fullscreen 'none'; camera 'none'; microphone 'none'; display-capture 'none'; picture-in-picture 'none'" })
          : h("p", { class: "muted ref-empty" }, this.allowWin ? "This page can only be opened in its own window." : "This page can't be shown right now. Tell your teacher."));
        const win = this.allowWin && !IN_APP;
        setKids(foot, h("span", { class: "muted small" }, win ? "Only this website can be shown here. Page not showing? Some websites refuse to appear inside another page."
          : "Only this website can be shown here. If the page stays blank, tell your teacher: some websites refuse to appear inside another page."),
          !win ? null : h("button", { class: "btn small ghost", type: "button", onclick: () => this.popup(t.ref) }, "Open it in its own window"));
      };
      this.el = h("aside", { class: "ref-panel", role: "complementary", "aria-label": "References" },
        h("div", { class: "ref-head" }, h("div", { class: "ref-tabs", role: "tablist" }, tabEls), h("button", { class: "btn small ghost", type: "button", onclick: () => this.close() }, "Close")),
        body, foot);
      document.body.append(this.el);
      pick(Math.min(idx || 0, tabs.length - 1));
    },
    // fallback for websites that refuse to be shown inside another page
    popup(ref) {
      let w = null;
      try { w = window.open("", "qd-reference", "popup=yes,width=1100,height=820"); } catch (e) { /* blocked */ }
      if (!w) return;
      try { w.opener = null; } catch (e) { /* ignore */ }
      w.location.href = ref.u.href;
      this.win = w;
      if (S.client) S.client.send("res", { what: ref.title, how: "window" });
      clearInterval(this.poll);
      this.poll = setInterval(() => {
        if (this.win && !this.win.closed) return;
        clearInterval(this.poll); this.win = null;
        if (S.client) S.client.send("res", { what: ref.title, how: "closed" });
        if (!Lock.on) return;
        this.back = Date.now() + 20000;                         // time to press the button below
        const ov = h("div", { class: "overlay navy", id: "ref-back" }, h("div", { class: "ov-box" }, h("h2", {}, "Back to the quiz"),
          h("button", { class: "btn light big", onclick: () => { ov.remove(); this.back = 0; Lock.enterFullscreen(); } }, "Continue the quiz")));
        document.body.append(ov);
        ov.querySelector("button").focus();
      }, 500);
    },
    close() { if (this.el) { this.el.remove(); this.el = null; } },
    end() { this.close(); clearInterval(this.poll); if (this.win && !this.win.closed) { try { this.win.close(); } catch (e) { /* ignore */ } } this.win = null; this.back = 0; const b = $("#ref-back"); if (b) b.remove(); this.list = []; this.notes = ""; },
  };

  // ---- focus sounds: a bar at the bottom of the quiz. Only the built-in sounds the teacher allowed.
  const MusicBar = {
    el: null,
    // groups: which kinds of music are allowed. "All" plays every allowed track one after another and repeats.
    show(groups, preferAll) {
      this.hide();
      const sounds = M.Music.SOUNDS.filter((x) => groups.includes(x.group));
      if (!sounds.length) return;
      const pref = store.get("qd-music") || {};
      const ALL = "__all";
      let cur = preferAll && !pref.sound ? ALL : (pref.sound === ALL || sounds.find((x) => x.id === pref.sound)) ? pref.sound : (preferAll ? ALL : sounds[0].id);
      const startCur = () => cur === ALL ? M.Music.playList(sounds.map((x) => x.id)) : M.Music.play(cur);
      const vol = typeof pref.vol === "number" ? pref.vol : 0.5;
      M.Music.setVolume(vol);
      const save = () => store.set("qd-music", { sound: cur, vol: +slider.value });
      const btn = h("button", { class: "btn small music-play", type: "button", "aria-pressed": "false", onclick: () => {
        if (M.Music.playing()) { M.Music.stop(); paint(); return; }
        if (!startCur()) { note.textContent = "This browser can't play sound."; return; }
        paint();
      } }, "Play");
      const pick = h("select", { class: "input", "aria-label": "Sound", onchange: () => { cur = pick.value; save(); if (M.Music.playing()) startCur(); } },
        h("option", { value: ALL, selected: cur === ALL }, `All of it \u2014 ${sounds.length} tracks, one after another (repeats)`),
        M.Music.GROUPS.filter(([g]) => groups.includes(g)).map(([g, label]) => h("optgroup", { label }, sounds.filter((x) => x.group === g).map((x) => h("option", { value: x.id, selected: x.id === cur }, x.name)))));
      // in playlist mode, show what's playing now
      const nowEl = h("span", { class: "muted small music-now" });
      const nowId = setInterval(() => { if (!this.el) { clearInterval(nowId); return; } const id = M.Music.inList() ? M.Music.current() : null; const x = id && M.Music.SOUNDS.find((y) => y.id === id); nowEl.textContent = x ? "Now: " + x.name : ""; }, 1000);
      const slider = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: vol, "aria-label": "Volume", oninput: () => { M.Music.setVolume(+slider.value); save(); } });
      const note = h("span", { class: "muted small" });
      const paint = () => { const on = !!M.Music.playing(); btn.textContent = on ? "Pause" : "Play"; btn.setAttribute("aria-pressed", String(on)); };
      this.el = h("div", { class: "music-bar", role: "region", "aria-label": "Focus sounds" }, h("span", { class: "music-label" }, "Focus sounds"), btn, pick,
        h("label", { class: "music-vol" }, h("span", {}, "Volume"), slider), nowEl, note);
      document.body.append(this.el);
      document.body.classList.add("has-music");
    },
    hide() { M.Music.stop(); if (this.el) { this.el.remove(); this.el = null; } document.body.classList.remove("has-music"); },
  };

  // ---- help panel for anyone who is stuck: press Up, Up, Down, Up
  let arrows = [];
  document.addEventListener("keydown", (e) => {
    if (!e.key.startsWith("Arrow")) { arrows = []; return; }
    if (e.target && e.target.matches && e.target.matches("input[type=number], input[type=range], select")) { arrows = []; return; }   // arrows change those
    const now = Date.now();
    arrows = arrows.filter((a) => now - a.t < 4000).concat({ k: e.key, t: now }).slice(-4);
    const seq = arrows.map((a) => a.k).join();
    if (seq === "ArrowUp,ArrowUp,ArrowDown,ArrowUp" || seq === "ArrowDown,ArrowDown,ArrowUp,ArrowDown") { arrows = []; e.preventDefault(); helpPanel(); }
  }, true);
  // Always works for a student: shows the code for 5 seconds, then closes whatever they are in.
  function helpPanel() {
    if ($("#help-panel")) return;
    if (Runners.list.length || (S.teacherOk && !Q.active && !Focus.active)) return;       // not on the teacher's own screens
    const saved = store.get("md-student");
    const inFocus = Focus.active;
    const code = inFocus ? (Focus.code || "") : (S.client && S.client.code) || (saved && saved.code) || URL_CODE || "";
    const inQuiz = Q.active && S.client;
    let left = 5, timer = null;
    const close = () => { clearInterval(timer); box.remove(); };
    const exit = () => {
      close();
      if (inFocus) { if (Focus.end) Focus.end(); return; }
      const wasActive = Q.active;
      if (wasActive) Q.leaveNow("emergency");                // tells the teacher, then ends the quiz
      else { if (S.client) { S.client.close(); S.client = null; } store.del("md-student"); }
      if (IN_APP) setTimeout(quitApp, inQuiz ? 1500 : 0);
      else if (!wasActive) home();
    };
    const what = inFocus ? "This focus session ends" : IN_APP ? "Quiz Duel closes" : Q.active ? "The quiz closes" : "This page closes";
    const count = h("p", { class: "ov-wait", "aria-live": "polite" });
    const paint = () => { count.textContent = `${what} in ${left}...`; };
    const box = h("div", { id: "help-panel", class: "overlay navy", role: "dialog", "aria-modal": "true", "aria-label": "Help" },
      h("div", { class: "ov-box" },
        h("h2", {}, "Stuck?"),
        code ? h("p", {}, inFocus ? "Your focus code is" : "Your quiz code is") : h("p", {}, "No code is saved on this device."),
        code ? h("p", { class: "bigcode", style: "color:#5ce1ff" }, code) : null,
        count,
        inQuiz ? h("p", {}, "Your teacher is told that you left this way.") : null,
        h("div", { class: "row center" }, h("button", { class: "btn ghost-light", onclick: close }, "Stay \u2014 don't close"))));
    document.body.append(box);
    paint();
    timer = setInterval(() => { left--; if (left <= 0) exit(); else paint(); }, 1000);
    box.querySelector(".ghost-light").focus();
  }
  window.addEventListener("beforeunload", (e) => {
    if (Lock.on || Runners.list.length) { e.preventDefault(); e.returnValue = ""; }
  });

  // ================================================================ the quiz itself
  const Q = {
    active: false, overlay: null,
    reset() {
      Object.assign(this, { i: 0, you: 0, them: 0, youRounds: 0, themRounds: 0, results: [], violations: [], drafts: {}, started: Date.now(), overlay: null, finished: null, dom: null });
    },
    setup() {
      this.st = S.quiz.settings; this.problems = S.quiz.problems; this.total = this.problems.length;
      this.rival = this.st.rival ? M.RIVALS[this.st.rival] : null;
    },
    save() {
      if (!S.client || this.finished) return;
      store.set("md-student", { state: "quiz", code: S.client.code, name: S.client.name, email: S.client.email, sid: S.client.sid, i: this.i, them: this.them,
        youRounds: this.youRounds, themRounds: this.themRounds, started: this.started, violations: this.violations, results: this.results, drafts: this.drafts });
    },
    restore(saved) {
      this.reset();
      this.setup();
      Object.assign(this, { i: saved.i || 0, them: saved.them || 0, youRounds: saved.youRounds || 0, themRounds: saved.themRounds || 0,
        started: saved.started || Date.now(), violations: saved.violations || [], drafts: saved.drafts || {} });
      this.results = saved.results || [];
      this.rescore();
      // answers that hadn't been checked yet get sent again (same id, so they're never counted twice)
      this.results.forEach((r, k) => { if (r && r.pts === null && !r.waiting && r.eid) S.client.send("ans", { qn: k + 1, i: k + 1, raw: r.skipped ? "" : r.raw, skipped: r.skipped, secs: r.secs }, r.eid); });
    },
    resume() {
      // reloading the page during a quiz counts as leaving it
      this.active = true;
      this.hookClient();
      Lock.start(this.st);
      MusicBar.show(this.st.music || []);
      Refs.setup(this.st);
      if (!this.st.form && this.i > 0 && !this.results[this.i - 1]) this.i -= 1;     // the question that was open is shown again
      const allDone = this.results.filter(Boolean).length >= this.total;
      this.next();
      if (Lock.on && !allDone && !this.continued) this.violation(IN_APP && QDA && QDA.relaunched ? "closed" : "reload");
      this.continued = false;
    },
    hookClient() {
      if (!S.client) return;
      S.client.onCmd = (c) => this.onCmd(c);
      S.client.onGraded = (eid, g) => {
        const k = this.results.findIndex((r) => r && r.eid === eid);
        if (k >= 0) this.onGraded(k, g);
      };
    },
    rescore() { this.you = this.results.reduce((a, r) => a + (r && typeof r.pts === "number" ? r.pts : 0), 0); },
    stamp() { return clock((Date.now() - this.started) / 1000); },

    violation(why, extra) {
      if (this.overlay && this.overlay.why !== "leave" && this.overlay.why !== "unlocked") return;     // already frozen
      this.violations.push([why, `${this.stamp()}  (question ${this.i})`]);
      if (S.client) { S.client.frozen = true; S.client.send("viol", Object.assign({ why }, extra || {})); }
      this.save();
      this.showOverlay(why);
    },
    requestLeave() {
      if (!Lock.on || this.overlay) return;
      this.showOverlay("leave");
      if (S.client) S.client.send("leave_req");
    },
    showOverlay(why) {
      if (this.overlay) return;
      const leave = why === "leave";
      let head, sub, wait = "Waiting for your teacher to unlock you...";
      if (leave) {
        head = "Leave the quiz?";
        sub = "Your answers so far are saved and sent to your teacher. To leave, your teacher types the unlock code here, or lets you leave from their screen.";
        wait = "Your teacher has been asked...";
      } else if (why === "monitor") { head = "Extra monitor detected"; sub = "Only one screen is allowed. Unplug the extra monitor. Your teacher has been told."; }
      else if (why === "reload") { head = "You reloaded the quiz"; sub = "The quiz is frozen and your teacher has been told."; }
      else if (why === "sleep") { head = "Your computer went to sleep"; sub = "Closing the lid or sleeping counts as leaving. The quiz is frozen and your teacher has been told."; }
      else if (why === "lockscreen") { head = "You locked the screen"; sub = "Locking the computer counts as leaving. The quiz is frozen and your teacher has been told."; }
      else if (why === "closed") { head = "Quiz Duel was closed"; sub = "The app was closed or the computer restarted during the quiz. The quiz is frozen and your teacher has been told."; }
      else { head = "You left the quiz"; sub = "The quiz is frozen and your teacher has been told."; }
      if (this.rival && !leave) sub += ` ${this.rival.name} is still racing!`;
      const waitEl = h("p", { class: "ov-wait" }, wait);
      const pin = h("input", { class: "input pin-in", type: "password", inputmode: "numeric", maxlength: 6, autocomplete: "off", "aria-label": "unlock code" });
      const msg = h("p", { class: "ov-msg" });
      const submit = (e) => {
        if (e) e.preventDefault();
        if (S.client && this.st.unlock && unlockHash(S.client.code, pin.value.trim()) === this.st.unlock) {
          if (leave) this.leaveNow("unlock code"); else this.unlocked("unlock code");
        } else { msg.textContent = "That's not the unlock code."; pin.value = ""; pin.focus(); }
      };
      const el = h("div", { class: "overlay " + (leave ? "navy" : "red"), role: "dialog", "aria-modal": "true" },
        h("div", { class: "ov-box" }, h("h2", {}, head), h("p", {}, sub), waitEl,
          h("form", { onsubmit: submit }, h("label", {}, "Teacher: type the unlock code"), pin, msg,
            h("div", { class: "row center" }, h("button", { class: "btn light", type: "submit" }, leave ? "Leave quiz" : "Unlock"),
              leave ? h("button", { class: "btn ghost-light", type: "button", onclick: () => {
                Lock.enterFullscreen(); this.dropOverlay(); if (S.client) S.client.send("leave_cancel");
              } }, "Cancel — back to the quiz") : null))));
      this.overlay = { el, why, waitEl };
      document.body.append(el);
      pin.focus();
    },
    dropOverlay() {
      if (this.overlay) { this.overlay.el.remove(); this.overlay = null; }
      Lock.lost = 0;
      if (this.dom && !this.dom.locked && this.dom.focus) this.dom.focus();
    },
    unlocked(how) {
      // one click to go back to full screen (browsers require it)
      if (S.client) { S.client.frozen = false; S.client.send("unfrozen", { how }); }
      const box = this.overlay && this.overlay.el.querySelector(".ov-box");
      if (!box) return;
      this.overlay.why = "unlocked";
      box.replaceChildren(h("h2", {}, "You're unlocked"), h("p", {}, "Click to go back to your quiz."),
        h("button", { class: "btn light big", onclick: () => { Lock.enterFullscreen(); this.dropOverlay(); this.save(); } }, "Back to the quiz"));
      box.querySelector("button").focus();
    },
    onCmd(cmd) {
      if (cmd && typeof cmd === "object") { if (cmd.cmd === "grade") this.setGrade(cmd.eid, cmd.pts); return; }
      if (this.finished) return;
      if (cmd === "leave") { this.leaveNow("teacher"); return; }
      if (cmd === "unlock" && this.overlay && this.overlay.why !== "leave" && this.overlay.why !== "unlocked") {
        if (this.overlay.why === "monitor" && extraMonitor()) { this.overlay.waitEl.textContent = "Unplug the extra monitor first — then your teacher can unlock you."; return; }
        this.unlocked("teacher");
      }
    },
    leaveNow(how) {
      if (S.client) S.client.send("quit", { how });
      this.dropOverlay();
      this.finish(true);
    },

    next() {
      if (this.overlay && this.overlay.why !== "unlocked") return;
      if (this.st.form) { this.formPage(); return; }
      if (this.i >= this.total) { this.finish(false); return; }
      this.i++;
      this.prob = this.problems[this.i - 1];
      this.raceOn = !!this.rival && this.prob.kind !== "long";       // no racing on written answers
      [this.rt, this.rpts] = this.raceOn ? M.rivalAttempt(this.st.rival, this.prob) : [0, 0];
      this.answered = true;
      if (S.client) { S.client.current = this.i; S.client.send("q"); }
      this.save();
      const secs = this.st.countdown === true ? 5 : (+this.st.countdown || 0);
      const countdown = () => {
        if (!secs) { this.question(); return; }
        const num = h("div", { class: "cd-num" }, String(secs));
        show(this.header(), h("main", { class: "quiz" }, h("section", { class: "card cd" },
          h("p", { class: "cd-q" }, `Question ${this.i} of ${this.total}`), h("p", { class: "muted" }, "Get ready..."), num)));
        let k = secs;
        const step = () => {
          if (this.overlay) { later(250, step); return; }
          k--;
          if (k > 0) { num.textContent = k; later(1000, step); }
          else { num.textContent = "GO!"; num.classList.add("go"); later(450, () => this.question()); }
        };
        later(1000, step);
      };
      const every = +this.st.breakEvery || 0;
      if (every && this.i > 1 && (this.i - 1) % every === 0) this.breakTime(countdown); else countdown();
    },
    // a short rest between questions (the teacher sets how often and how long)
    breakTime(then) {
      let left = Math.max(5, +this.st.breakSecs || 60), over = false;
      const fmt = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
      const num = h("div", { class: "cd-num brk" }, fmt(left));
      const end = () => { if (over) return; over = true; then(); };
      show(this.header(), h("main", { class: "quiz" }, h("section", { class: "card cd" },
        h("p", { class: "cd-q" }, "Break time"), h("p", { class: "muted" }, `Stretch, breathe, rest your eyes. ${this.i - 1} of ${this.total} questions done.`), num,
        h("div", { class: "row center" }, h("button", { class: "btn ghost", onclick: end }, "I'm ready \u2014 keep going")))));
      const step = () => {
        if (over) return;
        if (!this.overlay) { left--; num.textContent = fmt(Math.max(0, left)); }
        if (left <= 0) end(); else later(1000, step);
      };
      later(1000, step);
    },
    header() {
      const left = [S.preview ? APP + "  ·  Student preview" : APP + (S.client ? `  ·  ${S.client.name}` : ""),
        statusChip(S.client ? S.client.code : S.preview ? "Preview" : "Practice")];
      const leaveBtn = Lock.on ? h("button", { class: "btn tiny-btn", onclick: () => this.requestLeave() }, "Leave quiz (Esc)") : null;
      this.scoreEl = h("span", {});
      this.paintScore();
      const net = S.client ? h("span", { class: "net", role: "status" }) : null;
      if (net) {
        const paint = () => {
          const on = S.client && S.client.connected && navigator.onLine, waiting = S.client ? S.client.unacked.size : 0;
          net.className = "net " + (on ? (waiting ? "sending" : "on") : "off");
          net.textContent = on ? (waiting ? "Sending..." : "Online") : "Offline \u2014 answers saved here";
          net.title = on ? "Connected to your teacher" : "Your answers are saved on this computer and will be sent when the internet is back.";
        };
        paint();
        const tm = setInterval(() => { if (!net.isConnected) clearInterval(tm); else paint(); }, 1000);
      }
      const pv = S.preview ? [h("span", { class: "pill warn", title: "Nothing you do here is recorded or sent." + (S.preview.security !== "low" || S.preview.games ? " The lock (" + [S.preview.security !== "low" ? SECURITY[S.preview.security] + " security" : "", S.preview.games ? "anti-game" : ""].filter(Boolean).join(" + ") + ") is off in preview." : "") }, "Preview — nothing is recorded"),
        h("button", { class: "btn tiny-btn", onclick: () => exitPreview() }, "Exit preview")] : null;
      return topbar(left, [net, this.scoreEl], [pv, leaveBtn, Refs.button()]);
    },
    paintScore() {
      if (!this.scoreEl) return;
      if (this.st.form) {
        const per = Math.max(1, +this.st.perPage || 5), done = this.results.filter(Boolean).length;
        this.scoreEl.replaceChildren(`Page ${Math.min(Math.floor(done / per) + 1, Math.ceil(this.total / per))} of ${Math.ceil(this.total / per)}`, h("span", { class: "sep" }, "|"), `${done} of ${this.total} answered`);
        return;
      }
      this.scoreEl.replaceChildren(`Question ${this.i} of ${this.total}`, h("span", { class: "sep" }, "|"), `You ${M.fmtPts(this.you)}`,
        this.rival ? ` — ${this.rival.name} ${M.fmtPts(this.them)}` : "");
    },
    // ---- form layout: a page of questions to scroll through, handed in together with "Next page"
    formPage() {
      stopDrafts();
      const per = Math.max(1, +this.st.perPage || 5);
      const first = this.results.findIndex((r, k) => !r && k < this.total);
      const start = first >= 0 ? first : this.results.length;
      if (start >= this.total) { this.finish(false); return; }
      const from = Math.floor(start / per) * per, to = Math.min(this.total, from + per), last = to >= this.total;
      this.i = to; this.dom = null; this.raceOn = false; this.answered = false;
      if (S.client) { S.client.current = to; S.client.send("q"); }
      this.save();
      const items = [];
      for (let k = from; k < to; k++) {
        if (this.results[k]) continue;                       // already handed in (after a reload)
        const p = this.problems[k];
        const howto = h("p", { class: "howto" }, M.HOW_TO_TYPE[p.kind] || "");
        let input, getRaw;
        if (p.kind === "choice" || p.kind === "yesno") {
          const opts = p.kind === "yesno" ? [["yes", "Yes"], ["no", "No"]] : p.options.map((o, i) => [String(i), o]);
          let picked = "";
          input = h("div", { class: "choices", role: "radiogroup", "aria-label": `Answer choices for question ${k + 1}` }, opts.map(([v, label]) => h("label", { class: "choice" },
            h("input", { type: "radio", name: "pick" + k, value: v, onchange: () => { picked = v; } }), h("span", {}, label))));
          getRaw = () => picked;
          keepDraft(k, () => picked, (d) => { const r = input.querySelector(`input[value="${d}"]`); if (r) { r.checked = true; picked = d; } });
        } else if (p.kind === "long") {
          const w = writer(p.tools && p.tools.spell); w.page.id = "answer" + (k + 1);
          input = h("div", { class: "answer-col" }, w.box, studentTools(p, () => w.page.innerText)); getRaw = () => w.isEmpty() ? "" : w.html();
          keepDraft(k, getRaw, (d) => { w.page.replaceChildren(richClean(d)); });
        } else {
          input = h("input", { id: "answer" + (k + 1), class: "input answer" + (p.kind === "text" ? "" : " mono"), autocomplete: "off", autocorrect: "off", autocapitalize: "off", spellcheck: p.kind === "text" && p.tools && p.tools.spell ? "true" : "false", lang: "en", "aria-label": `Your answer to question ${k + 1}`,
            onkeydown: (e) => { if (e.key === "Enter") e.preventDefault(); } });
          const field = input, extra = studentTools(p, () => field.value);
          getRaw = () => field.value.trim();
          keepDraft(k, () => field.value, (d) => { field.value = d; });
          if (extra) input = h("div", { class: "answer-col" }, field, extra);
        }
        const box = h("section", { class: "card qcard form-q" + (p.graph ? " with-graph" : "") },
          h("div", { class: "qmain" }, h("p", { class: "kicker" }, `Question ${k + 1}`),
            h("pre", { class: "question" + (M.MATH_KINDS.includes(p.kind) ? " mono" : "") }, p.q), input, howto),
          p.graph ? graphSvg(p.graph) : null);
        items.push({ k, p, box, howto, getRaw });
      }
      Dict.enable(items.some((it) => it.p.tools && it.p.tools.dict));
      const msg = h("p", { class: "msg", "aria-live": "polite" });
      let warned = "";
      const t0 = Date.now();
      const handIn = () => {
        if (this.overlay && this.overlay.why !== "unlocked") return;
        const unreadable = [], blank = [];
        for (const it of items) {
          const raw = it.getRaw();
          it.box.classList.remove("needs-fix"); it.howto.className = "howto"; it.howto.textContent = M.HOW_TO_TYPE[it.p.kind] || "";
          if (!raw) blank.push(it);
          else if (!M.readable(it.p, raw)) { unreadable.push(it); it.box.classList.add("needs-fix"); it.howto.className = "howto bad"; it.howto.textContent = "I can't read this answer. " + (M.HOW_TO_TYPE[it.p.kind] || ""); }
        }
        if (unreadable.length) { msg.className = "msg bad"; msg.textContent = `Fix question ${unreadable.map((it) => it.k + 1).join(", ")} first: the answer isn't in a form I can read.`; unreadable[0].box.scrollIntoView({ block: "center" }); return; }
        const blanks = blank.map((it) => it.k + 1).join(", ");
        if (blank.length && warned !== blanks) {
          warned = blanks; blank.forEach((it) => it.box.classList.add("needs-fix"));
          msg.className = "msg bad"; msg.textContent = `Question ${blanks} ${blank.length === 1 ? "is" : "are"} blank. Press the button again to hand in anyway.`;
          blank[0].box.scrollIntoView({ block: "center" }); return;
        }
        wipeClipboard();
        const secs = Math.round((Date.now() - t0) / 100) / 10;
        for (const it of items) {
          const raw = it.getRaw(), skip = !raw;
          const entry = { raw, skipped: skip, secs, pts: null, waiting: false, race: false, rt: 0, rpts: 0, counted: false };
          this.results[it.k] = entry;
          delete this.drafts[it.k];
          if (S.client) entry.eid = S.client.send("ans", { qn: it.k + 1, i: it.k + 1, raw, skipped: skip, secs });
          else { const pts = skip ? 0 : M.grade(it.p, raw); this.onGraded(it.k, { pts, waiting: pts === null, ans: M.answerText(it.p), sol: it.p.sol }); }
        }
        this.save();
        this.formPage();
      };
      show(this.header(), h("main", { class: "quiz form-page" }, items.map((it) => it.box),
        h("section", { class: "card form-foot" }, msg,
          h("div", { class: "row" }, h("button", { class: "btn big good", type: "button", onclick: handIn }, last ? "Hand in the quiz \u203a" : "Next page \u203a"),
            h("span", { class: "muted" }, last ? "This is the last page." : "Check your answers first. You can't come back to this page.")))));
    },
    question() {
      stopDrafts();
      const p = this.prob;
      const howto = h("p", { class: "howto" }, M.HOW_TO_TYPE[p.kind] || "");
      const submitBtn = h("button", { class: "btn", type: "submit" }, "Submit");
      const skipBtn = h("button", { class: "btn ghost", type: "button", onclick: () => this.submit(true) }, "Skip");
      let form, getRaw, focus;
      if (p.kind === "choice" || p.kind === "yesno") {
        // pick one
        const opts = p.kind === "yesno" ? [["yes", "Yes"], ["no", "No"]] : p.options.map((o, i) => [String(i), o]);
        let picked = "";
        const radios = opts.map(([v, label]) => h("label", { class: "choice" },
          h("input", { type: "radio", name: "pick", value: v, onchange: () => { picked = v; } }), h("span", {}, label)));
        form = h("form", { class: "answer-col", onsubmit: (e) => { e.preventDefault(); this.submit(false); } },
          h("div", { class: "choices", role: "radiogroup", "aria-label": "Answer choices" }, radios), h("div", { class: "answer-row" }, submitBtn, skipBtn));
        getRaw = () => picked;
        focus = () => { const r = form.querySelector("input[type=radio]:not(:disabled)"); if (r) r.focus(); };
      } else if (p.kind === "long") {
        const w = writer(p.tools && p.tools.spell);
        form = h("form", { class: "answer-col", onsubmit: (e) => { e.preventDefault(); this.submit(false); } }, w.box, studentTools(p, () => w.page.innerText), h("div", { class: "answer-row" }, submitBtn, skipBtn));
        form.lockWriter = w.lock;
        getRaw = () => w.isEmpty() ? "" : w.html();
        focus = () => w.page.focus();
        keepDraft(this.i - 1, () => w.isEmpty() ? "" : w.html(), (d) => { w.page.replaceChildren(richClean(d)); });
      } else {
        const answer = h("input", { id: "answer", class: "input answer" + (p.kind === "text" ? "" : " mono"), autocomplete: "off", autocorrect: "off", autocapitalize: "off", spellcheck: p.kind === "text" && p.tools && p.tools.spell ? "true" : "false", lang: "en", "aria-label": "Your answer" });
        const extra = studentTools(p, () => answer.value);
        form = h("form", { class: "answer-row", onsubmit: (e) => { e.preventDefault(); this.submit(false); } }, answer, submitBtn, skipBtn, extra);
        getRaw = () => answer.value.trim();
        focus = () => answer.focus();
        keepDraft(this.i - 1, () => answer.value, (d) => { answer.value = d; });
      }
      const timeEl = h("span", { class: "time" }, "0.0s");
      let race = null;
      if (this.raceOn) {
        this.bar = h("div", { class: "bar-fill" });
        this.rmsg = h("p", { class: "rmsg" }, "solving...");
        race = h("div", { class: "race" }, h("div", { class: "race-row" }, h("b", {}, "You: "), timeEl),
          h("div", { class: "race-row" }, h("b", {}, this.rival.name)), h("div", { class: "bar" }, this.bar), this.rmsg);
      }
      this.fb = h("div", { class: "fb", "aria-live": "polite" });
      this.dom = { howto, form, submitBtn, skipBtn, timeEl, getRaw, focus, locked: false,
        lock: () => { this.dom.locked = true; form.querySelectorAll("input,textarea").forEach((el) => { el.disabled = true; }); if (form.lockWriter) form.lockWriter(); } };
      show(this.header(), h("main", { class: "quiz" }, h("section", { class: "card qcard" + (p.graph ? " with-graph" : "") },
        h("div", { class: "qmain" },
          h("p", { class: "kicker" }, `Question ${this.i}`),
          h("pre", { class: "question" + (M.MATH_KINDS.includes(p.kind) ? " mono" : "") }, p.q),
          form, howto, race || h("p", { class: "muted" }, h("b", {}, "Time: "), timeEl), this.fb),
        p.graph ? graphSvg(p.graph) : null)));
      this.answered = false;
      this.t0 = Date.now();
      Dict.enable(p.tools && p.tools.dict);
      focus();
      every(100, () => this.tick());
    },
    tick() {
      if (this.answered) return;
      const el = (Date.now() - this.t0) / 1000;
      this.dom.timeEl.textContent = el.toFixed(1) + "s";
      if (this.raceOn) {
        const frac = Math.min(1, el / this.rt);
        this.bar.style.width = (frac * 100) + "%";
        const left = this.rt - el;
        if (frac >= 1) { this.rmsg.textContent = `${this.rival.name} finished! Keep going...`; this.rmsg.className = "rmsg warn"; }
        else if (left <= 5) { this.rmsg.textContent = `${this.rival.name} finishes in ${Math.floor(left) + 1}...`; this.rmsg.className = "rmsg bad big"; }
      }
    },
    submit(skip) {
      if (this.answered || (this.overlay && this.overlay.why !== "unlocked")) return;
      const d = this.dom, p = this.prob;
      const raw = d.getRaw();
      const complain = (text) => { d.howto.textContent = text; d.howto.className = "howto bad"; d.focus(); };
      if (!raw && !skip) { complain(p.kind === "choice" || p.kind === "yesno" ? "Pick an answer first (or press Skip)." : "Type an answer first (or press Skip)."); return; }
      wipeClipboard();
      if (!skip && !M.readable(p, raw)) {
        complain("That answer isn't in a form I can read (no penalty — fix it and submit again). " + (M.HOW_TO_TYPE[p.kind] || ""));
        return;
      }
      this.answered = true;
      const secs = Math.round((Date.now() - this.t0) / 100) / 10;
      d.lock();
      d.howto.className = "howto";
      d.howto.textContent = M.HOW_TO_TYPE[p.kind] || "";
      if (this.raceOn) this.bar.style.width = Math.min(100, secs / this.rt * 100) + "%";
      const k = this.i - 1;
      const entry = { raw: skip ? "" : raw, skipped: skip, secs, pts: null, waiting: false, race: this.raceOn, rt: this.rt, rpts: this.rpts, counted: false };
      this.results[k] = entry;
      delete this.drafts[k];
      d.submitBtn.remove(); d.skipBtn.remove();
      if (S.client) {
        // the teacher's tab checks the answer and sends back the result
        entry.eid = S.client.send("ans", { qn: this.i, raw: skip ? "" : raw, skipped: skip, secs });
        this.save();
        const qn = this.i;
        if (!S.client.connected || !navigator.onLine) {
          this.fb.replaceChildren(h("p", { class: "warn" }, "You're offline. Your answer is saved on this computer and will be sent and checked when the internet is back. Keep going."));
          this.addNext();
          return;
        }
        this.fb.replaceChildren(h("p", { class: "muted" }, "Checking your answer..."));
        later(8000, () => {
          if (this.results[k] && this.results[k].pts === null && !this.results[k].waiting && this.i === qn) {
            this.fb.replaceChildren(h("p", { class: "warn" }, "Your answer is saved. It will be checked as soon as your teacher's connection is back."));
            this.addNext();
          }
        });
      } else {
        const pts = skip ? 0 : M.grade(p, raw);
        this.onGraded(k, { pts, waiting: pts === null, ans: M.answerText(p), sol: p.sol });
      }
    },
    // the result for an answer arrived (from the teacher's tab, or worked out here in practice mode)
    onGraded(k, g) {
      const entry = this.results[k];
      if (!entry || entry.pts !== null || entry.waiting) return;
      entry.ans = g.ans; entry.sol = g.sol;
      if (g.waiting) entry.waiting = true;            // a long answer: the teacher will read it
      else {
        entry.pts = g.pts;
        if (entry.race && !entry.counted) {
          entry.counted = true;
          this.them += entry.rpts;
          if (g.pts > entry.rpts || (g.pts === entry.rpts && g.pts > 0 && entry.secs < entry.rt)) { this.youRounds++; entry.round = "you"; }
          else if (entry.rpts > g.pts || (g.pts === entry.rpts && g.pts > 0)) { this.themRounds++; entry.round = "them"; }
          else entry.round = "none";
        }
      }
      this.rescore();
      this.paintScore();
      this.save();
      if (!this.finished && k === this.i - 1 && this.dom && this.dom.locked) this.renderVerdict(entry);
    },
    // the teacher gave (or changed) the points for one of our answers
    setGrade(eid, pts) {
      const k = this.results.findIndex((r) => r && r.eid === eid);
      if (k < 0) return;
      const entry = this.results[k];
      entry.pts = pts; entry.waiting = false; entry.byTeacher = true;
      this.rescore();
      this.paintScore();
      this.save();
      if (this.finished) this.renderResults();
      else if (k === this.i - 1 && this.dom && this.dom.locked) this.renderVerdict(entry);
    },
    renderVerdict(entry) {
      let verdict;
      if (entry.waiting) verdict = ["Saved. Your teacher will read and grade this answer.", "navy"];
      else if (entry.pts === 1) verdict = ["Correct!  +1", "good"];
      else if (entry.pts === 0.5) verdict = [M.MATH_KINDS.includes(this.prob.kind) && !entry.byTeacher ? "Sign slip — check your negative or your < > = sign.  +1/2" : "Half credit.  +1/2", "warn"];
      else verdict = [entry.skipped ? "Skipped.  +0" : "Not quite.  +0", "bad"];
      const kids = [h("p", { class: "verdict " + verdict[1] }, verdict[0], h("span", { class: "muted small" }, `  (${entry.secs}s)`))];
      if (entry.waiting && !S.client) kids[0] = h("p", { class: "verdict navy" }, "Compare your answer with the model answer, then give yourself points.");
      if (entry.ans) kids.push(h("p", { class: "ans" }, "Answer: " + entry.ans));
      if (entry.sol) kids.push(h("pre", { class: "sol" }, entry.sol));
      if (entry.waiting && !S.client) {
        kids.push(h("div", { class: "row small-gap" }, h("span", {}, "My answer deserves:"), [0, 0.5, 1].map((v) => h("button", { class: "btn small ghost", type: "button", onclick: () => {
          entry.pts = v; entry.waiting = false; entry.byTeacher = true; this.rescore(); this.paintScore(); this.renderVerdict(entry);
        } }, v === 0.5 ? "½" : String(v)))));
      }
      if (entry.race && entry.counted) {
        const rv = { 1: "got it", 0.5: "got half", 0: "missed it" }[entry.rpts];
        kids.push(h("p", {}, `${this.rival.name} ${rv} in ${entry.rt}s (${{ 1: "+1", 0.5: "+1/2", 0: "+0" }[entry.rpts]})`));
        const res = { you: ["You take the round!", "good"], them: [`${this.rival.name} takes the round.`, "bad"], none: ["Nobody scores this round.", "muted"] }[entry.round || "none"];
        kids.push(h("p", { class: "round " + res[1] }, res[0]));
      }
      this.fb.replaceChildren(...kids);
      this.addNext();
    },
    addNext() {
      if (this.dom.nextBtn) return;
      const last = this.i >= this.total;
      const nb = h("button", { class: "btn good", type: "button", onclick: () => { wipeClipboard(); this.next(); } }, last ? "See results ›" : "Next question ›");
      this.dom.nextBtn = nb;
      (this.dom.form.querySelector(".answer-row") || this.dom.form).append(nb);
      nb.focus();
    },

    async finish(early) {
      if (this.finished) return;
      this.active = false;
      stopDrafts();
      MusicBar.hide();
      Refs.end();
      Dict.enable(false);
      if (this.overlay) this.dropOverlay();
      Lock.stop();
      const client = S.client;
      const pending = () => this.results.some((r) => r && r.pts === null && !r.waiting);
      if (client && pending()) {
        show(topbar(APP, client.name), h("main", { class: "narrow" }, card(h("h2", {}, "Checking your last answers..."))));
        for (let t = 0; t < 80 && pending(); t++) await sleep(100);
      }
      if (client && !early) client.send("done", { score: this.you });
      this.finished = { early };
      if (client && client.unacked.size) {
        // still offline: keep everything on this computer and keep trying
        const saved = store.get("md-student"); if (saved) { saved.state = "sending"; store.set("md-student", saved); }
        this.unsent = true;
        const wait = setInterval(() => {
          client.resend();
          if (!client.unacked.size) { clearInterval(wait); store.del("md-student"); this.unsent = false; if (this.finished) this.renderResults(); }
        }, 2000);
      } else store.del("md-student");
      this.renderResults();
    },
    // drawn again whenever the teacher grades one of our written answers
    renderResults() {
      const early = this.finished.early, client = S.client;
      const rs = this.results.filter(Boolean);
      const right = rs.filter((r) => r.pts === 1).length, half = rs.filter((r) => r.pts === 0.5).length;
      const waiting = rs.filter((r) => r.pts === null).length;
      const wrong = rs.length - right - half - waiting;
      let head, cls;
      if (early) { head = "Quiz ended early."; cls = "muted"; }
      else if (this.rival) {
        if (this.you > this.them || (this.you === this.them && this.youRounds > this.themRounds)) { head = "You win the duel!"; cls = "good"; }
        else if (this.you === this.them && this.youRounds === this.themRounds) { head = "It's a draw."; cls = "warn"; }
        else { head = `${this.rival.name} wins this time.`; cls = "bad"; }
      } else { head = "Quiz finished!"; cls = "navy"; }
      const names = { left: "left the quiz", monitor: "extra monitor", reload: "reloaded the page", sleep: "computer went to sleep", lockscreen: "locked the screen", closed: "app was closed" };
      const items = this.problems.map((p, k) => {
        const r = this.results[k];
        if (!r) return h("li", { class: "res bad" }, h("div", { class: "res-head" }, h("span", { class: "tag" }, "not done"), h("span", {}, p.q.split("\n")[0])));
        const tag = r.pts === null ? [r.waiting ? (client ? "teacher will grade" : "not graded") : "not checked", "warn"] : { 1: ["right", "good"], 0.5: ["half", "warn"], 0: [r.skipped ? "skipped" : "wrong", "bad"] }[r.pts];
        return h("li", { class: "res " + tag[1] },
          h("div", { class: "res-head" }, h("span", { class: "tag" }, tag[0]), h("span", {}, p.q.split("\n")[0])),
          r.skipped ? null : p.kind === "long" ? answerView(p, r.raw, "your-answer") : h("pre", { class: "your-answer" }, "Your answer: " + M.shownAnswer(p, r.raw)),
          r.ans && r.pts !== 1 ? h("p", { class: "small" }, "Correct answer: " + r.ans) : null,
          r.sol && r.pts !== 1 ? h("pre", { class: "sol" }, r.sol) : null);
      });
      const leave = () => { if (client) { client.close(); S.client = null; } if (IN_APP) quitApp(); else home(); };
      const doneBtn = S.preview
        ? [h("button", { class: "btn", onclick: () => exitPreview() }, "Back to the teacher page")]
        : client
        ? h("button", { class: "btn", onclick: leave }, IN_APP ? "Done — close Quiz Duel" : "Done")
        : [h("button", { class: "btn", onclick: () => builder(true) }, "Practice again"), h("button", { class: "btn ghost", onclick: home }, "Home")];
      show(topbar(APP, client ? client.name : "Results"), h("main", { class: "wide" }, card(
        h("h2", { class: cls }, head),
        h("div", { class: "stats" },
          stat("Score", `${M.fmtPts(this.you)} / ${this.total}`), stat("Right", right), stat("Half", half), stat("Wrong or skipped", wrong),
          waiting ? stat(client ? "Waiting for your teacher" : "Not graded", waiting) : null,
          this.rival ? stat(this.rival.name, M.fmtPts(this.them)) : null),
        this.unsent ? h("div", { class: "notice" }, h("b", {}, "Not sent yet: you're offline. "), "Your answers are saved on this computer. Keep this page open \u2014 they'll be sent to your teacher as soon as the internet is back. (If you close it, open the website again on this computer and choose Rejoin.)") : null,
        client ? h("p", { class: "muted" }, waiting ? "Your answers were sent to your teacher. Your score goes up here when your teacher grades the written ones — keep this page open to see it."
          : "Your results were sent to your teacher.") : null,
        this.violations.length ? h("div", { class: "notice bad" }, `The quiz was frozen ${this.violations.length} time(s): `,
          this.violations.map(([w, when]) => `${names[w] || w} at ${when}`).join("; ")) : null,
        h("h3", {}, "Your answers"), h("ol", { class: "results" }, items),
        rs.some((r) => r.ans) ? null : h("p", { class: "muted" }, "Your teacher will go over the answers."),
        h("div", { class: "row" }, doneBtn))));
    },
  };
  // keeps an unfinished answer on this computer (k = question index)
  let draftTimers = [];
  const stopDrafts = () => { draftTimers.forEach(clearInterval); draftTimers = []; };
  // the teacher's live view: what the student is typing right now (sent only when it changes, never queued)
  function sendTyping(k, v) {
    const c = S.client; if (!c || c.closed || S.preview) return;
    c.raw({ sid: c.sid, name: c.name, type: "typing", t: Date.now(), eid: uid(), i: c.current, qn: k + 1, text: String(v || "").slice(0, 20000) });
  }
  function keepDraft(k, getText, put) {
    const d = Q.drafts && Q.drafts[k];
    if (d && put) { try { put(d); } catch (e) { /* ignore */ } }
    let last = d || "";
    draftTimers.push(setInterval(() => {
      if (!Q.active || Q.results[k]) return;
      const v = getText(); if (v !== last) { last = v; Q.drafts[k] = v; Q.save(); sendTyping(k, v); }
    }, 2000));
  }
  function stat(label, value) { return h("div", { class: "stat" }, h("span", { class: "stat-v" }, String(value)), h("span", { class: "stat-l" }, label)); }

  // ---- student preview: the teacher goes through the quiz exactly as students see it; nothing is sent or recorded.
  // (High security and anti-game need the app, so the preview runs without the lock.)
  function preview(title, settings, problems, back) {
    const st = Object.assign({ refs: [], rival: 0, countdown: 0, music: [], show_solutions: true }, settings || {});
    S.client = null;
    S.preview = { back, security: secLevel(st), games: !!st.closeGames };
    S.quiz = { title, settings: Object.assign({}, st, { security: "low", closeApps: 0, closeGames: false }), problems: problems.map((p) => M.decProb(M.encProb(p))) };
    beginQuiz();
  }
  async function exitPreview() {
    const back = S.preview && S.preview.back;
    if (Q.active) await Q.finish(true);
    S.preview = null;
    (back || home)();
  }
  function beginQuiz() {
    Q.reset();
    Q.setup();
    Q.active = true;
    Q.hookClient();
    Lock.start(Q.st);
    MusicBar.show(Q.st.music || []);
    Refs.setup(Q.st);
    Q.next();
  }

  // graph for the two picture problems
  function graphSvg(g) {
    const NS = "http://www.w3.org/2000/svg", size = 300, pad = 18, lo = -6, hi = 6, unit = (size - 2 * pad) / (hi - lo);
    const X = (x) => pad + (x - lo) * unit, Y = (y) => pad + (hi - y) * unit;
    const s = (tag, a) => { const el = document.createElementNS(NS, tag); for (const k in a) el.setAttribute(k, a[k]); return el; };
    const svg = s("svg", { viewBox: `0 0 ${size} ${size}`, class: "graph", role: "img", "aria-label": g.label });
    for (let k = lo; k <= hi; k++) {
      svg.append(s("line", { x1: X(k), y1: Y(lo), x2: X(k), y2: Y(hi), class: "gl" }), s("line", { x1: X(lo), y1: Y(k), x2: X(hi), y2: Y(k), class: "gl" }));
    }
    svg.append(s("line", { x1: X(lo), y1: Y(0), x2: X(hi), y2: Y(0), class: "ax" }), s("line", { x1: X(0), y1: Y(lo), x2: X(0), y2: Y(hi), class: "ax" }));
    for (let k = lo; k <= hi; k++) if (k) {
      const t1 = s("text", { x: X(k), y: Y(0) + 11, "text-anchor": "middle", class: "tick" }); t1.textContent = k;
      const t2 = s("text", { x: X(0) - 5, y: Y(k) + 3, "text-anchor": "end", class: "tick" }); t2.textContent = k;
      svg.append(t1, t2);
    }
    for (const line of g.lines) {
      const pts = line.filter(([, y]) => y >= lo && y <= hi).map(([x, y]) => `${X(x)},${Y(y)}`).join(" ");
      svg.append(s("polyline", { points: pts, class: "curve" }));
    }
    for (const [x, y] of g.dots) svg.append(s("circle", { cx: X(x), cy: Y(y), r: 5, class: "dot" }));
    const lab = s("text", { x: X(lo) + 6, y: Y(hi) + 14, class: "glabel" }); lab.textContent = g.label;
    svg.append(lab);
    return h("div", { class: "graph-wrap" }, svg);
  }

  // test hooks (used only by the automated browser test)
  window.__md = { writer, richClean, aiPrompt, aiParse, aiQuestions, focusRun, focusCode, focusParse, S, Q, Lock, home, Runners, setDisplays: (n) => { appDisplays = n; } };
  const savedFocus = store.get("qd-focus-run");
  if (savedFocus && savedFocus.cfg && savedFocus.cfg.locked && savedFocus.st && Date.now() < savedFocus.st.ends + 10 * 60000) focusRun(savedFocus.cfg, savedFocus.st);
  else if (QS.get("focus")) { store.del("qd-focus-run"); focusSetup(QS.get("focus")); }
  else if (/^\d{1,3}-\d{1,2}-\d{1,2}-\d{1,2}-\d{2,3}-G$/.test(QS.get("mine") || "")) {
    const v = QS.get("mine").split("-").map(Number);
    focusSetup("", { focus: v[0], brk: v[1], rounds: v[2], pauses: v[3], pauseSecs: v[4], games: true });
  }
  else if (URL_CODE) {
    const saved = store.get("md-student");
    if (saved && saved.code === URL_CODE && saved.state === "quiz") rejoinStudent(saved);
    else studentJoin({ code: URL_CODE, name: (QS.get("name") || "").slice(0, 30), email: (QS.get("email") || "").slice(0, 80) });
  }
  else if (IN_APP && !store.get("md-student")) studentJoin();
  else home();
})();
