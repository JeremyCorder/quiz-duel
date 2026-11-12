"use strict";
/* Quiz Duel focus sounds. Everything is made by the browser (no audio files, no lyrics, nothing to download):
   simple piano versions of Mozart pieces, noise and nature sounds, and instrumental beats. */
(function () {
  const GROUPS = [["mozart", "Mozart (piano)"], ["noise", "Noise and nature"], ["upbeat", "Upbeat (no lyrics)"], ["calm", "Calm"],
    ["jazzhop", "Coffee shop jazz-hop"], ["school", "Back to school (chill beats)"]];
  const SOUNDS = [
    { id: "moz-mix", group: "mozart", name: "Mozart: piano mix" },
    { id: "moz-545", group: "mozart", name: "Mozart: Sonata in C (opening)" },
    { id: "moz-265", group: "mozart", name: "Mozart: Ah, vous dirai-je, Maman" },
    { id: "moz-turk", group: "mozart", name: "Mozart: Rondo alla Turca (opening)" },
    { id: "moz-nacht", group: "mozart", name: "Mozart: Eine kleine Nachtmusik (opening)" },
    { id: "white", group: "noise", name: "White noise" },
    { id: "brown", group: "noise", name: "Brown noise (deeper)" },
    { id: "rain", group: "noise", name: "Rain" },
    { id: "ocean", group: "noise", name: "Ocean waves" },
    { id: "arcade", group: "upbeat", name: "Upbeat: Arcade" },
    { id: "sunny", group: "upbeat", name: "Upbeat: Sunny piano" },
    { id: "drive", group: "upbeat", name: "Upbeat: Night drive" },
    { id: "lofi", group: "calm", name: "Calm: Lo-fi beat" },
    { id: "pads", group: "calm", name: "Calm: Soft pads" },
    { id: "bells", group: "calm", name: "Calm: Bells" },
    { id: "jh-latte", group: "jazzhop", name: "Jazz-hop: Late latte" },
    { id: "jh-window", group: "jazzhop", name: "Jazz-hop: Rainy window seat" },
    { id: "jh-vinyl", group: "jazzhop", name: "Jazz-hop: Warm vinyl" },
    { id: "jh-sketch", group: "jazzhop", name: "Jazz-hop: Sketchbook" },
    { id: "jh-moon", group: "jazzhop", name: "Jazz-hop: Moon cafe" },
    { id: "bs-locker", group: "school", name: "Back to school: Locker room" },
    { id: "bs-bus", group: "school", name: "Back to school: Morning bus" },
    { id: "bs-recess", group: "school", name: "Back to school: Recess" },
    { id: "bs-library", group: "school", name: "Back to school: Library hour" },
    { id: "bs-lastbell", group: "school", name: "Back to school: Last bell" },
  ];

  // ---------------------------------------------------------------- notes
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(name) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    return 12 * (parseInt(m[3], 10) + 1) + SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // "C5/1 r/.5 C4+E4/.5" -> [{t, d, notes}], times in beats
  function voice(text) {
    let t = 0; const out = [];
    for (const tok of text.replace(/\|/g, " ").split(/\s+/).filter(Boolean)) {
      const [names, len] = tok.split("/"); const d = parseFloat(len);
      if (names !== "r") out.push({ t, d, notes: names.split("+").map(midi) });
      t += d;
    }
    out.beats = t;
    return out;
  }
  // a piece = { bpm, voices: [right hand, left hand] } -> events in seconds
  function piece(bpm, right, left, repeat) {
    const spb = 60 / bpm, ev = []; let at = 0;
    const r = voice(right), l = voice(left); const beats = Math.max(r.beats, l.beats);
    for (let k = 0; k < (repeat || 1); k++) {
      for (const n of r) for (const m of n.notes) ev.push({ t: at + n.t * spb, d: n.d * spb, inst: "piano", m, g: 0.5 });
      for (const n of l) for (const m of n.notes) ev.push({ t: at + n.t * spb, d: n.d * spb, inst: "piano", m, g: 0.28 });
      at += beats * spb;
    }
    return { ev, len: at };
  }
  function join(...parts) {
    const ev = []; let at = 0;
    for (const p of parts) { for (const e of p.ev) ev.push(Object.assign({}, e, { t: e.t + at })); at += p.len + 0.6; }
    return { ev, len: at };
  }
  const K545 = () => piece(132,
    "C5/2 E5/1 G5/1 | B4/1.5 C5/.25 D5/.25 C5/1 r/1 | A5/2 G5/1 C6/1 | G5/1 F5/.5 E5/.25 F5/.25 E5/1 r/1",
    "C4/.5 G4/.5 E4/.5 G4/.5 C4/.5 G4/.5 E4/.5 G4/.5 | D4/.5 G4/.5 F4/.5 G4/.5 C4/.5 G4/.5 E4/.5 G4/.5 | C4/.5 A4/.5 F4/.5 A4/.5 C4/.5 G4/.5 E4/.5 G4/.5 | B3/.5 G4/.5 D4/.5 G4/.5 C4/.5 G4/.5 E4/.5 G4/.5", 2);
  const K265 = () => piece(108,
    "C5/1 C5/1 G5/1 G5/1 A5/1 A5/1 G5/2 | F5/1 F5/1 E5/1 E5/1 D5/1 D5/1 C5/2 | G5/1 G5/1 F5/1 F5/1 E5/1 E5/1 D5/2 | G5/1 G5/1 F5/1 F5/1 E5/1 E5/1 D5/2 | C5/1 C5/1 G5/1 G5/1 A5/1 A5/1 G5/2 | F5/1 F5/1 E5/1 E5/1 D5/1 D5/1 C5/2",
    "C4/2 E4/2 F4/2 E4/2 | D4/2 C4/2 G3/2 C4/2 | E4/2 D4/2 C4/2 G3/2 | E4/2 D4/2 C4/2 G3/2 | C4/2 E4/2 F4/2 E4/2 | D4/2 C4/2 G3/2 C3/2", 1);
  const TURK = () => piece(126,
    "B4/.25 A4/.25 G#4/.25 A4/.25 | C5/.5 r/.5 D5/.25 C5/.25 B4/.25 C5/.25 | E5/.5 r/.5 F5/.25 E5/.25 D#5/.25 E5/.25 | B5/.25 A5/.25 G#5/.25 A5/.25 B5/.25 A5/.25 G#5/.25 A5/.25 | C6/1 A5/.5 C6/.5 | B5/.5 A5/.5 G5/.5 A5/.5 | B5/.5 A5/.5 G5/.5 A5/.5 | B5/.5 A5/.5 G5/.5 F#5/.5 | E5/1",
    "r/1 | A3/.5 C4+E4/.5 C4+E4/.5 C4+E4/.5 | A3/.5 C4+E4/.5 C4+E4/.5 C4+E4/.5 | A3/.5 C4+E4/.5 C4+E4/.5 C4+E4/.5 | A3/.5 C4+E4/.5 C4+E4/.5 C4+E4/.5 | E3/.5 B3+E4/.5 B3+E4/.5 B3+E4/.5 | E3/.5 B3+E4/.5 B3+E4/.5 B3+E4/.5 | E3/.5 B3+E4/.5 B2/.5 B3/.5 | E3/1", 2);
  const NACHT = () => piece(132,
    "G5/1 r/.5 D5/.5 G5/1 r/.5 D5/.5 | G5/.5 D5/.5 G5/.5 B5/.5 D6/1 r/1 | C6/1 r/.5 A5/.5 C6/1 r/.5 A5/.5 | C6/.5 A5/.5 F#5/.5 A5/.5 D5/1 r/1",
    "G3/1 r/.5 D3/.5 G3/1 r/.5 D3/.5 | G3/.5 D3/.5 G3/.5 B3/.5 D4/1 r/1 | C4/1 r/.5 A3/.5 C4/1 r/.5 A3/.5 | C4/.5 A3/.5 F#3/.5 A3/.5 D3/1 r/1", 2);

  // ---------------------------------------------------------------- instrumental beats (written by rule, same every time)
  function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const CH = { C: [48, 52, 55], G: [43, 47, 50], Am: [45, 48, 52], F: [41, 45, 48], Dm: [50, 53, 57], Em: [52, 55, 59], D: [50, 54, 57], Bm: [47, 50, 54],
    // seventh chords for the jazz-hop tracks (root first: the bass plays the first note)
    Cmaj7: [48, 52, 55, 59], Am7: [45, 48, 52, 55], Dm7: [50, 53, 57, 60], G7: [43, 47, 50, 53], Fmaj7: [41, 45, 48, 52], Em7: [40, 43, 47, 50],
    Ebmaj7: [39, 43, 46, 50], Bbmaj7: [46, 50, 53, 57], Gm7: [43, 46, 50, 53], C7: [48, 52, 55, 58], Bm7b5: [47, 50, 53, 57], E7: [40, 44, 47, 50],
    Abmaj7: [44, 48, 51, 55], Db7: [49, 53, 56, 59] };
  function beat(o) {
    const spb = 60 / o.bpm, ev = [], rand = rng(o.seed), bars = o.chords.length * o.rounds;
    const scale = o.scale;
    let last = 2;
    for (let b = 0; b < bars; b++) {
      const ch = CH[o.chords[b % o.chords.length]], t0 = b * 4 * spb, fill = b % 4 === 3;
      for (let s = 0; s < 16; s++) {
        const t = t0 + s * spb / 4;
        if (o.kick && (s % 8 === 0 || (o.four && s % 4 === 0) || (s === 10 && rand() < 0.5))) ev.push({ t, inst: "kick", g: o.drum });
        if (o.snare && s % 8 === 4) ev.push({ t, inst: "snare", g: o.drum * 0.8 });
        if (o.hat && s % 2 === (o.swing ? 0 : 0)) ev.push({ t: t + (o.swing && s % 4 === 2 ? spb * 0.08 : 0), inst: "hat", g: o.drum * (s % 4 === 2 ? 0.5 : 0.3) });
        if (o.bass && s % 2 === 0 && (s % 4 === 0 || rand() < o.busy)) ev.push({ t, d: spb * 0.45, inst: "bass", m: ch[0] - 12 + (s === 14 && fill ? 7 : 0), g: 0.5 });
        if (o.arp && (s % (o.arpEvery || 1) === 0)) ev.push({ t, d: spb * 0.22, inst: o.arp, m: ch[[0, 1, 2, 1, 2, 1, 0, 2][s % 8]] + 12 + (s % 8 > 5 ? 12 : 0), g: o.arpGain });
        if (o.lead && s % 2 === 0 && rand() < o.melody) {
          last = Math.max(0, Math.min(scale.length - 1, last + Math.floor(rand() * 5) - 2));
          ev.push({ t, d: spb * (rand() < 0.3 ? 1 : 0.5), inst: o.lead, m: scale[last], g: o.leadGain });
        }
      }
      if (o.pad) for (const m of ch) ev.push({ t: t0, d: 4 * spb, inst: o.pad, m: m + 12, g: o.padGain });
    }
    return { ev, len: bars * 4 * spb };
  }
  const DOR_D = [74, 76, 77, 79, 81, 83, 84, 86], MAJ_F = [72, 74, 76, 77, 79, 81, 84], BLUE_C = [72, 75, 77, 78, 79, 82, 84];
  const PENT_C = [72, 74, 76, 79, 81, 84, 86, 88], PENT_D = [74, 76, 78, 81, 83, 86, 88, 90], PENT_AM = [69, 72, 74, 76, 79, 81, 84];
  const SONGS = {
    "moz-545": K545, "moz-265": K265, "moz-turk": TURK, "moz-nacht": NACHT,
    "moz-mix": () => join(K545(), K265(), TURK(), NACHT()),
    arcade: () => beat({ bpm: 126, seed: 7, chords: ["C", "G", "Am", "F"], rounds: 4, scale: PENT_C, kick: 1, four: 1, snare: 1, hat: 1, drum: 0.5, bass: 1, busy: 0.8, arp: "lead", arpGain: 0.1, lead: "lead", melody: 0.45, leadGain: 0.16 }),
    sunny: () => beat({ bpm: 112, seed: 21, chords: ["D", "Bm", "G", "D", "G", "D", "Em", "D"], rounds: 2, scale: PENT_D, kick: 1, snare: 1, hat: 1, drum: 0.32, bass: 1, busy: 0.4, arp: "piano", arpEvery: 2, arpGain: 0.2, lead: "piano", melody: 0.5, leadGain: 0.42 }),
    drive: () => beat({ bpm: 104, seed: 3, chords: ["Am", "F", "C", "G"], rounds: 4, scale: PENT_AM, kick: 1, four: 1, snare: 1, hat: 1, drum: 0.42, bass: 1, busy: 1, arp: "lead", arpEvery: 2, arpGain: 0.08, pad: "pad", padGain: 0.07, lead: "bell", melody: 0.25, leadGain: 0.2 }),
    lofi: () => beat({ bpm: 76, seed: 11, chords: ["Dm", "G", "C", "Am"], rounds: 4, scale: PENT_C, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.3, bass: 1, busy: 0.2, pad: "epiano", padGain: 0.16, lead: "epiano", melody: 0.18, leadGain: 0.22 }),
    pads: () => beat({ bpm: 40, seed: 5, chords: ["C", "Am", "F", "G"], rounds: 2, scale: PENT_C, pad: "pad", padGain: 0.11, lead: "bell", melody: 0.07, leadGain: 0.16 }),
    bells: () => beat({ bpm: 54, seed: 9, chords: ["C", "Em", "F", "C"], rounds: 3, scale: PENT_C, pad: "pad", padGain: 0.04, lead: "bell", melody: 0.4, leadGain: 0.3 }),
    // coffee shop jazz-hop: slow swung drums, seventh chords on electric piano, soft melody
    "jh-latte": () => beat({ bpm: 82, seed: 31, chords: ["Dm7", "G7", "Cmaj7", "Am7"], rounds: 12, scale: DOR_D, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.28, bass: 1, busy: 0.3, pad: "epiano", padGain: 0.13, lead: "epiano", melody: 0.22, leadGain: 0.24 }),
    "jh-window": () => beat({ bpm: 74, seed: 44, chords: ["Fmaj7", "Em7", "Dm7", "Cmaj7"], rounds: 12, scale: MAJ_F, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.24, bass: 1, busy: 0.2, pad: "epiano", padGain: 0.14, lead: "bell", melody: 0.14, leadGain: 0.18 }),
    "jh-vinyl": () => beat({ bpm: 88, seed: 52, chords: ["Am7", "Dm7", "G7", "Cmaj7", "Fmaj7", "Bm7b5", "E7", "Am7"], rounds: 6, scale: PENT_AM, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.3, bass: 1, busy: 0.45, pad: "epiano", padGain: 0.12, lead: "piano", melody: 0.2, leadGain: 0.3 }),
    "jh-sketch": () => beat({ bpm: 70, seed: 67, chords: ["Ebmaj7", "Dm7", "Gm7", "C7"], rounds: 12, scale: BLUE_C, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.25, bass: 1, busy: 0.25, pad: "epiano", padGain: 0.14, lead: "epiano", melody: 0.18, leadGain: 0.22 }),
    "jh-moon": () => beat({ bpm: 78, seed: 73, chords: ["Cmaj7", "Abmaj7", "Fmaj7", "Db7"], rounds: 10, scale: PENT_C, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.26, bass: 1, busy: 0.3, pad: "pad", padGain: 0.06, lead: "epiano", melody: 0.2, leadGain: 0.24 }),
    // back to school: brighter chill beats, a bit faster, friendly melodies
    "bs-locker": () => beat({ bpm: 94, seed: 81, chords: ["C", "G", "Am", "F"], rounds: 12, scale: PENT_C, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.32, bass: 1, busy: 0.4, pad: "epiano", padGain: 0.12, lead: "piano", melody: 0.3, leadGain: 0.32 }),
    "bs-bus": () => beat({ bpm: 100, seed: 88, chords: ["D", "Bm", "G", "D"], rounds: 12, scale: PENT_D, kick: 1, snare: 1, hat: 1, drum: 0.3, bass: 1, busy: 0.5, arp: "bell", arpEvery: 4, arpGain: 0.08, lead: "piano", melody: 0.3, leadGain: 0.3 }),
    "bs-recess": () => beat({ bpm: 108, seed: 95, chords: ["F", "C", "Dm", "G"], rounds: 12, scale: PENT_C, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.34, bass: 1, busy: 0.6, pad: "epiano", padGain: 0.1, lead: "bell", melody: 0.3, leadGain: 0.2 }),
    "bs-library": () => beat({ bpm: 72, seed: 101, chords: ["Am", "F", "C", "G"], rounds: 10, scale: PENT_AM, kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.2, bass: 1, busy: 0.2, pad: "pad", padGain: 0.07, lead: "epiano", melody: 0.18, leadGain: 0.24 }),
    "bs-lastbell": () => beat({ bpm: 96, seed: 117, chords: ["G", "D", "Em", "C"], rounds: 12, scale: [67, 69, 71, 74, 76, 79, 81, 83], kick: 1, snare: 1, hat: 1, swing: 1, drum: 0.3, bass: 1, busy: 0.45, pad: "epiano", padGain: 0.12, lead: "piano", melody: 0.28, leadGain: 0.3 }),
  };

  // ---------------------------------------------------------------- sound engine
  let ctx = null, master = null, noiseBuf = null, playing = null, timer = null, live = [], volume = 0.5;
  let song = null, ptr = 0, loopAt = 0;
  let list = null, listAt = 0, listTimer = null;   // playlist: every allowed track once, in order, then again
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume * volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function tone(type, f, t, peak, attack, decay, cutoff, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    env(g, t, peak, attack, decay);
    if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff; o.connect(lp); lp.connect(g); } else o.connect(g);
    g.connect(master); o.start(t); o.stop(t + attack + decay + 0.05);
  }
  function burst(t, peak, decay, type, freq) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq;
    env(g, t, peak, 0.002, decay);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 2); s.stop(t + decay + 0.05);
  }
  const INST = {
    piano(e, t) { const f = hz(e.m), len = Math.max(0.5, e.d * 1.6); tone("triangle", f, t, e.g * 0.5, 0.006, len); tone("sine", f * 2, t, e.g * 0.12, 0.006, len * 0.6); },
    epiano(e, t) { const f = hz(e.m); tone("sine", f, t, e.g * 0.5, 0.02, Math.max(1.2, e.d)); tone("sine", f * 3, t, e.g * 0.04, 0.01, 0.4); },
    lead(e, t) { tone("square", hz(e.m), t, e.g * 0.6, 0.008, Math.max(0.14, e.d), 2200); },
    bass(e, t) { tone("triangle", hz(e.m), t, e.g * 0.7, 0.008, Math.max(0.2, e.d)); tone("sine", hz(e.m), t, e.g * 0.5, 0.008, Math.max(0.2, e.d)); },
    pad(e, t) { const f = hz(e.m); tone("sawtooth", f, t, e.g, e.d * 0.35, e.d * 0.9, 900, -7); tone("sawtooth", f, t, e.g, e.d * 0.35, e.d * 0.9, 900, 7); },
    bell(e, t) { const f = hz(e.m); tone("sine", f, t, e.g * 0.5, 0.004, 2.2); tone("sine", f * 2.76, t, e.g * 0.08, 0.004, 0.9); },
    kick(e, t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); env(g, t, e.g, 0.003, 0.22); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3); },
    snare(e, t) { burst(t, e.g * 0.6, 0.14, "bandpass", 1800); },
    hat(e, t) { burst(t, e.g * 0.5, 0.04, "highpass", 7000); },
  };
  function tick() {
    if (!song) return;
    const horizon = ctx.currentTime + 0.35;
    for (let guard = 0; guard < 400; guard++) {
      if (ptr >= song.ev.length) {
        if (list) { const nextAt = loopAt + song.len + 1.2; setTimeout(() => { if (list) nextInList(nextAt); }, Math.max(0, (nextAt - ctx.currentTime - 0.3) * 1000)); song = null; return; }
        ptr = 0; loopAt += song.len;
      }
      const e = song.ev[ptr], t = loopAt + e.t;
      if (t > horizon) break;
      if (t > ctx.currentTime - 0.05) INST[e.inst](e, Math.max(t, ctx.currentTime));
      ptr++;
    }
  }
  function noise(kind) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const g = ctx.createGain(); let lastNode = src;
    const filt = (type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; lastNode.connect(f); lastNode = f; };
    if (kind === "white") { filt("lowpass", 9000); g.gain.value = 0.16; }
    if (kind === "brown") { filt("lowpass", 420); filt("lowpass", 900); g.gain.value = 0.9; }
    if (kind === "rain") { filt("highpass", 900); filt("lowpass", 7000); g.gain.value = 0.2; }
    if (kind === "ocean") { filt("lowpass", 700); g.gain.value = 0.45; }
    lastNode.connect(g); g.connect(master); src.start();
    live.push(src);
    if (kind === "ocean" || kind === "rain") {            // slow swell
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = kind === "ocean" ? 0.11 : 0.23; depth.gain.value = kind === "ocean" ? 0.38 : 0.05;
      lfo.connect(depth); depth.connect(g.gain); lfo.start(); live.push(lfo);
    }
    if (kind === "rain") {                                   // low rumble under the rain
      const s2 = ctx.createBufferSource(), f2 = ctx.createBiquadFilter(), g2 = ctx.createGain();
      s2.buffer = noiseBuf; s2.loop = true; f2.type = "lowpass"; f2.frequency.value = 300; g2.gain.value = 0.35;
      s2.connect(f2); f2.connect(g2); g2.connect(master); s2.start(0, 1.3); live.push(s2);
    }
  }
  function stop(keepList) {
    clearInterval(timer); timer = null; song = null; playing = null;
    clearTimeout(listTimer); listTimer = null;
    if (!keepList) list = null;
    for (const n of live) { try { n.stop(); } catch (e) { /* already stopped */ } }
    live = [];
    if (ctx && master) {                                     // cut any notes already queued
      const old = master; old.gain.cancelScheduledValues(ctx.currentTime); old.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      master = ctx.createGain(); master.gain.value = volume * volume;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      setTimeout(() => { try { old.disconnect(); } catch (e) { /* ignore */ } }, 400);
    }
  }
  function start(id, at) {
    if (SONGS[id]) { song = SONGS[id](); song.ev.sort((a, b) => a.t - b.t); ptr = 0; loopAt = Math.max(at || 0, ctx.currentTime + 0.12); timer = setInterval(tick, 60); tick(); }
    else {
      noise(id);
      if (list) listTimer = setTimeout(() => { if (list) nextInList(0); }, 150000);      // noise tracks play 2.5 minutes in a playlist
    }
    playing = id;
  }
  function play(id) {
    if (!ensure()) return false;
    stop();
    if (ctx.state === "suspended") ctx.resume();
    start(id);
    return true;
  }
  // play a list of tracks one after another, then start again from the top (forever, until stopped)
  function playList(ids) {
    ids = (ids || []).filter((id) => SOUNDS.some((x) => x.id === id));
    if (!ids.length || !ensure()) return false;
    stop();
    if (ctx.state === "suspended") ctx.resume();
    list = ids; listAt = 0;
    start(list[0]);
    return true;
  }
  function nextInList(at) {
    if (!list) return;
    const keep = list;
    stop(true); list = keep;
    listAt = (listAt + 1) % list.length;
    start(list[listAt], at);
  }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.setTargetAtTime(volume * volume, ctx.currentTime, 0.05); }

  // short bell for the focus timer (its own volume, so it is heard even with the music turned down)
  function chime(n) {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    const out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
    const notes = [[88], [84, 79], [79, 84, 88]][Math.max(0, Math.min(2, (n || 1) - 1))];
    notes.forEach((mNote, i) => {
      const t = ctx.currentTime + 0.05 + i * 0.22, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = hz(mNote); env(g, t, 0.35, 0.005, 1.1); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.3);
    });
  }

  MathDuel.Music = { GROUPS, SOUNDS, SONGS, play, playList, stop: () => stop(), setVolume, chime, playing: () => playing,
    inList: () => !!list, current: () => (list ? list[listAt] : playing), volume: () => volume };
})();
