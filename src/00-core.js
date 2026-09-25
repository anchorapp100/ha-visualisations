/* =====================================================================
 * HA Visualisations: audio-reactive visuals for Home Assistant voice assistants.
 *   A skin engine (shared audio analysis + renderer + bloom), eighteen skins,
 *   a demo driver (analysed speech clips) and the Home Assistant overlay.
 *   Source: src/*.js, built by build.py. MIT licence.
 * ===================================================================== */
(function () {
  "use strict";
  if (window.VoiceVisuals) return;
  var VERSION = "__VV_VERSION__";

  var CFG = {
    satellite: "",                // the assist_satellite entity to follow; "" = the first one in Home Assistant
    speaker: "",                  // media_player that plays its replies; "" = the one on the same device, if any
    heardSensor: "",              // optional sensor holding what you last said (else it comes from the assistant's debug log)
    replySensor: "",              // optional sensor holding the last reply (else the debug log)
    roomLevelSensor: "",          // optional sensor with the satellite's room sound level (a fallback visual source)
    skinSelect: "input_select.voice_visual",   // optional helper that picks the skin on every screen
    skin: "",                     // the skin to use when there is no helper (a name or id)
    assistantName: "Assist",      // painted on the meters and scopes
    dashboards: "",               // only show on dashboard paths starting with this, e.g. "/wall-panel" ("" = everywhere)
    idleFadeMs: 5000,
    pollMs: 150,
    micGain: 13, micGate: 0.006,
    ttsLeadMs: 300,               // a satellite starts speaking ~0.3s after a short reply's audio is ready...
    ttsLeadPerS: 0.12,            // ...plus ~0.12s per second of audio when it fetches the whole clip first.
                                  // Both are refined from each turn's real end (localStorage vvLeadObs).
    endLagMs: 120,                // the speaker's "idle" reaches us ~0.1s after the last word
    speakHoldMs: 15000,           // keep waiting for the speaker this long past the audio's expected end
    capMaxChars: 150,             // one caption page at most (and never more than fits the reply box)
    speechCps: 15.7,              // speaking pace in characters per second (Piper en_GB-alba)
    synthRtf: 0                   // only without the audio: synthesis seconds per second of speech (~0.37 for Piper on a Raspberry Pi)
  };
  // config.json (read by the loader) or a page's own window.VoiceVisualsConfig overrides any of the above
  (function () {
    var u = window.VoiceVisualsConfig || {};
    for (var k in u) if (Object.prototype.hasOwnProperty.call(u, k) && Object.prototype.hasOwnProperty.call(CFG, k)) CFG[k] = u[k];
  })();
  CFG.stateEnt = CFG.satellite; CFG.speakerEnt = CFG.speaker; CFG.heardEnt = CFG.heardSensor; CFG.replyEnt = CFG.replySensor;
  CFG.roomEnt = CFG.roomLevelSensor; CFG.selectEnt = CFG.skinSelect; CFG.panelPath = CFG.dashboards;
  function ASSIST_LABEL() { return String(CFG.assistantName || "Assist").toUpperCase(); }
  var SURPRISE = "Surprise me";

  /* ---------------- small utils ---------------- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  // frame-rate independent follower; up/down are per-frame coefficients at 30fps
  function follow(cur, target, up, down, dt) { var k = target > cur ? up : down; return cur + (target - cur) * (1 - Math.pow(1 - k, dt * 30)); }
  function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + (+a).toFixed(3) + ")"; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function mkCanvas(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function rng(seed) { var s = (seed >>> 0) || 0x9e3779b9; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hash2(i, j) { var n = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function noise1(x) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash2(i, 17), hash2(i + 1, 17), u); }
  function noise2(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
  }
  function gauss(r) { var a = 1 - r(), b = r(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(TAU * b); }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  // soft round glow sprite (white core -> colour -> transparent)
  function dotSprite(size, color, core) {
    var c = mkCanvas(size, size), g = c.getContext("2d"), r = size / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, rgba(core || [255, 255, 255], 1)); grd.addColorStop(0.22, rgba(color, 0.95));
    grd.addColorStop(0.55, rgba(color, 0.28)); grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, size, size); return c;
  }

  /* ---------------- spectrum analysis (shared with the TTS path) ---------------- */
  var FFT_N = 512, FFT_LOG = 9, fftRev, fftCos, fftSin, fftHann, fRe, fIm;
  function fftInit() {
    if (fftRev) return;
    fftRev = new Uint16Array(FFT_N);
    for (var i = 0; i < FFT_N; i++) { var r = 0, x = i; for (var b = 0; b < FFT_LOG; b++) { r = (r << 1) | (x & 1); x >>= 1; } fftRev[i] = r; }
    fftCos = new Float32Array(FFT_N / 2); fftSin = new Float32Array(FFT_N / 2);
    for (var k = 0; k < FFT_N / 2; k++) { fftCos[k] = Math.cos(TAU * k / FFT_N); fftSin[k] = -Math.sin(TAU * k / FFT_N); }
    fftHann = new Float32Array(FFT_N); for (var h = 0; h < FFT_N; h++) fftHann[h] = 0.5 - 0.5 * Math.cos(TAU * h / (FFT_N - 1));
    fRe = new Float32Array(FFT_N); fIm = new Float32Array(FFT_N);
  }
  function fftMag(inp, out) {
    fIm.fill(0);
    for (var i = 0; i < FFT_N; i++) fRe[fftRev[i]] = inp[i] * fftHann[i];
    for (var size = 2; size <= FFT_N; size <<= 1) {
      var half = size >> 1, step = FFT_N / size;
      for (var s = 0; s < FFT_N; s += size) for (var j = 0; j < half; j++) {
        var k = j * step, a = s + j, b = a + half;
        var tr = fftCos[k] * fRe[b] - fftSin[k] * fIm[b], ti = fftCos[k] * fIm[b] + fftSin[k] * fRe[b];
        fRe[b] = fRe[a] - tr; fIm[b] = fIm[a] - ti; fRe[a] += tr; fIm[a] += ti;
      }
    }
    for (var q = 0; q < FFT_N / 2; q++) out[q] = Math.sqrt(fRe[q] * fRe[q] + fIm[q] * fIm[q]);
  }
  // 32 log-spaced bands, 80 Hz .. 7 kHz, as FFT bin edges for a given sample rate / FFT size
  function bandEdges(sr, n) {
    var e = [];
    for (var i = 0; i <= 32; i++) e.push(Math.max(1, Math.round(80 * Math.pow(7000 / 80, i / 32) / (sr / n))));
    for (var j = 1; j <= 32; j++) if (e[j] <= e[j - 1]) e[j] = e[j - 1] + 1;
    return e;
  }
  var BAND_F = (function () { var a = new Float32Array(32); for (var b = 0; b < 32; b++) a[b] = Math.sqrt(80 * Math.pow(7000 / 80, b / 32) * 80 * Math.pow(7000 / 80, (b + 1) / 32)); return a; })();
  var BAND_PH = (function () { var r = rng(99), a = new Float32Array(32); for (var b = 0; b < 32; b++) a[b] = r() * TAU; return a; })();

  // Decoded reply audio -> 20ms envelope + 32-band spectrum + 16k mono (for real waveforms)
  function analyzeBuffer(ab) {
    fftInit();
    var sr = ab.sampleRate, src = ab.getChannelData(0), dec = Math.max(1, Math.round(sr / 16000)), dsr = sr / dec;
    var n = Math.floor(src.length / dec), mono = new Float32Array(n), i, j, k;
    for (i = 0; i < n; i++) { var s = 0; for (j = 0; j < dec; j++) s += src[i * dec + j]; mono[i] = s / dec; }
    var hop = Math.round(dsr * 0.02), frames = Math.ceil(n / hop), env = new Float32Array(frames), bdb = new Float32Array(frames * 32);
    var win = new Float32Array(FFT_N), mag = new Float32Array(FFT_N / 2), E = bandEdges(dsr, FFT_N);
    for (var f = 0; f < frames; f++) {
      var off = f * hop, s2 = 0, c = 0;
      for (k = 0; k < hop && off + k < n; k++) { var v = mono[off + k]; s2 += v * v; c++; }
      env[f] = Math.sqrt(s2 / Math.max(1, c));
      var st = off - ((FFT_N - hop) >> 1);
      for (k = 0; k < FFT_N; k++) { var p = st + k; win[k] = (p >= 0 && p < n) ? mono[p] : 0; }
      fftMag(win, mag);
      for (var b = 0; b < 32; b++) { var m = 0; for (k = E[b]; k < Math.min(E[b + 1], FFT_N / 2); k++) if (mag[k] > m) m = mag[k]; bdb[f * 32 + b] = 20 * Math.log10(m + 1e-9); }
    }
    var es = Array.prototype.slice.call(env).sort(function (a, b) { return a - b; }), eref = es[Math.floor(es.length * 0.95)] || 1;
    var ds = Array.prototype.slice.call(bdb).sort(function (a, b) { return a - b; }), top = ds[Math.floor(ds.length * 0.98)], bot = top - 55;
    var bands = new Float32Array(frames * 32), peak = 1e-6;
    for (i = 0; i < env.length; i++) env[i] = Math.min(1, env[i] / eref);
    for (i = 0; i < bdb.length; i++) bands[i] = clamp((bdb[i] - bot) / 55, 0, 1);
    var abs = []; for (i = 0; i < n; i += 7) abs.push(Math.abs(mono[i])); abs.sort(function (a, b) { return a - b; });
    peak = abs[Math.floor(abs.length * 0.995)] || 1;
    return { frames: frames, env: env, bands: bands, mono: mono, dsr: dsr, peak: peak, dur: ab.duration };
  }
  // Unpack the embedded demo clips (bytes: [env, 32 bands] per 20ms frame)
  function unpackClip(c) {
    var raw = atob(c.b64), n = c.frames, env = new Float32Array(n), bands = new Float32Array(n * 32);
    for (var f = 0; f < n; f++) { env[f] = raw.charCodeAt(f * 33) / 255; for (var b = 0; b < 32; b++) bands[f * 32 + b] = raw.charCodeAt(f * 33 + 1 + b) / 255; }
    return { frames: n, env: env, bands: bands, dur: c.dur };
  }

  /* ---------------- synthesis fallbacks (when there is no real spectrum/waveform) ---------------- */
  function synthBands(out, voice, t) {
    for (var b = 0; b < 32; b++) {
      var shape = 0.1 + 0.55 * Math.exp(-Math.pow((b - 6) / 3.2, 2)) + 0.75 * Math.exp(-Math.pow((b - 14) / 4.2, 2)) + 0.4 * Math.exp(-Math.pow((b - 22) / 3.5, 2));
      out[b] = clamp(voice * shape * (0.55 + 0.9 * noise1(b * 1.73 + t * 5.1)) * 1.25, 0, 1);
    }
  }
  function synthWave(out, bands, voice, t) {
    var n = out.length, i, b, peak = 1e-6, tt = t % 600;
    for (i = 0; i < n; i++) out[i] = 0;
    for (b = 0; b < 24; b++) {                     // <= ~2.9 kHz keeps it alias-free across a 20ms window
      var a = bands[b] * bands[b] * (1.15 - b / 30);
      if (a < 0.003) continue;
      var w = TAU * BAND_F[b], ph = BAND_PH[b];
      for (i = 0; i < n; i++) out[i] += a * Math.sin(w * (tt + i * 0.02 / n) + ph);
    }
    for (i = 0; i < n; i++) { var v = Math.abs(out[i]); if (v > peak) peak = v; }
    var g = clamp(voice, 0, 1) / peak;
    for (i = 0; i < n; i++) out[i] *= g;
  }

  /* ---------------- frame builder: raw inputs -> the smoothed frame every skin draws from ---------------- */
  var TMPB = new Float32Array(32);
  function FrameBuilder() {
    this.U = 0; this.M = 0; this.bands = new Float32Array(32); this.wave = new Float32Array(256);
    this.state = "idle"; this.stateSince = 0; this.hist = new Float32Array(10); this.hi = 0; this.lastOnset = -9;
    this.f = { t: 0, dt: 0, state: "idle", stateAge: 0, level: 0, slow: 0, raw: 0, voice: 0, bands: this.bands, wave: this.wave,
               onset: false, speaking: false, person: null, crisp: false, boost: 1 };
  }
  // inp: { t, dt, state, target, voice, crisp, bands|null, wave|null, person }
  FrameBuilder.prototype.build = function (inp) {
    var f = this.f, dt = clamp(inp.dt || 0, 0, 0.1), b;
    if (inp.state !== this.state) { this.state = inp.state; this.stateSince = inp.t; }
    var tgt = clamp(inp.target || 0, 0, 1), voice = clamp(inp.voice || 0, 0, 1);
    this.U = follow(this.U, tgt, inp.crisp ? .5 : .2, inp.crisp ? .25 : .08, dt);
    this.M = follow(this.M, tgt, .08, .03, dt);
    if (inp.bands) { for (b = 0; b < 32; b++) this.bands[b] = follow(this.bands[b], inp.bands[b], .6, .22, dt); }
    else { synthBands(TMPB, voice, inp.t); for (b = 0; b < 32; b++) this.bands[b] = follow(this.bands[b], TMPB[b], .45, .15, dt); }
    if (inp.wave) this.wave.set(inp.wave); else synthWave(this.wave, this.bands, voice, inp.t);
    var avg = 0; for (var i = 0; i < this.hist.length; i++) avg += this.hist[i]; avg /= this.hist.length;
    var onset = voice > 0.22 && voice > avg * 1.35 + 0.06 && inp.t - this.lastOnset > 0.13;
    if (onset) this.lastOnset = inp.t;
    this.hist[this.hi] = voice; this.hi = (this.hi + 1) % this.hist.length;
    f.t = inp.t; f.dt = dt; f.state = this.state; f.stateAge = inp.t - this.stateSince;
    f.level = this.U; f.slow = this.M; f.raw = tgt; f.voice = voice; f.onset = onset; f.speaking = voice > 0.18;
    f.person = inp.person || null; f.crisp = !!inp.crisp; f.boost = this.state === "responding" ? 1.25 : 1;
    return f;
  };

  /* ---------------- skins + renderer ---------------- */
  var SKINS = [], SKIN = {};
  function register(def) { SKINS.push(def); SKIN[def.id] = def; }
  function skinByName(name) { for (var i = 0; i < SKINS.length; i++) if (SKINS[i].name === name || SKINS[i].id === name) return SKINS[i]; return null; }

  function Renderer(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.quality = opts.quality || 1; this.thumb = !!opts.thumb;
    this.w = 0; this.h = 0; this.u = 1; this.bufs = {}; this.S = {}; this.skin = null; this.needsInit = true; this.broken = {};
  }
  Renderer.prototype.setSkin = function (id) {
    var sk = SKIN[id] || skinByName(id) || SKINS[0];
    if (this.broken[sk.id]) sk = SKINS[0];
    if (sk === this.skin) return sk;
    this.skin = sk; this.needsInit = true; this.w = 0;
    return sk;
  };
  Renderer.prototype.size = function () {
    var c = this.canvas, cw = c.clientWidth || c.width, ch = c.clientHeight || c.height;
    var px = (this.skin && this.skin.hiDpi) ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    var w = Math.max(2, Math.round(cw * px)), h = Math.max(2, Math.round(ch * px));
    if (w !== this.w || h !== this.h) { this.w = w; this.h = h; c.width = w; c.height = h; this.u = Math.min(w, h) / 800; this.needsInit = true; }
  };
  Renderer.prototype.buf = function (name, w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    var b = this.bufs[name];
    if (!b || b.width !== w || b.height !== h) { b = mkCanvas(w, h); this.bufs[name] = b; }
    return b;
  };
  Renderer.prototype.render = function (f) {
    if (!this.skin) this.setSkin(SKINS[0].id);
    this.size();
    var sk = this.skin, g = this.ctx;
    try {
      if (this.needsInit) { this.needsInit = false; this.S = {}; this.bufs = {}; if (sk.init) sk.init(this, f); }
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.filter = "none";
      sk.draw(this, f);
    } catch (e) {
      if (window.console) console.warn("[voice-visuals] skin '" + sk.id + "' failed; falling back to Lens Flares.", e);
      this.broken[sk.id] = true;
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.filter = "none";
      if (sk !== SKINS[0]) this.setSkin(SKINS[0].id);
      else { g.fillStyle = "#000"; g.fillRect(0, 0, this.w, this.h); }
    }
  };
  // Additive glow of `src` onto the visible canvas. radius = fraction of height.
  Renderer.prototype.bloom = function (src, amount, radius, passes) {
    var g = this.ctx, W = this.w, H = this.h, ds = 4;
    passes = passes || 2;
    for (var p = 0; p < passes; p++) {
      var bw = Math.max(2, Math.round(W / ds)), bh = Math.max(2, Math.round(H / ds));
      var b = this.buf("__bloom" + p, bw, bh), bc = b.getContext("2d");
      bc.globalCompositeOperation = "source-over"; bc.globalAlpha = 1; bc.clearRect(0, 0, bw, bh);
      bc.filter = "blur(" + Math.max(0.6, radius * H * (1 + p) / ds).toFixed(2) + "px)";
      bc.drawImage(src, 0, 0, bw, bh); bc.filter = "none";
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = clamp(amount / (1 + p * 0.6), 0, 1);
      g.imageSmoothingEnabled = true; g.drawImage(b, 0, 0, W, H); g.restore();
      ds *= 2;
    }
  };
  // Full-frame offscreen scene buffer (skins that draw once, then bloom what they drew)
  Renderer.prototype.scene = function () { return this.buf("__scene", this.w, this.h); };
  // Draw a full-frame scene buffer to the screen (+ optional bloom of that scene)
  Renderer.prototype.present = function (scene, bloomAmt, bloomRad, passes) {
    var g = this.ctx; g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(scene, 0, 0);
    if (bloomAmt > 0) this.bloom(scene, bloomAmt, bloomRad, passes);
  };
