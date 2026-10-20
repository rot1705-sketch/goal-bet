// Original "European night" entrance theme, synthesized live with Web Audio.
// Composed for this site — not a recording or arrangement of any existing anthem.
(() => {
  "use strict";
  let ctx = null, master = null, stopTimer = null;
  const BEAT = 0.9; // seconds per beat (~66 bpm, ceremonial)
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  // Chords as MIDI notes (D major, ceremonial cadence): D – Bm – G – A – D – F#m – G – Asus4 – A – D
  const CHORDS = [
    [50, 62, 66, 69], [47, 62, 66, 71], [43, 62, 67, 71], [45, 61, 64, 69],
    [50, 62, 66, 69], [42, 61, 66, 69], [43, 59, 62, 67], [45, 62, 64, 69],
    [45, 61, 64, 69], [38, 62, 66, 69, 74]
  ];
  const CHORD_BEATS = [2, 2, 2, 2, 2, 2, 2, 1, 1, 5];
  // Original brass melody: [midi, beats]; null = rest
  const MELODY = [
    [74, 1], [78, 1], [81, 1.5], [79, 0.5], [78, 1], [76, 1], [74, 2],
    [79, 1], [78, 0.5], [76, 0.5], [74, 1], [73, 1], [76, 2],
    [81, 1], [83, 1], [86, 2], [85, 1], [81, 1], [86, 5]
  ];

  function voice(freq, start, dur, { type = "sawtooth", gain = 0.05, attack = 0.35, release = 0.8, cutoff = 1600, detune = 0, vibrato = 0 } = {}) {
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = cutoff; filter.Q.value = 0.7;
    const amp = ctx.createGain(); amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + attack);
    amp.gain.setValueAtTime(gain, start + Math.max(attack, dur - 0.05));
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur + release);
    if (vibrato) { const lfo = ctx.createOscillator(); const depth = ctx.createGain(); lfo.frequency.value = 5.2; depth.gain.value = vibrato; lfo.connect(depth).connect(osc.frequency); lfo.start(start); lfo.stop(start + dur + release); }
    osc.connect(filter).connect(amp).connect(master);
    osc.start(start); osc.stop(start + dur + release + 0.05);
  }

  function noiseBuffer() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return buf;
  }

  function timpani(start, note = 38, gain = 0.5) {
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(hz(note) * 1.6, start); osc.frequency.exponentialRampToValueAtTime(hz(note), start + 0.12);
    const amp = ctx.createGain(); amp.gain.setValueAtTime(gain, start); amp.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
    osc.connect(amp).connect(master); osc.start(start); osc.stop(start + 1.5);
  }

  function cymbalSwell(start, dur) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000;
    const amp = ctx.createGain(); amp.gain.setValueAtTime(0.0001, start); amp.gain.exponentialRampToValueAtTime(0.09, start + dur); amp.gain.exponentialRampToValueAtTime(0.0001, start + dur + 2.5);
    src.connect(hp).connect(amp).connect(master); src.start(start); src.stop(start + dur + 2.6);
  }

  function play() {
    stop(true);
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return 0;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp).connect(ctx.destination);
    const t0 = ctx.currentTime + 0.1;
    let t = t0;
    CHORDS.forEach((chord, i) => {
      const dur = CHORD_BEATS[i] * BEAT;
      chord.forEach((n, j) => {
        const choir = { type: "sawtooth", gain: j === 0 ? 0.05 : 0.028, attack: 0.5, release: 1.1, cutoff: j === 0 ? 700 : 1500, vibrato: j ? 2.2 : 0 };
        voice(hz(n), t, dur, { ...choir, detune: -7 }); voice(hz(n), t, dur, { ...choir, detune: 7 });
        if (j) voice(hz(n + 12), t, dur, { type: "sine", gain: 0.012, attack: 0.6, release: 1.2 });
      });
      timpani(t, i % 2 ? 45 : 38, i === CHORDS.length - 1 ? 0.7 : 0.42);
      if (i === CHORDS.length - 1) { timpani(t - BEAT / 2, 38, 0.3); timpani(t - BEAT / 4, 38, 0.35); }
      t += dur;
    });
    let m = t0 + BEAT * 2;
    MELODY.forEach(([n, beats]) => { if (n) voice(hz(n), m, beats * BEAT * 0.95, { type: "square", gain: 0.035, attack: 0.08, release: 0.5, cutoff: 2400, vibrato: 3 }); m += beats * BEAT; });
    cymbalSwell(t - 5 * BEAT - 2.4, 2.4);
    const total = t - t0 + 2.5;
    stopTimer = setTimeout(() => stop(), total * 1000);
    window.dispatchEvent(new CustomEvent("anthem", { detail: { playing: true } }));
    return total;
  }

  function stop(silent) {
    clearTimeout(stopTimer);
    if (ctx) { const c = ctx; ctx = null; try { master.gain.setTargetAtTime(0, c.currentTime, 0.15); } catch (_) {} setTimeout(() => c.close().catch(() => {}), 600); }
    if (!silent) window.dispatchEvent(new CustomEvent("anthem", { detail: { playing: false } }));
  }

  // Official anthem via YouTube's embedded player (UEFA's own upload; streamed from YouTube, not copied).
  const YT_ID = "Gb1iGDchKYs";
  let yt = null, ytReady = false, ytPlaying = false, ytFailed = false;
  const card = document.createElement("div");
  card.className = "anthem-card"; card.hidden = true;
  card.innerHTML = '<div class="anthem-head"><span>♫ המנון ליגת האלופות</span><button type="button" class="anthem-close" aria-label="סגירה">×</button></div><div id="anthem-yt"></div>';
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(card));
  if (document.body) document.body.appendChild(card);
  card.querySelector(".anthem-close").addEventListener("click", () => stopAll());
  window.onYouTubeIframeAPIReady = () => {
    yt = new YT.Player("anthem-yt", { width: 220, height: 124, videoId: YT_ID, playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => { ytReady = true; },
        onStateChange: e => { ytPlaying = e.data === 1; if (e.data === 0) stopAll(); window.dispatchEvent(new CustomEvent("anthem", { detail: { playing: ytPlaying || Boolean(ctx) } })); },
        onError: () => { ytFailed = true; card.hidden = true; play(); }
      } });
  };
  const tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; tag.onerror = () => { ytFailed = true; }; document.head.appendChild(tag);

  function playAnthem() {
    if (ytReady && !ytFailed) { card.hidden = false; yt.seekTo(0); yt.playVideo(); window.dispatchEvent(new CustomEvent("anthem", { detail: { playing: true } })); return; }
    play();
  }
  function stopAll() {
    if (yt && ytReady) { try { yt.pauseVideo(); } catch (_) {} }
    card.hidden = true; ytPlaying = false; stop();
  }

  window.GoalAnthem = { play: playAnthem, stop: stopAll, get playing() { return Boolean(ctx) || ytPlaying || !card.hidden; } };
})();
