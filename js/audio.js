/* ==========================================================================
 * Tower Quest : Curiosity — audio.js
 * Son 100 % généré par code (WebAudio) : aucune ressource externe.
 *   - Musique d'ambiance en boucle, adaptée au lieu (menu / jeu / hall /
 *     labyrinthe géant / victoire).
 *   - Bruitages (saut, échelle, piège, téléporteur, lanterne, porte, victoire…).
 *   - Coupure du son mémorisée (localStorage), déblocage au 1er geste.
 * ======================================================================== */
(function (global) {
  "use strict";

  let ctx = null;
  let master, musicGain, sfxGain, musicFilter;
  let muted = false;
  let noiseBuf = null;
  let sched = null;        // timer du séquenceur musical
  let track = null;        // piste courante
  let barTime = 0, chordIx = 0;
  let lastClimb = 0;

  function _build() {
    if (ctx) return;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = "lowpass"; musicFilter.frequency.value = 1400;
    musicGain = ctx.createGain(); musicGain.gain.value = 0.0;
    musicFilter.connect(musicGain); musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.32; sfxGain.connect(master);
    // Bruit blanc réutilisable.
    const len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    muted = localStorage.getItem("tq_muted") === "1";
    _applyMute();
  }

  function _applyMute() {
    if (!master) return;
    master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
  }

  function resume() { _build(); if (ctx && ctx.state === "suspended") ctx.resume(); }

  /* ----------------------------- Bruitages ----------------------------- */
  function _tone(o) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || "square";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.dur || 0.12));
    const vol = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.12) + (o.release || 0.05));
    osc.connect(g); g.connect(o.bus || sfxGain);
    osc.start(t); osc.stop(t + (o.dur || 0.12) + (o.release || 0.05) + 0.02);
  }

  function _noise(o) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.type || "bandpass";
    f.frequency.setValueAtTime(o.freq || 800, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t + (o.dur || 0.2));
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.25 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.2));
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t); src.stop(t + (o.dur || 0.2) + 0.02);
  }

  const SFX = {
    jump() { _tone({ type: "square", freq: 380, to: 720, dur: 0.13, vol: 0.22 }); },
    land() { _tone({ type: "triangle", freq: 220, to: 110, dur: 0.08, vol: 0.16 }); },
    climb() {
      const now = ctx ? ctx.currentTime : 0;
      if (now - lastClimb < 0.12) return; lastClimb = now;
      _tone({ type: "square", freq: 520, dur: 0.03, vol: 0.06 });
    },
    death() {
      _tone({ type: "sawtooth", freq: 300, to: 70, dur: 0.35, vol: 0.28 });
      _noise({ type: "lowpass", freq: 900, to: 200, dur: 0.3, vol: 0.2 });
    },
    teleport() {
      _tone({ type: "sine", freq: 700, to: 1300, dur: 0.14, vol: 0.2 });
      _tone({ type: "sine", freq: 1000, to: 500, dur: 0.22, vol: 0.16, attack: 0.08 });
    },
    lantern() {
      [880, 1174, 1568, 2093].forEach((f, i) =>
        setTimeout(() => _tone({ type: "triangle", freq: f, dur: 0.16, vol: 0.16 }), i * 55));
    },
    door() { _noise({ type: "bandpass", freq: 500, to: 1600, dur: 0.28, vol: 0.24, q: 0.7 }); },
    floorUp() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => _tone({ type: "triangle", freq: f, dur: 0.18, vol: 0.2 }), i * 70));
    },
    deadend() { _tone({ type: "sawtooth", freq: 200, to: 130, dur: 0.22, vol: 0.18 }); },
    click() { _tone({ type: "square", freq: 660, dur: 0.05, vol: 0.18 }); },
    victory() {
      const seq = [523, 659, 784, 1047, 1319, 1047, 1319, 1568];
      seq.forEach((f, i) => setTimeout(() => _tone({ type: "triangle", freq: f, dur: 0.22, vol: 0.24 }), i * 130));
    }
  };

  function sfx(name) { _build(); if (SFX[name]) SFX[name](); }

  /* ------------------------------ Musique ------------------------------ */
  // Accords en puissance (fondamentale+quinte+octave, toujours consonants).
  function chord(root) { return [root, root * 1.5, root * 2]; }
  const A = 220, F = 174.61, C = 130.81, G = 196.0, D = 146.83, E = 164.81;
  const TRACKS = {
    menu:    { bar: 3.0, bright: 1100, bellVol: 0.10, bells: [440, 523, 659, 587], prog: [A, F, C, G] },
    game:    { bar: 2.4, bright: 1400, bellVol: 0.12, bells: [440, 523, 587, 659, 784], prog: [A, F, C, G] },
    hub:     { bar: 3.2, bright: 1300, bellVol: 0.11, bells: [523, 659, 784, 587], prog: [A, C, F, G] },
    final:   { bar: 1.7, bright: 1700, bellVol: 0.15, bells: [440, 523, 587, 659, 784, 880], prog: [A, F, D, E], drone: true },
    victory: { bar: 2.2, bright: 1800, bellVol: 0.16, bells: [523, 659, 784, 1047, 880], prog: [C, F, G, C], major: true }
  };

  function _padVoice(f, t, dur, vol) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = "sine"; o2.type = "sine";
    o1.frequency.value = f; o2.frequency.value = f * 1.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o1.connect(g); o2.connect(g); g.connect(musicFilter);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }

  function _bell(f, t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(musicFilter);
    o.start(t); o.stop(t + 0.55);
  }

  function _scheduler() {
    if (!ctx || !track) return;
    const tk = TRACKS[track];
    while (barTime < ctx.currentTime + 0.25) {
      const root = tk.prog[chordIx % tk.prog.length];
      const voices = chord(root);
      for (const v of voices) _padVoice(v, barTime, tk.bar * 1.05, 0.05);
      if (tk.drone) _padVoice(root / 2, barTime, tk.bar * 1.05, 0.04);
      // Quelques cloches réparties dans la mesure.
      const nBells = tk.major ? 3 : 2;
      for (let i = 0; i < nBells; i++) {
        const bt = barTime + (0.2 + i * 0.6) * (tk.bar / 2);
        const f = tk.bells[(chordIx * 3 + i * 2) % tk.bells.length];
        _bell(f, bt, tk.bellVol);
      }
      chordIx++;
      barTime += tk.bar;
    }
  }

  function music(name) {
    _build();
    if (!ctx) return;
    if (name === track) return;
    track = name;
    if (sched) { clearInterval(sched); sched = null; }
    if (!name) { musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); return; }
    musicFilter.frequency.setTargetAtTime(TRACKS[name].bright, ctx.currentTime, 0.4);
    musicGain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
    barTime = ctx.currentTime + 0.1; chordIx = 0;
    _scheduler();
    sched = setInterval(_scheduler, 60);
  }

  function toggleMuted() {
    _build();
    muted = !muted;
    localStorage.setItem("tq_muted", muted ? "1" : "0");
    _applyMute();
    return muted;
  }
  function isMuted() { return muted; }

  global.TQ = global.TQ || {};
  global.TQ.Audio = { resume, sfx, music, toggleMuted, isMuted };
})(window);
