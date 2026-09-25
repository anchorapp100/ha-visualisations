/* =====================================================================
 * HA Visualisations: audio-reactive visuals for Home Assistant voice assistants.
 *   A skin engine (shared audio analysis + renderer + bloom), twenty-two skins,
 *   a demo driver (analysed speech clips) and the Home Assistant overlay.
 *   Source: src/*.js, built by build.py. MIT licence.
 * ===================================================================== */
(function () {
  "use strict";
  if (window.VoiceVisuals) return;
  var VERSION = "20260925165148";

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

/* generated by analyze.py from real Piper (en_GB-alba) clips: 20ms frames, [env, 32 log bands 80-7000Hz] bytes */
var VV_DEMO = {"user": {"frames": 136, "dur": 2.705, "b64": "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"}, "reply": {"frames": 442, "dur": 8.824, "b64": "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"}};

  /* ---------- Classic VU \u2014 twin backlit analogue meters (MIC = you, the other = the assistant's reply) ----------
     Deflection is linear in amplitude (as a real VU): dB marks sit at 10^(dB/20)/1.413 of full scale.
     Needle = 2nd-order spring (zeta 0.81, wn 18.9 rad/s) -> ~300ms rise, ~1.3% overshoot, per the VU spec. */
  register({
    id: "classic-vu", name: "Classic VU", layout: "bottom", text: "warm", hiDpi: true,
    blurb: "Twin backlit analogue VU meters with real needle ballistics \u2014 MIC for you, the other for the assistant.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u;
      var gap = W * 0.04, mw = Math.min((W * 0.84 - gap) / 2, H * 0.52 * 1.62), mh = mw / 1.62;
      S.mw = mw; S.mh = mh; S.my = H * 0.1; S.mx = [W / 2 - gap / 2 - mw, W / 2 + gap / 2];
      var fu = mw / 400; S.fu = fu;
      S.fx = 12 * fu; S.fy = 12 * fu; S.fw = mw - 24 * fu; S.fh = mh - 24 * fu;
      S.px = mw / 2; S.py = S.fy + S.fh * 1.08; S.Rs = S.fh * 0.83;
      S.m = [{ pos: 0, vel: 0, peakT: -9, lamp: .6 }, { pos: 0, vel: 0, peakT: -9, lamp: .6 }];
      var th = function (a) { return (-138 + 96 * a) * Math.PI / 180; };
      var amp = function (db) { return Math.pow(10, db / 20) / 1.413; };
      S.th = th;
      // ---- face ----
      var face = mkCanvas(mw, mh), g = face.getContext("2d");
      var bz = g.createLinearGradient(0, 0, 0, mh); bz.addColorStop(0, "#34373c"); bz.addColorStop(1, "#0b0c0e");
      roundRect(g, 0, 0, mw, mh, 16 * fu); g.fillStyle = bz; g.fill();
      roundRect(g, S.fx, S.fy, S.fw, S.fh, 8 * fu); g.save(); g.clip();
      var fg = g.createRadialGradient(S.px, S.fy + S.fh * 1.15, 0, S.px, S.fy + S.fh * 1.15, S.fw * 0.95);
      fg.addColorStop(0, "#fff7e0"); fg.addColorStop(0.5, "#f7e4b3"); fg.addColorStop(0.85, "#e6c889"); fg.addColorStop(1, "#c9a45f");
      g.fillStyle = fg; g.fillRect(S.fx, S.fy, S.fw, S.fh);
      var R = rng(5); for (var k = 0; k < 900; k++) { g.fillStyle = "rgba(90,60,20," + (0.015 + R() * 0.03).toFixed(3) + ")"; g.fillRect(S.fx + R() * S.fw, S.fy + R() * S.fh, fu, fu); }
      var px = S.px, py = S.py, Rs = S.Rs;
      function P(rad, a) { var t = th(a); return [px + rad * Math.cos(t), py + rad * Math.sin(t)]; }
      g.lineCap = "butt";
      g.strokeStyle = "#1c1a16"; g.lineWidth = 1.6 * fu; g.beginPath(); g.arc(px, py, Rs, th(amp(-20)), th(amp(0))); g.stroke();
      g.strokeStyle = "#c8102e"; g.lineWidth = 6 * fu; g.beginPath(); g.arc(px, py, Rs + 3 * fu, th(amp(0)), th(1)); g.stroke();
      var majors = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3], minors = [-15, -8.5, -6, -4, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
      majors.forEach(function (db) {
        var a = amp(db), p0 = P(Rs, a), p1 = P(Rs + 11 * fu, a);
        g.strokeStyle = db > 0 ? "#b30d28" : "#1c1a16"; g.lineWidth = 1.7 * fu; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        var t = P(Rs + 25 * fu, a); g.fillStyle = db > 0 ? "#b30d28" : "#1c1a16";
        g.font = "700 " + (15 * fu).toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(Math.abs(db)), t[0], t[1]);
      });
      minors.forEach(function (db) {
        var a = amp(db), p0 = P(Rs, a), p1 = P(Rs + 6 * fu, a);
        g.strokeStyle = db > 0 ? "#b30d28" : "#1c1a16"; g.lineWidth = 1.1 * fu; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      });
      // percentage scale
      g.globalAlpha = 0.62; g.strokeStyle = "#1c1a16"; g.lineWidth = 1 * fu; g.beginPath(); g.arc(px, py, Rs - 26 * fu, th(0.0001), th(0.708)); g.stroke();
      [0, 20, 40, 60, 80, 100].forEach(function (pc) {
        var a = pc / 100 * 0.708, p0 = P(Rs - 26 * fu, a), p1 = P(Rs - 31 * fu, a), t = P(Rs - 40 * fu, a);
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        g.fillStyle = "#1c1a16"; g.font = "600 " + (8.5 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif"; g.fillText(String(pc), t[0], t[1]);
      });
      g.globalAlpha = 1;
      var m1 = P(Rs - 14 * fu, 0.02), p2 = P(Rs - 14 * fu, 0.985);
      g.font = "700 " + (20 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif"; g.fillStyle = "#1c1a16"; g.fillText("\u2212", m1[0], m1[1]);
      g.fillStyle = "#b30d28"; g.fillText("+", p2[0], p2[1]);
      g.fillStyle = "#15130f"; g.font = "800 " + (34 * fu).toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; g.fillText("VU", px, S.fy + S.fh * 0.66);
      g.globalAlpha = 0.5; g.font = "600 " + (8 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif";
      g.fillText("D  A  V  I  S    \u00b7    L  U  N  A", px, S.fy + S.fh * 0.77); g.globalAlpha = 1;
      g.fillStyle = "rgba(40,20,0,0.55)"; g.font = "600 " + (7 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif";
      g.fillText("PEAK", S.fx + S.fw - 22 * fu, S.fy + 34 * fu);
      g.restore();
      // bezel inner edge
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 2 * fu; roundRect(g, S.fx, S.fy, S.fw, S.fh, 8 * fu); g.stroke();
      S.face = face;
      // ---- cover strip (hides the pivot; drawn over the needle) ----
      var cov = mkCanvas(mw, mh), c = cov.getContext("2d"), cy0 = S.fy + S.fh * 0.855;
      roundRect(c, S.fx, S.fy, S.fw, S.fh, 8 * fu); c.save(); c.clip();
      var cg = c.createLinearGradient(0, cy0, 0, S.fy + S.fh); cg.addColorStop(0, "#1b1c1f"); cg.addColorStop(1, "#050506");
      c.fillStyle = cg; c.fillRect(S.fx, cy0, S.fw, S.fh); c.fillStyle = "rgba(255,255,255,0.10)"; c.fillRect(S.fx, cy0, S.fw, 1.2 * fu);
      var sx = px, sy = S.fy + S.fh * 0.93, sr = 5 * fu, sg = c.createRadialGradient(sx - sr * .3, sy - sr * .3, 0, sx, sy, sr);
      sg.addColorStop(0, "#8b8f95"); sg.addColorStop(1, "#2a2c2f"); c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
      c.strokeStyle = "#111"; c.lineWidth = 1.3 * fu; c.beginPath(); c.moveTo(sx - sr * .75, sy + sr * .25); c.lineTo(sx + sr * .75, sy - sr * .25); c.stroke();
      c.restore(); S.cover = cov;
      // ---- glass ----
      var gl = mkCanvas(mw, mh), q = gl.getContext("2d");
      roundRect(q, S.fx, S.fy, S.fw, S.fh, 8 * fu); q.save(); q.clip();
      var gg = q.createLinearGradient(S.fx, S.fy, S.fx + S.fw * 0.55, S.fy + S.fh);
      gg.addColorStop(0, "rgba(255,255,255,0.20)"); gg.addColorStop(0.36, "rgba(255,255,255,0.05)"); gg.addColorStop(0.37, "rgba(255,255,255,0)"); gg.addColorStop(1, "rgba(255,255,255,0)");
      q.fillStyle = gg; q.fillRect(S.fx, S.fy, S.fw, S.fh);
      var ig = q.createLinearGradient(0, S.fy, 0, S.fy + 14 * fu); ig.addColorStop(0, "rgba(0,0,0,0.28)"); ig.addColorStop(1, "rgba(0,0,0,0)");
      q.fillStyle = ig; q.fillRect(S.fx, S.fy, S.fw, 14 * fu); q.restore(); S.glass = gl;
      // ---- brushed panel ----
      var pn = mkCanvas(W, H), p = pn.getContext("2d"), R2 = rng(11);
      p.fillStyle = "#121417"; p.fillRect(0, 0, W, H);
      for (var y = 0; y < H; y += 2) { var a2 = R2(); p.fillStyle = a2 < .15 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255," + (0.008 + a2 * 0.028).toFixed(3) + ")"; p.fillRect(0, y, W, 1); }
      var sh = p.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, "rgba(255,255,255,0.035)"); sh.addColorStop(0.45, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.3)");
      p.fillStyle = sh; p.fillRect(0, 0, W, H);
      var vg = p.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.62)");
      p.fillStyle = vg; p.fillRect(0, 0, W, H);
      p.save(); p.shadowColor = "rgba(0,0,0,0.85)"; p.shadowBlur = 34 * u; p.shadowOffsetY = 8 * u; p.fillStyle = "#000";
      S.mx.forEach(function (x) { roundRect(p, x, S.my, mw, mh, 16 * fu); p.fill(); }); p.restore();
      [[0.035, 0.06], [0.965, 0.06], [0.035, 0.94], [0.965, 0.94]].forEach(function (s, i) {
        var X = s[0] * W, Y = s[1] * H, rr = 8 * u, gg2 = p.createRadialGradient(X - rr * .3, Y - rr * .3, 0, X, Y, rr);
        gg2.addColorStop(0, "#71757b"); gg2.addColorStop(1, "#1f2124"); p.fillStyle = gg2; p.beginPath(); p.arc(X, Y, rr, 0, TAU); p.fill();
        p.strokeStyle = "rgba(0,0,0,0.8)"; p.lineWidth = 1.4 * u; var ang = 0.4 + i * 0.9;
        p.beginPath(); p.moveTo(X - Math.cos(ang) * rr * .7, Y - Math.sin(ang) * rr * .7); p.lineTo(X + Math.cos(ang) * rr * .7, Y + Math.sin(ang) * rr * .7); p.stroke();
      });
      function engrave(txt, x, y, size, ls) {
        p.font = "700 " + size.toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; p.textAlign = "center"; p.textBaseline = "middle";
        var s = txt.split("").join(ls);
        p.fillStyle = "rgba(0,0,0,0.75)"; p.fillText(s, x, y - 1); p.fillStyle = "rgba(255,255,255,0.12)"; p.fillText(s, x, y + 1);
        p.fillStyle = "#80868e"; p.fillText(s, x, y);
      }
      engrave(ASSIST_LABEL() + " \u00b7 STUDIO MONITOR", W / 2, S.my * 0.5, 13 * u, "\u200a");
      var ly = S.my + mh + 34 * u;
      engrave("MIC", S.mx[0] + mw / 2, ly, 17 * u, "\u2009"); engrave(ASSIST_LABEL(), S.mx[1] + mw / 2, ly, 17 * u, "\u2009");
      engrave("THINKING", W / 2, ly + 18 * u, 8.5 * u, "\u200a");
      S.ly = ly; S.panel = pn;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, fu = S.fu, scene = r.scene(), g = scene.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.panel, 0, 0);
      var tgt = [f.state === "listening" ? f.voice : 0, f.state === "responding" ? f.voice : 0];
      for (var i = 0; i < 2; i++) {
        var m = S.m[i], target = clamp(tgt[i] * 0.95, 0, 1.06), h = f.dt / 4;
        for (var k = 0; k < 4; k++) { m.vel += (357 * (target - m.pos) - 30.6 * m.vel) * h; m.pos += m.vel * h; }
        if (m.pos < 0) { m.pos = 0; if (m.vel < 0) m.vel = 0; }
        if (m.pos > 1.07) { m.pos = 1.07; m.vel = -m.vel * 0.25; }
        if (m.pos > 0.73) m.peakT = f.t;
        m.lamp = follow(m.lamp, 0.55 + 0.45 * Math.min(1, m.pos), .2, .08, f.dt);
        var X = S.mx[i], Y = S.my;
        g.drawImage(S.face, X, Y);
        g.save(); roundRect(g, X + S.fx, Y + S.fy, S.fw, S.fh, 8 * fu); g.clip();
        g.globalCompositeOperation = "lighter";
        var lg = g.createRadialGradient(X + S.px, Y + S.fy + S.fh * 1.05, 0, X + S.px, Y + S.fy + S.fh * 1.05, S.fw * 0.8);
        lg.addColorStop(0, "rgba(255,186,90," + (0.10 + 0.20 * m.lamp).toFixed(3) + ")"); lg.addColorStop(1, "rgba(255,186,90,0)");
        g.fillStyle = lg; g.fillRect(X + S.fx, Y + S.fy, S.fw, S.fh);
        g.globalCompositeOperation = "source-over";
        var t = S.th(m.pos), c = Math.cos(t), s = Math.sin(t), nx = -s, ny = c, cx = X + S.px, cy = Y + S.py;
        var r0 = S.Rs * 0.25, r1 = S.Rs * 1.02, w0 = 1.3 * fu, w1 = 0.45 * fu;
        function needle(ox, oy) {
          g.beginPath();
          g.moveTo(cx + c * r0 + nx * w0 + ox, cy + s * r0 + ny * w0 + oy); g.lineTo(cx + c * r1 + nx * w1 + ox, cy + s * r1 + ny * w1 + oy);
          g.lineTo(cx + c * r1 - nx * w1 + ox, cy + s * r1 - ny * w1 + oy); g.lineTo(cx + c * r0 - nx * w0 + ox, cy + s * r0 - ny * w0 + oy); g.closePath(); g.fill();
        }
        g.filter = "blur(" + (1.6 * fu).toFixed(1) + "px)"; g.fillStyle = "rgba(0,0,0,0.24)"; needle(2.6 * fu, 3.6 * fu); g.filter = "none";
        g.fillStyle = "#121212"; needle(0, 0);
        g.restore();
        g.drawImage(S.cover, X, Y);
        var on = f.t - m.peakT < 0.18, lx = X + S.fx + S.fw - 22 * fu, lyy = Y + S.fy + 22 * fu, lr = 5 * fu;
        var led = g.createRadialGradient(lx - lr * .3, lyy - lr * .3, 0, lx, lyy, lr);
        if (on) { led.addColorStop(0, "#fff"); led.addColorStop(0.35, "#ff4a4a"); led.addColorStop(1, "#a00000"); }
        else { led.addColorStop(0, "#6a2a2a"); led.addColorStop(1, "#2a0909"); }
        g.fillStyle = led; g.beginPath(); g.arc(lx, lyy, lr, 0, TAU); g.fill();
        if (on) { g.globalCompositeOperation = "lighter"; var hg = g.createRadialGradient(lx, lyy, 0, lx, lyy, lr * 4);
          hg.addColorStop(0, "rgba(255,60,60,0.6)"); hg.addColorStop(1, "rgba(255,60,60,0)"); g.fillStyle = hg; g.fillRect(lx - lr * 4, lyy - lr * 4, lr * 8, lr * 8); g.globalCompositeOperation = "source-over"; }
        g.drawImage(S.glass, X, Y);
      }
      var thinking = f.state === "processing", bl = thinking ? 0.5 + 0.5 * Math.sin(f.t * TAU * 1.6) : 0;
      var tx = W / 2, ty = S.ly - 4 * u, tr = 5.5 * u, tg = g.createRadialGradient(tx, ty, 0, tx, ty, tr);
      tg.addColorStop(0, bl > 0.05 ? "rgba(255,245,210,1)" : "#4a3b16"); tg.addColorStop(1, bl > 0.05 ? "rgba(255,160,30," + (0.5 + bl * 0.5).toFixed(2) + ")" : "#1e1606");
      g.fillStyle = tg; g.beginPath(); g.arc(tx, ty, tr, 0, TAU); g.fill();
      if (bl > 0.05) { g.globalCompositeOperation = "lighter"; var bg2 = g.createRadialGradient(tx, ty, 0, tx, ty, tr * 5);
        bg2.addColorStop(0, "rgba(255,170,40," + (0.45 * bl).toFixed(2) + ")"); bg2.addColorStop(1, "rgba(255,170,40,0)"); g.fillStyle = bg2; g.fillRect(tx - tr * 5, ty - tr * 5, tr * 10, tr * 10); g.globalCompositeOperation = "source-over"; }
      r.present(scene, 0.1, 0.014, 1);
    }
  });

  /* ---------- Aurora \u2014 northern-lights curtains: green = you, violet = the assistant; syllables send ripples ---------- */
  register({
    id: "aurora", name: "Aurora", layout: "bottom", text: "default",
    blurb: "Northern lights over the pines \u2014 green curtains for you, violet for the assistant, rippling on every syllable.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(21), i;
      var sky = mkCanvas(W, H), g = sky.getContext("2d"), sg = g.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, "#010208"); sg.addColorStop(0.45, "#030b1c"); sg.addColorStop(0.8, "#08193a"); sg.addColorStop(1, "#0c2144");
      g.fillStyle = sg; g.fillRect(0, 0, W, H);
      var mw = g.createRadialGradient(W * 0.5, H * 1.1, 0, W * 0.5, H * 1.1, H * 0.9); mw.addColorStop(0, "rgba(40,90,140,0.18)"); mw.addColorStop(1, "rgba(40,90,140,0)");
      g.fillStyle = mw; g.fillRect(0, 0, W, H); S.sky = sky;
      S.stars = [];
      var ns = Math.round(240 * (r.thumb ? 0.5 : 1));
      for (i = 0; i < ns; i++) S.stars.push({ x: R() * W, y: Math.pow(R(), 1.4) * H * 0.78, s: (0.4 + R() * R() * 1.6) * u, b: 0.25 + R() * 0.75, rate: 0.6 + R() * 2.4, ph: R() * TAU });
      // treeline
      var tl = mkCanvas(W, H), t = tl.getContext("2d");
      t.fillStyle = "#01030a"; t.beginPath(); t.moveTo(0, H);
      for (var x = 0; x <= W; x += 6 * u) t.lineTo(x, H * (0.905 + 0.035 * noise1(x / W * 4.3 + 2) - 0.02 * noise1(x / W * 13)));
      t.lineTo(W, H); t.closePath(); t.fill();
      var np = Math.round(W / (9 * u));
      for (i = 0; i < np; i++) {
        var px = R() * W, base = H * (0.905 + 0.035 * noise1(px / W * 4.3 + 2) - 0.02 * noise1(px / W * 13)) + 2 * u, ph = H * (0.03 + R() * R() * 0.085), pw = ph * (0.28 + R() * 0.12);
        t.beginPath();
        for (var lv = 0; lv < 4; lv++) {
          var ty = base - ph * (lv / 4), tw = pw * (1 - lv / 5);
          t.moveTo(px - tw / 2, ty); t.lineTo(px, ty - ph * 0.42); t.lineTo(px + tw / 2, ty);
        }
        t.moveTo(px - pw * .05, base); t.lineTo(px, base - ph); t.lineTo(px + pw * .05, base); t.fill();
      }
      S.tree = tl;
      function sprite(stops) {
        var c = mkCanvas(1, 128), q = c.getContext("2d"), gr = q.createLinearGradient(0, 128, 0, 0);
        stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); q.fillStyle = gr; q.fillRect(0, 0, 1, 128); return c;
      }
      S.spG = sprite([[0, "rgba(200,255,225,0)"], [0.035, "rgba(200,255,225,0.9)"], [0.09, "rgba(70,255,155,0.95)"], [0.33, "rgba(40,220,165,0.55)"], [0.62, "rgba(60,160,210,0.25)"], [0.85, "rgba(120,90,220,0.1)"], [1, "rgba(120,90,220,0)"]]);
      S.spV = sprite([[0, "rgba(255,215,245,0)"], [0.035, "rgba(255,215,245,0.9)"], [0.09, "rgba(255,95,205,0.95)"], [0.33, "rgba(190,75,255,0.55)"], [0.62, "rgba(110,85,255,0.25)"], [0.85, "rgba(60,60,200,0.1)"], [1, "rgba(60,60,200,0)"]]);
      S.rib = [
        { own: 0, y: 0.52, a1: 0.05, k1: 0.9, s1: 0.18, a2: 0.03, k2: 2.3, s2: 0.27, hr: 0.4, seed: 1 },
        { own: 0, y: 0.6, a1: 0.04, k1: 1.4, s1: -0.13, a2: 0.025, k2: 3.1, s2: 0.35, hr: 0.3, seed: 7 },
        { own: 1, y: 0.45, a1: 0.06, k1: 0.7, s1: 0.11, a2: 0.035, k2: 1.9, s2: -0.22, hr: 0.38, seed: 13 },
        { own: 1, y: 0.56, a1: 0.04, k1: 1.7, s1: -0.2, a2: 0.02, k2: 2.7, s2: 0.3, hr: 0.28, seed: 21 }];
      S.ph = 0; S.rip = []; S.e = [0.35, 0.35]; S.shoot = null; S.nextShoot = 6 + R() * 8; S.R = R;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, i;
      S.ph += f.dt * (0.55 + 1.5 * f.slow);
      var st = f.state, lv = f.level;
      var eY = st === "listening" ? 0.4 + 1.25 * lv : st === "processing" ? 0.42 + 0.12 * Math.sin(t * 2.2) : 0.3 + 0.1 * f.slow;
      var eL = st === "responding" ? 0.4 + 1.25 * lv : st === "processing" ? 0.42 + 0.12 * Math.sin(t * 2.2 + 1.3) : 0.28 + 0.1 * f.slow;
      S.e[0] = follow(S.e[0], eY, .3, .08, f.dt); S.e[1] = follow(S.e[1], eL, .3, .08, f.dt);
      if (f.onset) S.rip.push({ x0: 0.2 + S.R() * 0.6, t0: t, amp: 0.035 + 0.08 * f.voice, own: st === "responding" ? 1 : 0 });
      S.rip = S.rip.filter(function (q) { return t - q.t0 < 3; });
      var bw = Math.round(W / 2), bh = Math.round(H / 2), ab = r.buf("aur", bw, bh), a = ab.getContext("2d");
      a.globalCompositeOperation = "source-over"; a.clearRect(0, 0, bw, bh); a.globalCompositeOperation = "lighter";
      var step = 3, ph = S.ph;
      for (var k = 0; k < S.rib.length; k++) {
        var R = S.rib[k], e = S.e[R.own], sp = R.own ? S.spV : S.spG;
        for (var x = 0; x < bw; x += step) {
          var xn = x / bw, y = R.y * bh + R.a1 * bh * Math.sin(R.k1 * xn * TAU + R.s1 * ph * 3 + R.seed) + R.a2 * bh * Math.sin(R.k2 * xn * TAU - R.s2 * ph * 3 + R.seed * 2)
            + 0.022 * bh * (noise1(xn * 11 + ph * 0.8 + R.seed) - 0.5) * 2;                          // small folds along the hem
          for (i = 0; i < S.rip.length; i++) {
            var q = S.rip[i]; if (q.own !== R.own) continue;
            var age = t - q.t0, d1 = xn - (q.x0 + 0.33 * age), d2 = xn - (q.x0 - 0.33 * age);
            y -= q.amp * bh * (Math.exp(-d1 * d1 / 0.004) + Math.exp(-d2 * d2 / 0.004)) * Math.exp(-age * 1.1);
          }
          var fold = noise1(xn * 5 + ph * 0.35 + R.seed), rays = 0.55 + 0.45 * noise1(xn * 38 + ph * 1.6 + R.seed * 3);
          var I = e * (0.25 + 0.75 * fold * fold) * rays * smoothstep(0, 0.07, xn) * smoothstep(1, 0.93, xn);
          if (I < 0.01) continue;
          var h = R.hr * bh * (0.55 + 0.45 * noise1(xn * 3 - ph * 0.25 + R.seed)) * (0.75 + 0.45 * Math.min(e, 1.2));
          a.globalAlpha = clamp(I, 0, 1); a.drawImage(sp, 0, 0, 1, 128, x, y - h, step + 0.7, h);
        }
      }
      a.globalAlpha = 1;
      var g = r.ctx;
      g.drawImage(S.sky, 0, 0);
      for (i = 0; i < S.stars.length; i++) {
        var s = S.stars[i], b = s.b * (0.55 + 0.45 * Math.sin(t * s.rate + s.ph));
        g.fillStyle = "rgba(220,235,255," + b.toFixed(3) + ")"; g.fillRect(s.x, s.y, s.s, s.s);
      }
      if (!S.shoot && t > S.nextShoot) S.shoot = { t0: t, x: W * (0.15 + S.R() * 0.5), y: H * (0.05 + S.R() * 0.25), dx: W * (0.25 + S.R() * 0.2), dy: H * (0.12 + S.R() * 0.1) };
      if (S.shoot) {
        var sa = (t - S.shoot.t0) / 0.9;
        if (sa >= 1) { S.shoot = null; S.nextShoot = t + 12 + S.R() * 14; }
        else {
          var hx = S.shoot.x + S.shoot.dx * sa, hy = S.shoot.y + S.shoot.dy * sa, tx = hx - S.shoot.dx * 0.18, ty = hy - S.shoot.dy * 0.18;
          var sg = g.createLinearGradient(tx, ty, hx, hy); sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(1, "rgba(255,255,255," + (0.9 * Math.sin(sa * Math.PI)).toFixed(3) + ")");
          g.strokeStyle = sg; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
        }
      }
      g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true; g.drawImage(ab, 0, 0, W, H); g.globalCompositeOperation = "source-over";
      r.bloom(ab, 0.9, 0.035, 2);
      var hz = g.createLinearGradient(0, H * 0.78, 0, H * 0.93), em = clamp((S.e[0] + S.e[1]) * 0.18, 0, 0.5);
      hz.addColorStop(0, "rgba(80,200,170,0)"); hz.addColorStop(1, "rgba(" + (S.e[1] > S.e[0] ? "200,90,220" : "80,220,160") + "," + em.toFixed(3) + ")");
      g.globalCompositeOperation = "lighter"; g.fillStyle = hz; g.fillRect(0, H * 0.78, W, H * 0.15); g.globalCompositeOperation = "source-over";
      g.drawImage(S.tree, 0, 0);
    }
  });

  /* ---------- Mercury \u2014 liquid-chrome metaballs: loud syllables fling droplets that flow back and merge ----------
     Field = sum of (1 - d^2/R^2)^3 kernels on a low-res grid; height = sqrt(field - 0.5) scaled by the local radius, which
     is within a few % of a true sphere for a lone drop and bulges smoothly where drops merge. Shaded by a studio environment map. */
  register({
    id: "mercury", name: "Mercury", layout: "bottom", text: "default",
    blurb: "Liquid chrome that throws off droplets on every syllable \u2014 and pulls them back in.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, i, R = rng(33);
      S.fh = Math.round(clamp(H / 3.1 * (r.quality || 1), 56, 270)); S.fw = Math.max(8, Math.round(S.fh * W / H));
      var n = S.fw * S.fh;
      S.F = new Float32Array(n); S.Hh = new Float32Array(n); S.Rw = new Float32Array(n);
      S.img = new ImageData(S.fw, S.fh); S.glo = new ImageData(S.fw, S.fh);
      S.cA = mkCanvas(S.fw, S.fh); S.cB = mkCanvas(S.fw, S.fh);
      S.cx = 0.5 * W / H; S.cy = 0.42; S.floor = 0.745;
      S.sats = [];
      for (i = 0; i < 6; i++) S.sats.push({ a: i / 6 * TAU + R() * 0.4, sp: (0.22 + R() * 0.3) * (i % 2 ? -1 : 1), r0: 0.026 + R() * 0.014,
        band: 2 + i * 3, wob: R() * TAU, ws: 0.6 + R() * 0.9, o: 0.16, x: 0, y: 0, r: 0 });
      S.drops = []; S.R = R; S.tint = [110, 130, 255]; S.core = 0.07; S.spin = 0;
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, H), fy = S.floor * H;
      gr.addColorStop(0, "#040509"); gr.addColorStop(0.55, "#090b12"); gr.addColorStop(S.floor - 0.001, "#11141d");
      gr.addColorStop(S.floor, "#07080c"); gr.addColorStop(1, "#020203");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      var hl = g.createLinearGradient(0, 0, W, 0); hl.addColorStop(0, "rgba(160,175,210,0)"); hl.addColorStop(0.5, "rgba(160,175,210,0.16)"); hl.addColorStop(1, "rgba(160,175,210,0)");
      g.fillStyle = hl; g.fillRect(0, fy - 0.6 * u, W, 1.2 * u);
      var vg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.7)");
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      S.bg = bg;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, lv = f.level, st = f.state, i, k, x, y;
      var fw = S.fw, fh = S.fh, F = S.F, Hh = S.Hh, D = S.img.data, G = S.glo.data;
      var tgt = st === "listening" ? [60, 200, 255] : st === "responding" ? [255, 70, 200] : st === "processing" ? [255, 176, 60] : [110, 130, 255];
      S.tint = mixc(S.tint, tgt, 1 - Math.pow(0.94, dt * 30));
      var proc = st === "processing", talk = st === "listening" || st === "responding";
      // ---- motion ----
      S.spin += dt * (0.35 + 1.6 * lv + (proc ? 2.4 : 0));
      var coreT = proc ? 0.085 + 0.01 * Math.sin(t * 3.1) : 0.068 + 0.03 * lv + 0.012 * f.slow;
      S.core = follow(S.core, coreT, 0.3, 0.12, dt);
      var cx = S.cx + 0.012 * Math.sin(t * 0.7), cy = S.cy + 0.01 * Math.sin(t * 0.9 + 1);
      var balls = [[cx, cy, S.core]];
      for (i = 0; i < S.sats.length; i++) {
        var s = S.sats[i], be = talk ? (f.bands[s.band] + f.bands[s.band + 1]) * 0.5 : 0;
        var oT = proc ? 0.03 + 0.012 * Math.sin(t * 2 + i) : talk ? 0.12 + 0.15 * lv + 0.05 * be : 0.12 + 0.03 * Math.sin(t * 0.45 + i * 1.7);
        s.o = follow(s.o, oT, 0.22, 0.1, dt);
        s.a += dt * s.sp * (0.5 + 1.8 * lv + (proc ? 2.5 : 0));
        var rT = talk ? s.r0 * (0.75 + 0.8 * be) : s.r0 * (0.9 + 0.12 * Math.sin(t * s.ws + s.wob));
        s.r = follow(s.r || rT, rT, 0.3, 0.1, dt);
        s.x = cx + Math.cos(s.a + S.spin * 0.25) * s.o * 1.15 + 0.01 * Math.sin(t * s.ws + s.wob);
        s.y = cy + Math.sin(s.a + S.spin * 0.25) * s.o * 0.62;
        balls.push([s.x, s.y, s.r]);
      }
      if (f.onset && talk && S.drops.length < 10) {
        var nd = f.voice > 0.55 ? 2 : 1;
        for (k = 0; k < nd; k++) {
          var ang = -Math.PI * (0.08 + 0.84 * S.R()), spd = 0.6 + 0.8 * f.voice;
          S.drops.push({ x: cx + Math.cos(ang) * S.core * 0.7, y: cy + Math.sin(ang) * S.core * 0.7, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 0.018 + 0.016 * f.voice, t0: t });
        }
      }
      for (i = S.drops.length - 1; i >= 0; i--) {
        var d = S.drops[i], age = t - d.t0;
        if (age > 3.4) { S.drops.splice(i, 1); continue; }
        var h = dt / 2;
        for (k = 0; k < 2; k++) { d.vx += (-10 * (d.x - cx) - 1.8 * d.vx) * h; d.vy += (-10 * (d.y - cy) - 1.8 * d.vy) * h; d.x += d.vx * h; d.y += d.vy * h; }
        if (d.y > S.floor - d.r) { d.y = S.floor - d.r; d.vy = -Math.abs(d.vy) * 0.3; }
        balls.push([d.x, d.y, d.r * (age > 2.6 ? 1 - (age - 2.6) / 0.8 : 1)]);
      }
      // ---- field: sum of (1 - d^2/R^2)^3 kernels (R = 2.2r, iso-level 0.5 sits at d = r) ----
      F.fill(0); var Rw = S.Rw; Rw.fill(0);
      for (k = 0; k < balls.length; k++) {
        var bx = balls[k][0] * fh, by = balls[k][1] * fh, br = balls[k][2] * fh;
        if (br < 0.4) continue;
        var RR = br * 2.2, R2 = RR * RR, iR2 = 1 / R2;
        var x0 = Math.max(0, Math.floor(bx - RR)), x1 = Math.min(fw - 1, Math.ceil(bx + RR));
        var y0 = Math.max(0, Math.floor(by - RR)), y1 = Math.min(fh - 1, Math.ceil(by + RR));
        for (y = y0; y <= y1; y++) {
          var dy = y - by, dy2 = dy * dy, row = y * fw;
          if (dy2 >= R2) continue;
          for (x = x0; x <= x1; x++) { var dx = x - bx, d2 = dx * dx + dy2; if (d2 < R2) { var qq = 1 - d2 * iR2, cc = qq * qq * qq; F[row + x] += cc; Rw[row + x] += cc * br; } }
        }
      }
      // height ~ a sphere of the local (contribution-weighted) radius; it keeps rising where drops merge, so no flat plateaus
      for (i = 0; i < F.length; i++) { var fv = F[i]; Hh[i] = fv > 0.5 ? Math.sqrt(fv - 0.5) * 1.41 * (Rw[i] / fv) : 0; }
      // ---- shade (smooth studio environment map, key light, coloured fresnel rim) ----
      var tr = S.tint[0], tg = S.tint[1], tb = S.tint[2];
      var Lx = -0.45, Ly = -0.62, Lz = 0.64, rimK = 0.55 + 1.5 * lv, glowK = 0.3 + 1.3 * lv + (proc ? 0.3 : 0);
      for (y = 0; y < fh; y++) {
        var rw = y * fw;
        for (x = 0; x < fw; x++) {
          var ii = rw + x, j = ii << 2, fq = F[ii];
          if (fq < 0.3 || x === 0 || y === 0 || x === fw - 1 || y === fh - 1) { D[j + 3] = 0; G[j + 3] = 0; continue; }
          var gx = (F[ii + 1] - F[ii - 1]) * 0.5, gy = (F[ii + fw] - F[ii - fw]) * 0.5, gm = Math.sqrt(gx * gx + gy * gy) + 1e-6;
          var al = (fq - 0.5) / gm + 0.5;
          if (al <= 0) { D[j + 3] = 0; G[j + 3] = 0; continue; }
          if (al > 1) al = 1;
          var hx = (Hh[ii + 1] - Hh[ii - 1]) * 0.5, hy = (Hh[ii + fw] - Hh[ii - fw]) * 0.5;
          var il = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * il, ny = -hy * il, nz = il;
          var rx = 2 * nz * nx, up0 = -2 * nz * ny, rz = 2 * nz * nz - 1, up = up0 + 0.2 - 0.3 * rx * rx;   // camera a little above the horizon: a curved, low horizon line
          var sm = up <= -0.12 ? 0 : up >= 0.12 ? 1 : (up + 0.12) / 0.24; sm = sm * sm * (3 - 2 * sm);
          var sq = up > 0 ? Math.sqrt(up) : 0, gd = up < 0 ? (up < -0.45 ? 1 : -up / 0.45) : 0, ge = 1 - gd, ge2 = ge * ge * 0.55;
          var cr = 8 + 38 * ge + tr * ge2, cg = 9 + 40 * ge + tg * ge2, cb = 12 + 46 * ge + tb * ge2;
          cr += (192 - 172 * sq + tr * 0.14 * sq - cr) * sm; cg += (200 - 178 * sq + tg * 0.14 * sq - cg) * sm; cb += (216 - 186 * sq + tb * 0.14 * sq - cb) * sm;
          var hz = up / 0.05, hb = 64 * Math.exp(-hz * hz); cr += hb; cg += hb; cb += hb;
          var sbx = rx < -0.8 || rx > -0.1 ? 0 : Math.min(1, (rx + 0.8) / 0.22, (-0.1 - rx) / 0.22), sby = up0 < 0.2 || up0 > 0.8 ? 0 : Math.min(1, (up0 - 0.2) / 0.2, (0.8 - up0) / 0.2);
          var sb = sbx * sby * 120; cr += sb; cg += sb; cb += sb;
          var sx2 = (rx - 0.5) / 0.09, stl = up0 < -0.3 || up0 > 0.85 ? 0 : Math.exp(-sx2 * sx2) * 0.7; cr += tr * stl; cg += tg * stl; cb += tb * stl;
          if (rz < -0.15) { var bk = rz < -0.75 ? 1 : (-0.15 - rz) / 0.6; cr += (6 + tr * 0.2 - cr) * bk; cg += (7 + tg * 0.2 - cg) * bk; cb += (10 + tb * 0.2 - cb) * bk; }
          var fr = 1 - nz, fr3 = fr * fr * fr;
          cr += tr * fr3 * rimK; cg += tg * fr3 * rimK; cb += tb * fr3 * rimK;
          var sp = rx * Lx - up0 * Ly + rz * Lz, sv = 0;
          if (sp > 0) { var s2 = sp * sp, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8; sv = s16 * s16 * s8 * 340; }
          D[j] = cr + sv; D[j + 1] = cg + sv; D[j + 2] = cb + sv; D[j + 3] = al * 255;
          var gl = sv * 0.9, rim = fr3 * glowK;
          G[j] = gl + tr * rim; G[j + 1] = gl + tg * rim; G[j + 2] = gl + tb * rim; G[j + 3] = al * 255;
        }
      }
      S.cA.getContext("2d").putImageData(S.img, 0, 0); S.cB.getContext("2d").putImageData(S.glo, 0, 0);
      // ---- composite ----
      var g = r.ctx, tc = S.tint, X = cx * H, Y = cy * H, fyp = S.floor * H;
      g.drawImage(S.bg, 0, 0);
      g.globalCompositeOperation = "lighter";
      var halo = g.createRadialGradient(X, Y, 0, X, Y, H * 0.6);
      halo.addColorStop(0, rgba(tc, 0.1 + 0.22 * lv)); halo.addColorStop(1, rgba(tc, 0));
      g.fillStyle = halo; g.fillRect(0, 0, W, H);
      g.save(); g.translate(X, fyp); g.scale(1, 0.14);
      var pool = g.createRadialGradient(0, 0, 0, 0, 0, H * 0.42); pool.addColorStop(0, rgba(tc, 0.14 + 0.3 * lv)); pool.addColorStop(1, rgba(tc, 0));
      g.fillStyle = pool; g.fillRect(-H * 0.42, -H * 0.42, H * 0.84, H * 0.84); g.restore();
      g.globalCompositeOperation = "source-over";
      g.imageSmoothingEnabled = true;
      g.drawImage(S.cA, 0, 0, W, H);
      r.bloom(S.cB, 0.8 + 0.7 * lv, 0.03, 2);
    }
  });

  /* ---------- Ribbons \u2014 silk-light ribbons that twist and cross; additive colours merge to white ---------- */
  register({
    id: "ribbons", name: "Ribbons", layout: "top", text: "default",
    blurb: "Silky ribbons of light that twist and cross \u2014 colours melt into white where they overlap.",
    init: function (r) {
      var S = r.S, R = rng(8), i;
      S.rb = [];
      for (i = 0; i < 5; i++) S.rb.push({ f: 0.9 + R() * 1.5, sp: 0.7 + R() * 1.0, ph: R() * TAU, ofs: (R() - 0.5) * 0.6, wid: 0.3 + R() * 0.22,
        drift: 0.12 + R() * 0.2, b0: i * 5, b1: i * 5 + 7, amp: 0, tw: R() * TAU });
      S.PA = [[40, 210, 255], [70, 110, 255], [30, 255, 190], [150, 110, 255], [110, 225, 255]];
      S.PB = [[255, 60, 170], [185, 80, 255], [255, 150, 80], [255, 95, 215], [130, 100, 255]];
      S.PC = [[255, 190, 80], [255, 140, 60], [255, 220, 130], [255, 170, 90], [255, 200, 110]];
      S.mix = 0; S.gold = 0; S.dust = []; S.R = R;
      var W = r.w, H = r.h, bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#020308"; g.fillRect(0, 0, W, H);
      var rg = g.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, Math.max(W, H) * 0.6);
      rg.addColorStop(0, "rgba(30,40,80,0.35)"); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      S.bg = bg;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      var sc = r.scene(), g = sc.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.bg, 0, 0);
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, st === "processing" ? 1 : 0, 0.08, 0.05, dt);
      var cy = H * 0.6, N = Math.max(40, Math.min(160, Math.round(W / (9 * u)))), proc = st === "processing";
      // baseline
      g.globalCompositeOperation = "lighter";
      var bl = g.createLinearGradient(0, 0, W, 0), ba = 0.25 + 0.3 * (1 - Math.min(1, lv * 2));
      bl.addColorStop(0, "rgba(160,200,255,0)"); bl.addColorStop(0.5, "rgba(200,225,255," + ba.toFixed(3) + ")"); bl.addColorStop(1, "rgba(160,200,255,0)");
      g.fillStyle = bl; g.fillRect(0, cy - 0.7 * u, W, 1.4 * u);
      var top = new Float32Array(N + 1);
      for (i = 0; i < S.rb.length; i++) {
        var R = S.rb[i], be = 0;
        for (k = R.b0; k < R.b1; k++) be += f.bands[k]; be /= (R.b1 - R.b0);
        var aT = H * (0.01 + (proc ? 0.07 + 0.03 * Math.sin(t * 2.3 + i) : 0) + (st === "idle" ? 0.012 * (1 + Math.sin(t * 0.8 + i)) : 0) + 0.3 * lv * (0.4 + 0.95 * be));
        R.amp = follow(R.amp, aT, 0.35, 0.09, dt);
        R.ph += dt * R.sp * (0.9 + 4.2 * f.slow + (proc ? 2.2 : 0));
        var col = mixc(mixc(S.PA[i], S.PB[i], S.mix), S.PC[i], S.gold);
        var ctr = R.ofs + 0.3 * Math.sin(t * R.drift + i * 1.3), A = R.amp;
        for (k = 0; k <= N; k++) {
          var tt = k / N * 2 - 1, pin = 1 - tt * tt; pin *= pin;
          var e = Math.exp(-Math.pow((tt - ctr) / R.wid, 2)) * pin;
          top[k] = A * e * Math.sin(R.f * tt * Math.PI * 2 + R.ph) * (0.8 + 0.2 * Math.sin(t * 1.7 + k * 0.05 + R.tw));
        }
        g.beginPath(); g.moveTo(0, cy);
        for (k = 0; k <= N; k++) g.lineTo(k / N * W, cy - top[k]);
        for (k = N; k >= 0; k--) g.lineTo(k / N * W, cy + top[k] * 0.86);
        g.closePath();
        var span = Math.max(4, A * 1.05), gr = g.createLinearGradient(0, cy - span, 0, cy + span);
        gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.3, rgba(col, 0.22)); gr.addColorStop(0.5, rgba(col, 0.46));
        gr.addColorStop(0.7, rgba(col, 0.22)); gr.addColorStop(1, rgba(col, 0));
        g.fillStyle = gr; g.fill();
        g.lineWidth = 1.5 * u; g.strokeStyle = rgba(mixc(col, [255, 255, 255], 0.3), 0.6 + 0.3 * lv);
        g.beginPath(); for (k = 0; k <= N; k++) { var px = k / N * W; if (k) g.lineTo(px, cy - top[k]); else g.moveTo(px, cy - top[k]); } g.stroke();
        if ((f.onset || (lv > 0.5 && S.R() < 0.25)) && S.dust.length < 220) {
          for (var q = 0; q < (f.onset ? 5 : 1); q++) {
            var kk = Math.max(0, Math.min(N, Math.round((ctr * 0.5 + 0.5 + (S.R() - 0.5) * R.wid * 0.8) * N)));
            S.dust.push({ x: kk / N * W, y: cy - top[kk] * S.R(), vx: (S.R() - 0.5) * 40 * u, vy: -(30 + 90 * S.R()) * u * (0.5 + lv), life: 1.2 + S.R() * 1.4, age: 0, c: col, s: (1 + S.R() * 2) * u });
          }
        }
      }
      for (i = S.dust.length - 1; i >= 0; i--) {
        var d = S.dust[i]; d.age += dt;
        if (d.age > d.life) { S.dust.splice(i, 1); continue; }
        d.x += d.vx * dt; d.y += d.vy * dt; d.vy *= 0.985;
        var a = Math.sin(Math.PI * d.age / d.life) * 0.9;
        g.fillStyle = rgba(mixc(d.c, [255, 255, 255], 0.5), a); g.fillRect(d.x, d.y, d.s, d.s);
      }
      g.globalCompositeOperation = "source-over";
      r.present(sc, 0.45 + 0.35 * lv, 0.022, 2);
    }
  });

  /* ---------- Galaxy \u2014 a tilted spiral that spins up with your voice; syllables send shockwaves through the arms ---------- */
  register({
    id: "galaxy", name: "Galaxy", layout: "left", text: "default",
    blurb: "A spiral galaxy that spins up as you talk \u2014 every syllable sends a shockwave rippling through its arms.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(77), n = Math.round(2600 * (r.thumb ? 0.5 : 1)), i;
      S.cx = W * 0.66; S.cy = H * 0.5; S.Rg = Math.min(W * 0.29, H * 0.58);
      S.n = n; S.pr = new Float32Array(n); S.pt = new Float32Array(n); S.pz = new Float32Array(n); S.ps = new Float32Array(n); S.pc = new Uint8Array(n); S.pb = new Float32Array(n);
      for (i = 0; i < n; i++) {
        var k = R(), rr, th, z, c, b = 0.35 + R() * 0.65, sz = 0.8 + R() * R() * 1.8;
        if (k < 0.17) { rr = Math.abs(gauss(R)) * 0.09; th = R() * TAU; z = gauss(R) * 0.05; c = 0; b = 0.6 + R() * 0.4; }          // bulge
        else if (k < 0.8) {                                                                                                        // two log-spiral arms
          rr = Math.min(1.05, 0.07 - Math.log(1 - R() * 0.97) * 0.27); var arm = (R() < 0.5 ? 0 : Math.PI);
          th = arm + 2.75 * Math.log(rr / 0.07) + gauss(R) * (0.1 + 0.08 * (1 - rr)); z = gauss(R) * 0.015;
          c = R() < 0.12 ? 3 : R() < 0.55 ? 1 : R() < 0.8 ? 2 : 4; b = 0.55 + R() * 0.45; sz *= 1.15;
        } else { rr = 0.1 + R() * 0.95; th = R() * TAU; z = gauss(R) * 0.05; c = R() < 0.6 ? 1 : 4; b = 0.2 + R() * 0.35; sz *= 0.8; }   // faint disc
        S.pr[i] = rr; S.pt[i] = th; S.pz[i] = z; S.ps[i] = sz * u; S.pc[i] = c; S.pb[i] = b;
      }
      S.rot = 0; S.tilt = 1.08; S.roll = -0.38; S.rings = []; S.mix = 0; S.gold = 0;
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), R2 = rng(4);
      g.fillStyle = "#010207"; g.fillRect(0, 0, W, H);
      var neb = [[0.3, 0.3, [40, 60, 140]], [0.8, 0.75, [110, 40, 120]], [0.55, 0.15, [30, 90, 130]]];
      neb.forEach(function (q) { var gx = g.createRadialGradient(q[0] * W, q[1] * H, 0, q[0] * W, q[1] * H, H * 0.6); gx.addColorStop(0, rgba(q[2], 0.16)); gx.addColorStop(1, rgba(q[2], 0)); g.fillStyle = gx; g.fillRect(0, 0, W, H); });
      for (i = 0; i < 420; i++) { var b = 0.2 + R2() * R2() * 0.8; g.fillStyle = "rgba(220,230,255," + b.toFixed(3) + ")"; var s = (0.5 + R2() * 1.1) * u; g.fillRect(R2() * W, R2() * H, s, s); }
      S.bg = bg;
      S.PA = [[255, 236, 210], [160, 196, 255], [110, 225, 255], [255, 120, 200], [150, 130, 255]];
      S.PB = [[255, 225, 235], [255, 150, 210], [220, 120, 255], [255, 90, 160], [255, 170, 120]];
      S.PG = [[255, 235, 190], [255, 205, 130], [255, 180, 90], [255, 150, 90], [255, 220, 160]];
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.06, 0.06, dt);
      S.gold = follow(S.gold, st === "processing" ? 1 : 0, 0.08, 0.05, dt);
      S.rot += dt * (0.05 + 0.75 * lv + (st === "processing" ? 0.9 : 0));
      if (f.onset && S.rings.length < 3) S.rings.push({ t0: t, a: 0.05 + 0.08 * f.voice });
      S.rings = S.rings.filter(function (q) { return t - q.t0 < 1.6; });
      var acc = r.buf("gacc", W, H), a = acc.getContext("2d");
      a.globalCompositeOperation = "source-over"; a.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.72, dt * 30)).toFixed(3) + ")"; a.fillRect(0, 0, W, H);
      a.globalCompositeOperation = "lighter";
      var cT = Math.cos(S.tilt), sT = Math.sin(S.tilt), cR = Math.cos(S.roll), sR = Math.sin(S.roll), Rg = S.Rg * (1 + 0.05 * f.slow), cx = S.cx, cy = S.cy;
      var cols = []; for (k = 0; k < 5; k++) cols.push(mixc(mixc(S.PA[k], S.PB[k], S.mix), S.PG[k], S.gold));
      var paths = []; for (k = 0; k < 15; k++) paths.push(new Path2D());
      var rings = S.rings, nr = rings.length, rot = S.rot, tw = 0.06 * Math.sin(t * 0.6) + 0.05 * lv;
      for (i = 0; i < S.n; i++) {
        var rr = S.pr[i], dr = 0, br = 0;
        for (k = 0; k < nr; k++) { var q = rings[k], age = t - q.t0, rad = age * 0.62, ex = (rr - rad) / 0.07, w = Math.exp(-ex * ex) * Math.exp(-age * 1.4); dr += q.a * w; br += w; }
        var R1 = rr + dr, th = S.pt[i] + rot + tw / (0.3 + rr);                  // rigid spin (arms never wind up) + a gentle breathing twist
        var x = R1 * Math.cos(th), y = R1 * Math.sin(th), z = S.pz[i];
        var Y = y * cT - z * sT, sx = x * cR - Y * sR, sy = x * sR + Y * cR;
        var px = cx + sx * Rg, py = cy + sy * Rg, bb = S.pb[i] * (0.7 + 0.6 * lv) + br * 1.2;
        var lvl = bb > 0.95 ? 2 : bb > 0.55 ? 1 : 0, sz = S.ps[i] * (1 + 0.5 * br);
        paths[S.pc[i] * 3 + lvl].rect(px, py, sz, sz);
      }
      var al = [0.35, 0.7, 1];
      for (k = 0; k < 15; k++) { a.fillStyle = rgba(cols[(k / 3) | 0], al[k % 3]); a.fill(paths[k]); }
      for (k = 0; k < nr; k++) {
        var qq = rings[k], ag = t - qq.t0, rd = ag * 0.62 * Rg, fa = Math.exp(-ag * 2.6) * 0.32;
        if (rd < 2) continue;
        a.save(); a.translate(cx, cy); a.rotate(S.roll); a.scale(1, cT);
        a.strokeStyle = rgba(cols[2], fa); a.lineWidth = (2.5 / Math.max(0.3, cT)) * u; a.beginPath(); a.arc(0, 0, rd, 0, TAU); a.stroke(); a.restore();
      }
      var g = r.ctx;
      g.drawImage(S.bg, 0, 0);
      g.globalCompositeOperation = "lighter"; g.drawImage(acc, 0, 0);
      var cr = Rg * (0.13 + 0.08 * lv + (st === "processing" ? 0.04 * (1 + Math.sin(t * 4)) : 0)), core = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
      core.addColorStop(0, "rgba(255,255,255," + (0.42 + 0.35 * lv).toFixed(3) + ")"); core.addColorStop(0.25, rgba(cols[0], 0.3 + 0.25 * lv)); core.addColorStop(1, rgba(cols[0], 0));
      g.fillStyle = core; g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
      g.globalCompositeOperation = "source-over";
      r.bloom(acc, 0.75 + 0.6 * lv, 0.03, 2);
    }
  });

  /* ---------- Halo \u2014 72 mirrored spectrum bars round a ring, with a zoom-feedback tunnel; syllables flash the ring ---------- */
  register({
    id: "halo", name: "Halo", layout: "bottom", text: "default",
    blurb: "A ring of mirrored spectrum bars that tunnels into light \u2014 each syllable flashes a shockwave outward.",
    init: function (r) {
      var S = r.S; S.fa = 0; S.mix = 0; S.gold = 0; S.shocks = []; S.sparks = []; S.R = rng(19); S.len = new Float32Array(72); S.spin = 0;
      S.A = [[60, 225, 255], [80, 130, 255], [160, 100, 255]];
      S.B = [[255, 80, 190], [255, 120, 120], [255, 190, 110]];
      S.C = [[255, 210, 120], [255, 170, 80], [255, 140, 60]];
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i;
      var proc = st === "processing", talk = st === "listening" || st === "responding";
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      S.spin += dt * (0.08 + 0.5 * lv);
      var cx = W / 2, cy = H * 0.43, R0 = H * (0.155 + 0.02 * f.slow), bw = Math.round(W / 2), bh = Math.round(H / 2);
      function pal(p) {                                       // p 0..1 top->bottom
        var j = p * 2, k = Math.min(1, j | 0), fr = j - k;
        var a = mixc(S.A[k], S.A[k + 1], fr), b = mixc(S.B[k], S.B[k + 1], fr), c = mixc(S.C[k], S.C[k + 1], fr);
        return mixc(mixc(a, b, S.mix), c, S.gold);
      }
      for (i = 0; i < 72; i++) {
        var kk = i < 36 ? i : 71 - i, bi = kk / 35 * 27, b0 = bi | 0, bf = bi - b0, bv = f.bands[b0] * (1 - bf) + f.bands[Math.min(31, b0 + 1)] * bf, L;
        if (talk) L = 0.01 + 0.15 * bv * bv * (0.5 + 0.8 * lv);
        else if (proc) L = 0.018 + 0.05 * Math.pow(0.5 + 0.5 * Math.sin(i / 72 * TAU * 3 - t * 5), 3);
        else L = 0.01 + 0.008 * (1 + Math.sin(t * 1.3 + kk * 0.4));
        S.len[i] = follow(S.len[i], L * H, 0.55, 0.16, dt);
      }
      if (f.onset && S.shocks.length < 5) S.shocks.push({ t0: t, a: 0.4 + 0.6 * f.voice });
      S.shocks = S.shocks.filter(function (q) { return t - q.t0 < 0.9; });
      // ---- feedback tunnel (half res) ----
      var A = r.buf("hA", bw, bh), B = r.buf("hB", bw, bh), ac = A.getContext("2d"), bc = B.getContext("2d");
      bc.globalCompositeOperation = "source-over"; bc.globalAlpha = 1; bc.clearRect(0, 0, bw, bh);
      bc.save(); bc.globalAlpha = Math.pow(0.8, dt * 30); bc.translate(bw / 2, bh * 0.43); bc.scale(1.035, 1.035); bc.rotate(0.006 + 0.02 * lv); bc.translate(-bw / 2, -bh * 0.43);
      bc.drawImage(A, 0, 0); bc.restore();
      function bars(c, s, wid, alpha) {
        c.lineCap = "round"; c.lineWidth = wid;
        for (var q = 0; q < 72; q++) {
          var an = -Math.PI / 2 + q / 72 * TAU + S.spin * 0.15, co = Math.cos(an), si = Math.sin(an), L2 = S.len[q] * s, r0 = R0 * s;
          c.strokeStyle = rgba(pal((q < 36 ? q : 72 - q) / 36), alpha);
          c.beginPath(); c.moveTo(cx * s + co * (r0 - L2 * 0.35), cy * s + si * (r0 - L2 * 0.35)); c.lineTo(cx * s + co * (r0 + 4 * u * s + L2), cy * s + si * (r0 + 4 * u * s + L2)); c.stroke();
        }
      }
      bc.globalCompositeOperation = "lighter";
      bars(bc, 0.5, Math.max(1, TAU * R0 * 0.5 / 72 * 0.34), 0.3);
      for (i = 0; i < S.shocks.length; i++) {
        var sq = S.shocks[i], ag = (t - sq.t0) / 0.9, rr = (R0 + ag * H * 0.3) * 0.5;
        bc.strokeStyle = rgba(pal(0.2), sq.a * (1 - ag) * 0.9); bc.lineWidth = (3 + 5 * (1 - ag)) * u * 0.5; bc.beginPath(); bc.arc(cx * 0.5, cy * 0.5, rr, 0, TAU); bc.stroke();
      }
      if (talk && lv > 0.25 && S.sparks.length < 160) {
        for (i = 0; i < 3; i++) {
          var q2 = (S.R() * 72) | 0, an2 = -Math.PI / 2 + q2 / 72 * TAU + S.spin * 0.15, rad = R0 + S.len[q2];
          S.sparks.push({ x: cx + Math.cos(an2) * rad, y: cy + Math.sin(an2) * rad, vx: Math.cos(an2) * (90 + 160 * lv) * u, vy: Math.sin(an2) * (90 + 160 * lv) * u, age: 0, life: 0.6 + S.R() * 0.6, c: pal((q2 < 36 ? q2 : 72 - q2) / 36) });
        }
      }
      for (i = S.sparks.length - 1; i >= 0; i--) {
        var sp = S.sparks[i]; sp.age += dt; if (sp.age > sp.life) { S.sparks.splice(i, 1); continue; }
        sp.x += sp.vx * dt; sp.y += sp.vy * dt;
        bc.fillStyle = rgba(sp.c, 0.9 * (1 - sp.age / sp.life)); bc.fillRect(sp.x * 0.5 - 1, sp.y * 0.5 - 1, 2, 2);
      }
      bc.globalCompositeOperation = "source-over";
      r.bufs.hA = B; r.bufs.hB = A;                          // ping-pong: B holds the newest frame
      // ---- screen ----
      var g = r.ctx;
      g.fillStyle = "#03040a"; g.fillRect(0, 0, W, H);
      var amb = g.createRadialGradient(cx, cy, 0, cx, cy, H * 0.7), pc = pal(0.3);
      amb.addColorStop(0, rgba(pc, 0.08 + 0.12 * lv)); amb.addColorStop(1, rgba(pc, 0)); g.fillStyle = amb; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true; g.drawImage(B, 0, 0, W, H);
      bars(g, 1, Math.max(1.5, TAU * R0 / 72 * 0.36), 0.8);
      var ring = 0; for (i = 0; i < S.shocks.length; i++) ring = Math.max(ring, (1 - (t - S.shocks[i].t0) / 0.9) * S.shocks[i].a);
      g.strokeStyle = rgba(mixc(pal(0.1), [255, 255, 255], 0.55), 0.55 + 0.35 * lv + 0.3 * ring); g.lineWidth = (2 + 3 * lv + 4 * ring) * u;
      g.beginPath(); g.arc(cx, cy, R0 - 6 * u, 0, TAU); g.stroke();
      g.globalCompositeOperation = "source-over";
      var inner = g.createRadialGradient(cx, cy, 0, cx, cy, R0 - 8 * u); inner.addColorStop(0, "rgba(4,6,14,0.94)"); inner.addColorStop(0.8, "rgba(6,8,18,0.9)"); inner.addColorStop(1, "rgba(10,14,30,0.6)");
      g.fillStyle = inner; g.beginPath(); g.arc(cx, cy, R0 - 8 * u, 0, TAU); g.fill();
      g.globalCompositeOperation = "lighter";
      if (S.gold > 0.02) {
        for (i = 0; i < 3; i++) {
          var rad2 = (R0 - 8 * u) * (0.78 - i * 0.14), a0 = t * (2.2 + i * 1.1) * (i % 2 ? -1 : 1);
          g.strokeStyle = rgba(S.C[i], 0.75 * S.gold); g.lineWidth = (3 - i * 0.6) * u; g.lineCap = "round";
          g.beginPath(); g.arc(cx, cy, rad2, a0, a0 + 1.1 + 0.5 * Math.sin(t * 2 + i)); g.stroke();
        }
      }
      var cg = g.createRadialGradient(cx, cy, 0, cx, cy, R0 * 0.55); cg.addColorStop(0, rgba(pal(0.5), 0.1 + 0.3 * lv + 0.2 * ring)); cg.addColorStop(1, rgba(pal(0.5), 0));
      g.fillStyle = cg; g.fillRect(cx - R0, cy - R0, R0 * 2, R0 * 2);
      g.globalCompositeOperation = "source-over";
      r.bloom(B, 0.5 + 0.35 * lv, 0.02, 2);
    }
  });

  /* ---------- Pulsar \u2014 the "Unknown Pleasures" plot, live: a new ridge of your voice rolls in every 55 ms ----------
     Lines are drawn back-to-front; each fills black beneath its own curve (hidden-line removal), then strokes. */
  register({
    id: "pulsar", name: "Pulsar", layout: "bottom", text: "default", hiDpi: true,
    blurb: "The famous pulsar plot, alive \u2014 a fresh ridge of your voice rolls in every 55 milliseconds.",
    init: function (r) {
      var S = r.S, i, k; S.N = 54; S.P = 80; S.lines = []; S.seed = []; S.acc = 0; S.iv = 0.055; S.R = rng(3); S.n = 0;
      for (i = 0; i < S.N; i++) { S.lines.push(new Float32Array(S.P)); S.seed.push(i * 7.13); }
      S.live = new Float32Array(S.P);
      for (i = 0; i < S.N; i++) this.fill(S, S.lines[i], null, i * 7.13, 0, 0, i * 0.055);
    },
    fill: function (S, arr, f, seed, voice, lv, t) {
      for (var k = 0; k < S.P; k++) {
        var xn = k / (S.P - 1), w = Math.exp(-Math.pow((xn - 0.5) / 0.2, 4)), bi = clamp((xn - 0.24) / 0.52, 0, 1) * 26;
        var b0 = bi | 0, bf = bi - b0, bv = f ? f.bands[b0] * (1 - bf) + f.bands[Math.min(31, b0 + 1)] * bf : 0;
        var tex = noise2(k * 0.55, seed) - 0.5, hill = noise2(k * 0.13 + 3, seed * 0.37);
        arr[k] = Math.max(0, w * (0.12 + 0.22 * hill + 0.08 * tex + (bv * 1.25 + 0.22 * tex * voice) * (0.25 + 1.05 * lv)) + 0.018 * tex + 0.01);
      }
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, dt = f.dt, st = f.state, lv = f.level, i, k;
      S.acc += dt;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      var vl = talk ? f.voice : proc ? 0.18 + 0.12 * Math.sin(f.t * 6) : 0.02, ll = talk ? lv : proc ? 0.35 : 0.05;
      while (S.acc >= S.iv) {
        S.acc -= S.iv; S.n++;
        var old = S.lines.shift(); this.fill(S, old, talk ? f : null, S.n * 7.13, vl, ll, f.t); S.lines.push(old);
      }
      this.fill(S, S.live, talk ? f : null, (S.n + 1) * 7.13, vl, ll, f.t);
      var fr = S.acc / S.iv, sc = r.scene(), g = sc.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      var pw = Math.min(W * 0.5, H * 0.95), x0 = (W - pw) / 2, top = H * 0.13, gap = (H * 0.6) / S.N, A = gap * 7.5 * (proc ? 0.8 : 1);
      var tint = st === "responding" ? [255, 150, 200] : st === "listening" ? [140, 220, 255] : proc ? [255, 205, 130] : [235, 235, 235];
      g.lineJoin = "round"; g.lineWidth = Math.max(1, 1.25 * u);
      for (i = 0; i <= S.N; i++) {
        var arr = i < S.N ? S.lines[i] : S.live, y = top + (i + 1 - fr) * gap, alpha = 1;
        if (i === 0) alpha = 1 - fr;
        if (i === S.N) alpha = Math.min(1, fr * 3 + 0.25);
        g.beginPath(); g.moveTo(x0, y);
        for (k = 0; k < S.P; k++) g.lineTo(x0 + k / (S.P - 1) * pw, y - arr[k] * A);
        g.lineTo(x0 + pw, y);
        g.fillStyle = "#000"; g.globalAlpha = 1; g.fill();
        var near = i / S.N, c = mixc([236, 236, 236], tint, Math.pow(near, 5));
        g.strokeStyle = rgba(c, alpha * (0.8 + 0.2 * near)); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = "rgba(200,200,200,0.34)"; g.font = "600 " + (10 * u).toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; g.textAlign = "right"; g.textBaseline = "top";
      g.fillText("PSR B1919+21  \u00b7  " + ASSIST_LABEL(), x0 + pw, top - 34 * u + gap);
      r.present(sc, 0.22 + 0.25 * lv, 0.012, 2);
    }
  });

  /* ---------- Phosphor \u2014 a green P31 oscilloscope: your voice as a Y-T trace, the assistant's as X-Y Lissajous figures ----------
     Beam brightness is inverse to beam speed (slow parts burn bright), with phosphor persistence and a graticule. */
  register({
    id: "phosphor", name: "Phosphor", layout: "bottom", text: "terminal",
    blurb: "A vintage green-phosphor oscilloscope \u2014 your voice as a live trace, the assistant's as spinning Lissajous figures.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, i;
      var sh = Math.min(H * 0.55, W * 0.62 * 0.8), sw = sh * 1.25; S.sw = sw; S.sh = sh; S.sx = (W - sw) / 2; S.sy = H * 0.055; S.cr = 18 * u;
      S.ph = 0; S.mode = 0;
      var sx = S.sx, sy = S.sy;
      // housing
      var hs = mkCanvas(W, H), g = hs.getContext("2d");
      var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1b1d1f"); bg.addColorStop(1, "#0c0d0e"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      var R = rng(2); for (i = 0; i < 1800; i++) { g.fillStyle = "rgba(255,255,255," + (R() * 0.025).toFixed(3) + ")"; g.fillRect(R() * W, R() * H, u, u); }
      g.save(); g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 24 * u; roundRect(g, sx - 26 * u, sy - 26 * u, sw + 52 * u, sh + 52 * u, 30 * u);
      var bz = g.createLinearGradient(0, sy - 26 * u, 0, sy + sh + 26 * u); bz.addColorStop(0, "#2a2d30"); bz.addColorStop(1, "#131416"); g.fillStyle = bz; g.fill(); g.restore();
      roundRect(g, sx - 6 * u, sy - 6 * u, sw + 12 * u, sh + 12 * u, S.cr + 6 * u); g.fillStyle = "#050606"; g.fill();
      g.fillStyle = "#7d8a80"; g.font = "700 " + (11 * u).toFixed(1) + "px 'Courier New',monospace"; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(ASSIST_LABEL() + "\u00b7SCOPE  LS-1919", sx - 10 * u, sy + sh + 44 * u);
      g.textAlign = "right"; var ly = sy + sh + 44 * u, x2 = sx + sw + 10 * u, w2 = g.measureText("CH2 " + ASSIST_LABEL()).width;
      g.fillText("CH2 " + ASSIST_LABEL(), x2, ly); var l2 = x2 - w2 - 12 * u, x1 = l2 - 26 * u, w1 = g.measureText("CH1 MIC").width;
      g.fillText("CH1 MIC", x1, ly); S.lamps = [x1 - w1 - 12 * u, l2]; S.ly = ly;
      S.house = hs;
      // screen base
      var sc = mkCanvas(sw, sh), q = sc.getContext("2d"), vg = q.createRadialGradient(sw / 2, sh / 2, 0, sw / 2, sh / 2, sw * 0.62);
      vg.addColorStop(0, "#07130c"); vg.addColorStop(0.7, "#040b07"); vg.addColorStop(1, "#010302"); q.fillStyle = vg; q.fillRect(0, 0, sw, sh); S.scr = sc;
      // graticule + scanlines + glass
      var gr = mkCanvas(sw, sh), c = gr.getContext("2d"), dx = sw / 10, dy = sh / 8;
      c.strokeStyle = "rgba(120,200,150,0.22)"; c.lineWidth = Math.max(1, 0.9 * u);
      for (i = 1; i < 10; i++) { c.beginPath(); c.moveTo(i * dx, 0); c.lineTo(i * dx, sh); c.stroke(); }
      for (i = 1; i < 8; i++) { c.beginPath(); c.moveTo(0, i * dy); c.lineTo(sw, i * dy); c.stroke(); }
      c.strokeStyle = "rgba(120,200,150,0.3)";
      for (i = 1; i < 50; i++) { var tx = i * sw / 50; c.beginPath(); c.moveTo(tx, sh / 2 - 3 * u); c.lineTo(tx, sh / 2 + 3 * u); c.stroke(); }
      for (i = 1; i < 40; i++) { var ty = i * sh / 40; c.beginPath(); c.moveTo(sw / 2 - 3 * u, ty); c.lineTo(sw / 2 + 3 * u, ty); c.stroke(); }
      c.fillStyle = "rgba(0,0,0,0.16)"; for (var y = 0; y < sh; y += 3) c.fillRect(0, y, sw, 1);
      var gl = c.createLinearGradient(0, 0, sw * 0.6, sh); gl.addColorStop(0, "rgba(255,255,255,0.07)"); gl.addColorStop(0.4, "rgba(255,255,255,0.015)"); gl.addColorStop(0.41, "rgba(255,255,255,0)");
      c.fillStyle = gl; c.fillRect(0, 0, sw, sh);
      var ed = c.createRadialGradient(sw / 2, sh / 2, sh * 0.35, sw / 2, sh / 2, sw * 0.7); ed.addColorStop(0, "rgba(0,0,0,0)"); ed.addColorStop(1, "rgba(0,0,0,0.55)");
      c.fillStyle = ed; c.fillRect(0, 0, sw, sh);
      S.grat = gr;
      S.xs = new Float32Array(300); S.ys = new Float32Array(300);
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, n = 0;
      var sw = S.sw, sh = S.sh, P = r.buf("phos", sw, sh), p = P.getContext("2d");
      p.globalCompositeOperation = "destination-out"; p.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.7, dt * 30)).toFixed(3) + ")"; p.fillRect(0, 0, sw, sh);
      p.globalCompositeOperation = "lighter";
      var wv = f.wave, xs = S.xs, ys = S.ys, midY = sh / 2, midX = sw / 2;
      if (st === "listening") {                                   // Y-T, triggered on a rising zero crossing like a real scope
        var trig = 0, best = 0;
        for (i = 0; i < 90; i++) { var sl = wv[i + 1] - wv[i]; if (wv[i] <= 0 && wv[i + 1] > 0 && sl > best) { best = sl; trig = i; } }
        for (i = 0; i < 160; i++) { xs[n] = i / 159 * sw; ys[n] = midY - Math.tanh(wv[trig + i] * 2.2) * sh * 0.36; n++; }
      } else if (st === "responding") {                           // X-Y: sample vs quarter-window delay, slowly rotating
        var rot = t * 0.35, cr = Math.cos(rot), sr = Math.sin(rot), gn = 3.2;
        for (i = 0; i < 256; i++) {
          var a = Math.tanh(wv[i] * gn), b = Math.tanh(wv[(i + 37) & 255] * gn);
          xs[n] = midX + (a * cr - b * sr) * sh * 0.4; ys[n] = midY - (a * sr + b * cr) * sh * 0.4; n++;
        }
      } else if (st === "processing") {                           // 3:2 Lissajous knot turning over
        var ph = t * 1.6;
        for (i = 0; i < 300; i++) { var s = i / 299 * TAU; xs[n] = midX + Math.sin(3 * s + ph) * sh * 0.36; ys[n] = midY - Math.sin(2 * s) * sh * 0.3; n++; }
      } else {                                                    // idle: a resting baseline with a little noise
        for (i = 0; i < 128; i++) { xs[n] = i / 127 * sw; ys[n] = midY + (noise1(i * 0.9 + t * 20) - 0.5) * 2.4 * u; n++; }
      }
      var buckets = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()], k0 = 2.2 * u;
      for (i = 1; i < n; i++) {
        var dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1], len = Math.sqrt(dx * dx + dy * dy), inten = k0 / (len + 0.5);
        var bk = inten > 0.9 ? 4 : inten > 0.5 ? 3 : inten > 0.25 ? 2 : inten > 0.1 ? 1 : 0;
        buckets[bk].moveTo(xs[i - 1], ys[i - 1]); buckets[bk].lineTo(xs[i], ys[i]);
      }
      var al = [0.22, 0.4, 0.62, 0.85, 1], boost = 0.75 + 0.35 * lv;
      p.lineCap = "round"; p.lineJoin = "round";
      for (i = 0; i < 5; i++) {
        p.lineWidth = (1.8 + i * 0.25) * u; p.strokeStyle = rgba(i > 3 ? [190, 255, 215] : [90, 255, 150], Math.min(1, al[i] * boost)); p.stroke(buckets[i]);
      }
      var g = r.ctx, sx = S.sx, sy = S.sy;
      g.drawImage(S.house, 0, 0);
      g.save(); roundRect(g, sx, sy, sw, sh, S.cr); g.clip();
      g.drawImage(S.scr, sx, sy);
      g.globalCompositeOperation = "lighter"; g.drawImage(P, sx, sy);
      g.globalCompositeOperation = "source-over"; g.drawImage(S.grat, sx, sy);
      g.restore();
      var bl = r.buf("phb", W, H), bc = bl.getContext("2d");
      bc.clearRect(0, 0, W, H); bc.drawImage(P, sx, sy);
      r.bloom(bl, 1.0 + 0.5 * lv, 0.022, 2);
      var lamps = [[S.lamps[0], st === "listening"], [S.lamps[1], st === "responding"]];
      lamps.forEach(function (L) {
        var lx = L[0], ly = S.ly, on = L[1], rr = 4 * u, lg = g.createRadialGradient(lx, ly, 0, lx, ly, on ? rr * 4 : rr);
        lg.addColorStop(0, on ? "rgba(170,255,200,1)" : "rgba(40,70,50,1)"); lg.addColorStop(on ? 0.25 : 1, on ? "rgba(80,255,140,0.8)" : "rgba(20,40,28,1)"); if (on) lg.addColorStop(1, "rgba(80,255,140,0)");
        g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, on ? rr * 4 : rr, 0, TAU); g.fill();
      });
    }
  });

  /* ---------- Tesla \u2014 a plasma globe: filaments crawl to the glass, multiply with your voice and crackle on syllables ---------- */
  register({
    id: "tesla", name: "Tesla", layout: "bottom", text: "default",
    blurb: "A plasma globe \u2014 lightning filaments multiply with your voice and crackle on every syllable.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(55), i;
      S.cx = W / 2; S.cy = H * 0.4; S.Rg = H * 0.27; S.R = R; S.fil = []; S.branches = []; S.flash = 0; S.mix = 0; S.gold = 0; S.nf = 5;
      for (i = 0; i < 16; i++) S.fil.push({ lon: R() * TAU, lat: (R() - 0.5) * 2.4, sp: 0.15 + R() * 0.3, seed: R() * 100, on: i < 5 ? 1 : 0 });
      S.px = new Float32Array(65); S.py = new Float32Array(65); S.fx = new Float32Array(65); S.fy = new Float32Array(65);
      var cx = S.cx, cy = S.cy, Rg = S.Rg;
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#030208"; g.fillRect(0, 0, W, H);
      var am = g.createRadialGradient(cx, cy, 0, cx, cy, H * 0.8); am.addColorStop(0, "rgba(60,30,110,0.3)"); am.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = am; g.fillRect(0, 0, W, H);
      // pedestal
      var py = cy + Rg * 0.9, ph = Rg * 0.5, tw = Rg * 0.55, bw = Rg * 0.95;
      g.beginPath(); g.moveTo(cx - tw, py); g.lineTo(cx + tw, py); g.lineTo(cx + bw, py + ph); g.lineTo(cx - bw, py + ph); g.closePath();
      var pg = g.createLinearGradient(cx - bw, 0, cx + bw, 0); pg.addColorStop(0, "#07070a"); pg.addColorStop(0.35, "#1c1b22"); pg.addColorStop(0.55, "#121118"); pg.addColorStop(1, "#050507");
      g.fillStyle = pg; g.fill();
      g.fillStyle = "#0d0c12"; g.save(); g.translate(cx, py + ph); g.scale(1, 0.12); g.beginPath(); g.arc(0, 0, bw, 0, Math.PI); g.fill(); g.restore();
      S.bg = bg; S.pedY = py; S.pedW = tw;
      // glass overlay
      var gl = mkCanvas(W, H), q = gl.getContext("2d");
      var rim = q.createRadialGradient(cx, cy, Rg * 0.86, cx, cy, Rg * 1.01); rim.addColorStop(0, "rgba(180,170,255,0)"); rim.addColorStop(0.85, "rgba(190,180,255,0.16)"); rim.addColorStop(1, "rgba(220,215,255,0.34)");
      q.fillStyle = rim; q.beginPath(); q.arc(cx, cy, Rg, 0, TAU); q.fill();
      q.save(); q.translate(cx - Rg * 0.42, cy - Rg * 0.5); q.rotate(-0.7); q.scale(1, 0.55);
      var hl = q.createRadialGradient(0, 0, 0, 0, 0, Rg * 0.3); hl.addColorStop(0, "rgba(255,255,255,0.42)"); hl.addColorStop(1, "rgba(255,255,255,0)"); q.fillStyle = hl; q.beginPath(); q.arc(0, 0, Rg * 0.3, 0, TAU); q.fill(); q.restore();
      q.strokeStyle = "rgba(230,225,255,0.08)"; q.lineWidth = 2 * u; q.beginPath(); q.arc(cx, cy, Rg * 0.93, 0.3, 1.25); q.stroke();
      S.glass = gl;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      var cx = S.cx, cy = S.cy, Rg = S.Rg, talk = st === "listening" || st === "responding", proc = st === "processing";
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      var nT = talk ? 5 + Math.round(11 * Math.min(1, lv * 1.3)) : proc ? 9 : 5;
      S.nf = nT;
      var cA = mixc([90, 150, 255], [255, 70, 200], S.mix), cB = mixc([150, 100, 255], [180, 90, 255], S.mix);
      cA = mixc(cA, [255, 170, 80], S.gold); cB = mixc(cB, [255, 120, 60], S.gold);
      if (f.onset && talk) {
        S.flash = 1;
        for (k = 0; k < 3 + ((f.voice * 4) | 0); k++) S.branches.push({ t0: t, fi: (S.R() * S.nf) | 0, at: 0.35 + S.R() * 0.5, lon: S.R() * TAU, lat: (S.R() - 0.5) * 2.6, seed: S.R() * 99, len: 0.25 + 0.35 * S.R() });
      }
      S.flash = Math.max(0, S.flash - dt * 4);
      S.branches = S.branches.filter(function (b) { return t - b.t0 < 0.28; });
      var sc = r.scene(), g = sc.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.bg, 0, 0);
      g.globalCompositeOperation = "lighter";
      var hz = g.createRadialGradient(cx, cy, 0, cx, cy, Rg);
      hz.addColorStop(0, rgba(cA, 0.16 + 0.22 * lv + 0.2 * S.flash)); hz.addColorStop(0.6, rgba(cB, 0.06 + 0.1 * lv)); hz.addColorStop(1, rgba(cB, 0.02));
      g.fillStyle = hz; g.beginPath(); g.arc(cx, cy, Rg, 0, TAU); g.fill();
      var px = S.px, py = S.py, rough = 0.2 + 0.12 * lv + 0.1 * S.flash, ends = [];
      function arc(x0, y0, x1, y1, seed, rgh) {
        var n = 64; px[0] = x0; py[0] = y0; px[n] = x1; py[n] = y1;
        for (var step = n; step > 1; step >>= 1) {
          for (var a = 0; a < n; a += step) {
            var b = a + step, m = (a + b) >> 1, dx = px[b] - px[a], dy = py[b] - py[a], L = Math.sqrt(dx * dx + dy * dy);
            var j = (noise1(seed + m * 0.37 + t * (3.5 + 6 * lv)) - 0.5) * 2 + (Math.random() - 0.5) * 0.35;
            px[m] = (px[a] + px[b]) / 2 - dy / (L + 1e-6) * L * rgh * j; py[m] = (py[a] + py[b]) / 2 + dx / (L + 1e-6) * L * rgh * j;
          }
          rgh *= 0.62;
        }
        var p = new Path2D(); p.moveTo(px[0], py[0]); for (var q = 1; q <= n; q++) p.lineTo(px[q], py[q]); return p;
      }
      function stroke(p, bright, width) {
        g.lineCap = "round"; g.lineJoin = "round";
        g.lineWidth = 10 * u * width; g.strokeStyle = rgba(cB, 0.07 * bright); g.stroke(p);
        g.lineWidth = 3.6 * u * width; g.strokeStyle = rgba(cA, 0.32 * bright); g.stroke(p);
        g.lineWidth = 1.3 * u * width; g.strokeStyle = rgba(mixc(cA, [255, 255, 255], 0.7), 0.85 * bright); g.stroke(p);
      }
      var coreR = Rg * 0.075;
      for (i = 0; i < S.fil.length; i++) {
        var F = S.fil[i]; F.on = follow(F.on, i < S.nf ? 1 : 0, 0.25, 0.12, dt);
        if (F.on < 0.03) continue;
        F.lon += dt * F.sp * (0.35 + 1.2 * lv) * (i % 2 ? -1 : 1); var lat = F.lat * 0.5 + 0.35 * Math.sin(t * F.sp + F.seed);
        var vx = Math.cos(lat) * Math.sin(F.lon), vy = Math.sin(lat), vz = Math.cos(lat) * Math.cos(F.lon);
        var ex = cx + vx * Rg * 0.97, ey = cy - vy * Rg * 0.97, bright = F.on * (0.45 + 0.55 * (vz * 0.5 + 0.5)) * (0.7 + 0.5 * lv + 0.6 * S.flash);
        var p = arc(cx + vx * coreR, cy - vy * coreR, ex, ey, F.seed, rough);
        stroke(p, bright, 0.8 + 0.5 * lv);
        ends.push([ex, ey, bright, i]);
        S.fx.set(px); S.fy.set(py);                             // branches grow from this filament's path
        for (k = 0; k < S.branches.length; k++) {
          var B = S.branches[k]; if (B.fi !== i) continue;
          var ai = Math.round(B.at * 64), bx = S.fx[ai], by = S.fy[ai], ag = (t - B.t0) / 0.28;
          var bl = Math.cos(B.lat) * Math.sin(B.lon), bu = Math.sin(B.lat), L2 = Rg * B.len;
          var bp = arc(bx, by, bx + bl * L2, by - bu * L2, B.seed, 0.35);
          stroke(bp, (1 - ag) * 0.9, 0.6);
        }
      }
      for (i = 0; i < ends.length; i++) {
        var e = ends[i], rr = Rg * (0.05 + 0.04 * lv), sg = g.createRadialGradient(e[0], e[1], 0, e[0], e[1], rr);
        sg.addColorStop(0, rgba(mixc(cA, [255, 255, 255], 0.6), 0.8 * e[2])); sg.addColorStop(1, rgba(cA, 0));
        g.fillStyle = sg; g.fillRect(e[0] - rr, e[1] - rr, rr * 2, rr * 2);
      }
      var cr = coreR * (1.1 + 0.5 * lv + 0.9 * S.flash), co = g.createRadialGradient(cx, cy, 0, cx, cy, cr * 2.2);
      co.addColorStop(0, "rgba(255,255,255,0.95)"); co.addColorStop(0.3, rgba(mixc(cA, [255, 255, 255], 0.5), 0.8)); co.addColorStop(1, rgba(cA, 0));
      g.fillStyle = co; g.fillRect(cx - cr * 2.2, cy - cr * 2.2, cr * 4.4, cr * 4.4);
      g.globalCompositeOperation = "source-over"; g.drawImage(S.glass, 0, 0);
      g.globalCompositeOperation = "lighter";
      var rf = g.createRadialGradient(cx, S.pedY, 0, cx, S.pedY, S.pedW * 1.4); rf.addColorStop(0, rgba(cA, 0.18 + 0.25 * lv)); rf.addColorStop(1, rgba(cA, 0));
      g.fillStyle = rf; g.fillRect(cx - S.pedW * 1.4, S.pedY - 4 * u, S.pedW * 2.8, S.pedW * 0.5);
      g.globalCompositeOperation = "source-over";
      r.present(sc, 0.75 + 0.7 * lv + 0.5 * S.flash, 0.025, 2);
    }
  });

  /* ---------- Orb \u2014 a living sphere of 1,500 points: the spectrum sculpts it, syllables ripple across it ---------- */
  register({
    id: "orb", name: "Orb", layout: "bottom", text: "default",
    blurb: "A living sphere of light points \u2014 your voice sculpts its surface and every syllable ripples across it.",
    init: function (r) {
      var S = r.S, R = rng(12), n = r.thumb ? 800 : 1500, i, j;
      S.n = n; S.x = new Float32Array(n); S.y = new Float32Array(n); S.z = new Float32Array(n); S.nz = new Float32Array(n); S.d = new Float32Array(n);
      var ga = Math.PI * (3 - Math.sqrt(5));
      for (i = 0; i < n; i++) {
        var y = 1 - (i + 0.5) / n * 2, rad = Math.sqrt(1 - y * y), th = ga * i;
        S.x[i] = Math.cos(th) * rad; S.y[i] = y; S.z[i] = Math.sin(th) * rad; S.nz[i] = R() * 100;
      }
      // plexus: each point to its 2 nearest neighbours (brute force once)
      var pairs = [], lim = Math.min(n, 1500);
      for (i = 0; i < lim; i++) {
        var b1 = -1, b2 = -1, d1 = 9, d2 = 9;
        for (j = 0; j < lim; j++) {
          if (j === i) continue;
          var dx = S.x[i] - S.x[j], dy = S.y[i] - S.y[j], dz = S.z[i] - S.z[j], dd = dx * dx + dy * dy + dz * dz;
          if (dd < d1) { d2 = d1; b2 = b1; d1 = dd; b1 = j; } else if (dd < d2) { d2 = dd; b2 = j; }
        }
        if (b1 > i) pairs.push(i, b1); if (b2 > i) pairs.push(i, b2);
      }
      S.pairs = pairs;
      S.rn = r.thumb ? 360 : 760; S.ra = new Float32Array(S.rn); S.rr = new Float32Array(S.rn); S.rb = new Float32Array(S.rn);
      for (i = 0; i < S.rn; i++) { S.ra[i] = R() * TAU; S.rr[i] = (R() < 0.7 ? 1.55 : 1.78) + gauss(R) * 0.025; S.rb[i] = 0.3 + R() * 0.7; }
      S.rip = []; S.rot = 0; S.mix = 0; S.gold = 0; S.R = R; S.sx = new Float32Array(n); S.sy = new Float32Array(n); S.sd = new Float32Array(n);
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      S.rot += dt * (0.12 + 0.6 * lv + (proc ? 1.1 : 0));
      if (f.onset && talk && S.rip.length < 5) {
        var a = S.R() * TAU, b = Math.acos(S.R() * 2 - 1);
        S.rip.push({ x: Math.sin(b) * Math.cos(a), y: Math.cos(b), z: Math.sin(b) * Math.sin(a), t0: t, amp: 0.08 + 0.16 * f.voice });
      }
      S.rip = S.rip.filter(function (q) { return t - q.t0 < 1.8; });
      var base = mixc(mixc([70, 200, 255], [255, 80, 190], S.mix), [255, 180, 80], S.gold);
      if (st === "idle") base = mixc(base, [120, 130, 255], 0.5);
      var hot = mixc(base, [255, 255, 255], 0.65);
      var cx = W / 2, cy = H * 0.42, Rs = H * 0.2 * (1 + 0.06 * f.slow), cam = 3.4, foc = 3.4;
      var cr = Math.cos(S.rot), sr = Math.sin(S.rot), tl = 0.38 + 0.1 * Math.sin(t * 0.3), ct = Math.cos(tl), stl = Math.sin(tl);
      var sc = r.scene(), g = sc.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = "#02030a"; g.fillRect(0, 0, W, H);
      var amb = g.createRadialGradient(cx, cy, 0, cx, cy, H * 0.75); amb.addColorStop(0, rgba(base, 0.1 + 0.14 * lv)); amb.addColorStop(1, rgba(base, 0));
      g.fillStyle = amb; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      var cg = g.createRadialGradient(cx, cy, 0, cx, cy, Rs * 0.75); cg.addColorStop(0, rgba(hot, 0.1 + 0.22 * lv)); cg.addColorStop(1, rgba(base, 0));
      g.fillStyle = cg; g.fillRect(cx - Rs, cy - Rs, Rs * 2, Rs * 2);
      var paths = []; for (k = 0; k < 6; k++) paths.push(new Path2D());
      var nr = S.rip.length;
      for (i = 0; i < S.n; i++) {
        var x = S.x[i], y = S.y[i], z = S.z[i];
        var bi = Math.abs(y) * 22, b0 = bi | 0, bv = f.bands[b0] + (f.bands[b0 + 1] - f.bands[b0]) * (bi - b0);
        var disp = talk ? lv * (0.06 + 0.3 * bv) * (0.55 + 0.9 * noise1(S.nz[i] + t * 1.6)) : proc ? 0.05 * Math.sin(y * 9 - t * 5) : 0.02 * Math.sin(t * 1.2 + S.nz[i]);
        for (k = 0; k < nr; k++) {
          var q = S.rip[k], ag = t - q.t0, dot = clamp(x * q.x + y * q.y + z * q.z, -1, 1), ang = Math.acos(dot), ex = (ang - ag * 2.4) / 0.2;
          disp += q.amp * Math.exp(-ex * ex) * Math.exp(-ag * 1.6);
        }
        var s = 1 + disp, X = x * s, Y = y * s, Z = z * s;
        var X1 = X * cr + Z * sr, Z1 = -X * sr + Z * cr, Y1 = Y * ct - Z1 * stl, Z2 = Y * stl + Z1 * ct;
        var p = foc / (cam - Z2), px = cx + X1 * Rs * p, py = cy - Y1 * Rs * p;
        S.sx[i] = px; S.sy[i] = py; S.sd[i] = Z2;
        var br = (0.2 + 0.8 * (Z2 * 0.5 + 0.5)) * (0.65 + 0.7 * lv) + disp * 3, lvl = br > 1.25 ? 5 : br > 1 ? 4 : br > 0.8 ? 3 : br > 0.6 ? 2 : br > 0.42 ? 1 : 0;
        var sz = (1.3 + 1.5 * (Z2 * 0.5 + 0.5)) * u * p;
        paths[lvl].rect(px - sz / 2, py - sz / 2, sz, sz);
      }
      if (lv > 0.08 || proc) {
        var pl = new Path2D(), P = S.pairs;
        for (k = 0; k < P.length; k += 2) { var a1 = P[k], a2 = P[k + 1]; if (S.sd[a1] < 0.1 || S.sd[a2] < 0.1) continue; pl.moveTo(S.sx[a1], S.sy[a1]); pl.lineTo(S.sx[a2], S.sy[a2]); }
        g.lineWidth = 0.7 * u; g.strokeStyle = rgba(base, Math.min(0.5, 0.08 + 0.45 * lv + (proc ? 0.12 : 0))); g.stroke(pl);
      }
      var al = [0.25, 0.4, 0.55, 0.7, 0.85, 1];
      for (k = 0; k < 6; k++) { g.fillStyle = rgba(mixc(base, hot, k / 5), al[k]); g.fill(paths[k]); }
      // ring
      var rp = new Path2D(), rp2 = new Path2D(), rt = S.rot * 1.6, rtl = 0.3 + 0.05 * Math.sin(t * 0.4), crt = Math.cos(rtl), srt = Math.sin(rtl);   // Saturn-like, nearly edge-on
      for (i = 0; i < S.rn; i++) {
        var an = S.ra[i] + rt, bb = f.bands[(i % 24)], rad = S.rr[i] * (1 + (talk ? 0.12 * bb * lv : 0));
        var rx = Math.cos(an) * rad, rz = Math.sin(an) * rad, ry = 0;
        var rX = rx * 0.94 + ry * 0.34, rY = -rx * 0.34 + ry * 0.94, rY2 = rY * crt - rz * srt, rZ2 = rY * srt + rz * crt;
        var pp = foc / (cam - rZ2 * 0.6), qx = cx + rX * Rs * pp, qy = cy - rY2 * Rs * pp, ssz = (0.8 + S.rb[i] * 1.4) * u;
        (S.rb[i] * (0.6 + lv) > 0.7 ? rp : rp2).rect(qx, qy, ssz, ssz);
      }
      g.fillStyle = rgba(hot, 0.95); g.fill(rp); g.fillStyle = rgba(base, 0.7); g.fill(rp2);
      g.globalCompositeOperation = "source-over";
      r.present(sc, 0.6 + 0.45 * lv, 0.02, 2);
    }
  });

  /* ---------- Digital VU \u2014 an LED spectrum analyser: 32 segmented columns, red peak-hold caps, mirrored in a black floor ----------
     LED-meter ballistics: near-instant attack, linear release; peaks hold 0.6 s then fall slowly. Highs get a tilt so every
     column moves with speech (voice energy sits low). */
  register({
    id: "digital-vu", name: "Digital VU", layout: "bottom", text: "default", hiDpi: true,
    blurb: "A glowing LED spectrum analyser \u2014 32 segmented columns with falling red peak caps, mirrored in a black glass floor.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, k;
      S.N = 32; S.SEG = 22;
      S.h = new Float32Array(S.N); S.pk = new Float32Array(S.N); S.pkT = new Float32Array(S.N);
      var areaW = Math.min(W * 0.86, H * 1.95);
      S.x0 = (W - areaW) / 2; S.colW = areaW / S.N;
      S.top = H * 0.1; S.base = H * 0.58; S.segH = (S.base - S.top) / S.SEG;
      function colAt(p) {                                   // bottom -> top: green, lime, yellow, orange, red
        var stops = [[0, [34, 190, 40]], [0.45, [120, 222, 30]], [0.62, [250, 226, 30]], [0.8, [255, 150, 22]], [0.9, [255, 72, 20]], [1, [255, 30, 20]]];
        for (var i = 1; i < stops.length; i++) if (p <= stops[i][0]) return mixc(stops[i - 1][1], stops[i][1], (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
        return stops[stops.length - 1][1];
      }
      S.lit = []; S.dark = [];
      for (k = 0; k < S.SEG; k++) { var c = colAt(k / (S.SEG - 1)); S.lit.push(rgba(c, 1)); S.dark.push(rgba(mixc([0, 0, 0], c, 0.15), 1)); }
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, dt = f.dt, t = f.t, st = f.state, i, k;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      for (i = 0; i < S.N; i++) {
        var target;
        if (talk) {                                         // bands are a 55 dB scale: show the top ~40 dB so speech sits mid-meter
          var bi = i / (S.N - 1) * 30, b0 = bi | 0, bv = f.bands[b0] * (1 - (bi - b0)) + f.bands[Math.min(31, b0 + 1)] * (bi - b0);
          target = clamp((bv - 0.28) / 0.72 * (0.9 + 0.35 * i / (S.N - 1)) * (0.55 + 0.55 * f.level), 0, 1);
        } else if (proc) target = 0.1 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * 3.4 - i * 0.33), 3);   // a scanner sweep while it thinks
        else target = 0.03 + 0.06 * noise1(i * 0.9 + t * 1.4);
        if (target > S.h[i]) S.h[i] += (target - S.h[i]) * (1 - Math.pow(0.2, dt * 30));
        else S.h[i] = Math.max(target, S.h[i] - dt * 1.3);
        if (S.h[i] >= S.pk[i]) { S.pk[i] = S.h[i]; S.pkT[i] = t; }
        else if (t - S.pkT[i] > 0.6) S.pk[i] = Math.max(S.h[i], S.pk[i] - dt * 0.5);
      }
      var bb = r.buf("dvbars", W, H), g = bb.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, W, H);
      var gap = S.colW * 0.2, cw = S.colW - gap, sg = Math.max(1, S.segH * 0.26), shh = S.segH - sg;
      var caps = new Path2D(), n = [], pki = [];
      for (i = 0; i < S.N; i++) { n.push(Math.round(S.h[i] * S.SEG)); pki.push(Math.min(S.SEG - 1, Math.max(0, Math.ceil(S.pk[i] * S.SEG) - 1))); }
      for (k = 0; k < S.SEG; k++) {
        var on = new Path2D(), off = new Path2D(), y = S.base - (k + 1) * S.segH + sg / 2;
        for (i = 0; i < S.N; i++) {
          var x = S.x0 + i * S.colW + gap / 2;
          if (k < n[i]) on.rect(x, y, cw, shh);
          else if (k === pki[i] && S.pk[i] > 0.05) caps.rect(x, y, cw, shh);
          else off.rect(x, y, cw, shh);
        }
        g.fillStyle = S.dark[k]; g.fill(off);
        g.fillStyle = S.lit[k]; g.fill(on);
      }
      g.fillStyle = "#ff2618"; g.fill(caps);
      var sc = r.scene(), s = sc.getContext("2d"), gapY = Math.max(4 * u, S.segH * 0.9), fl = S.base + gapY / 2;
      s.globalCompositeOperation = "source-over"; s.globalAlpha = 1; s.fillStyle = "#000"; s.fillRect(0, 0, W, H);
      // the black-glass floor: a clear mirror image just under the meter that dies away quickly
      s.save(); s.translate(0, 2 * S.base + gapY); s.scale(1, -1); s.globalAlpha = 0.5; s.drawImage(bb, 0, 0); s.restore();
      var fade = s.createLinearGradient(0, fl, 0, fl + (S.base - S.top) * 0.55);
      fade.addColorStop(0, "rgba(0,0,0,0.3)"); fade.addColorStop(1, "rgba(0,0,0,1)");
      s.fillStyle = fade; s.fillRect(0, fl, W, H - fl);
      var edge = s.createLinearGradient(S.x0, 0, S.x0 + S.colW * S.N, 0);  // the glass edge catching the light
      edge.addColorStop(0, "rgba(160,255,170,0)"); edge.addColorStop(0.5, "rgba(160,255,170,0.16)"); edge.addColorStop(1, "rgba(160,255,170,0)");
      s.fillStyle = edge; s.fillRect(S.x0, fl - 0.5 * u, S.colW * S.N, Math.max(1, u));
      s.drawImage(bb, 0, 0);
      r.present(sc, 0.32 + 0.3 * f.level, 0.012, 2);
    }
  });

  /* ---------- Paint Splash \u2014 liquid paint thrown on every syllable: glossy colour blobs that splash, merge and settle ----------
     Same bounded-kernel metaball field as Mercury, but each blob carries a paint colour: colours blend by squared field weight
     (distinct paint with soft seams), shaded as glossy wet paint (diffuse + Blinn highlight + darker creases). Dead blobs leave a
     fading stain behind. Cool paint for your voice, hot paint for the assistant's, a slow swirl while it thinks. */
  register({
    id: "paint-splash", name: "Paint Splash", layout: "left", text: "default",
    blurb: "Liquid paint thrown on every syllable \u2014 glossy splashes that fly, merge and settle: cool colours for you, hot for the assistant.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, i;
      S.fh = Math.round(clamp(H / 2.8 * (r.quality || 1), 60, 320)); S.fw = Math.max(8, Math.round(S.fh * W / H));
      var n = S.fw * S.fh;
      S.F = new Float32Array(n); S.Rw = new Float32Array(n); S.Hh = new Float32Array(n);
      S.Cr = new Float32Array(n); S.Cg = new Float32Array(n); S.Cb = new Float32Array(n); S.Cw = new Float32Array(n);
      S.img = new ImageData(S.fw, S.fh); S.cA = mkCanvas(S.fw, S.fh); S.stain = mkCanvas(S.fw, S.fh);
      S.blobs = []; S.R = rng(71); S.cx = 0.62 * W / H; S.cy = 0.5; S.nextSpray = 0; S.nextIdle = 1.5; S.swirl = 0;
      S.COOL = [[25, 195, 255], [30, 105, 255], [70, 222, 45], [255, 226, 28], [20, 226, 190]];
      S.HOT = [[255, 40, 205], [255, 52, 30], [255, 138, 22], [255, 208, 30], [255, 88, 150]];
      S.THINK = [[150, 70, 255], [255, 190, 40], [255, 120, 210]];
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), rg = g.createRadialGradient(W * 0.62, H * 0.5, 0, W * 0.62, H * 0.5, Math.max(W, H) * 0.75);
      rg.addColorStop(0, "#15151b"); rg.addColorStop(1, "#050507"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      S.bg = bg; S.seeded = false;
    },
    blob: function (x, y, vx, vy, r, c, t, life) { return { x: x, y: y, vx: vx, vy: vy, r: r, r0: r, c: c, t0: t, life: life }; },
    splash: function (S, t, str, cols, x, y) {
      var R = S.R, k, j, base = cols[(R() * cols.length) | 0];
      S.blobs.push(this.blob(x, y, (R() - 0.5) * 0.08, (R() - 0.5) * 0.08, 0.035 + 0.045 * str, base, t, 6 + 4 * R()));
      var arms = 3 + ((R() * 4) | 0);
      for (k = 0; k < arms; k++) {                                     // splash arms: chains of shrinking blobs thrown outward
        var th = R() * TAU, sp = (0.3 + 0.8 * str) * (0.6 + 0.8 * R()), c = R() < 0.65 ? base : cols[(R() * cols.length) | 0], seg = 3 + ((R() * 4) | 0);
        for (j = 0; j < seg; j++) {
          var fr = (j + 1) / seg, rr = (0.03 - 0.019 * fr) * (0.7 + 0.8 * str);
          S.blobs.push(this.blob(x + Math.cos(th) * 0.012 * j, y + Math.sin(th) * 0.012 * j, Math.cos(th) * sp * fr, Math.sin(th) * sp * fr, rr, c, t, 5 + 4 * R()));
        }
      }
      var nd = Math.round(5 + 14 * str);
      for (k = 0; k < nd; k++) {                                       // spray: small fast droplets
        var th2 = R() * TAU, sp2 = (0.35 + 1.25 * R()) * (0.5 + str);
        S.blobs.push(this.blob(x, y, Math.cos(th2) * sp2, Math.sin(th2) * sp2, 0.005 + 0.011 * R(), cols[(R() * cols.length) | 0], t, 3 + 5 * R()));
      }
      while (S.blobs.length > 280) S.blobs.shift();
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k, x, y;
      var fw = S.fw, fh = S.fh, F = S.F, Hh = S.Hh, Rw = S.Rw, Cr = S.Cr, Cg = S.Cg, Cb = S.Cb, Cw = S.Cw, D = S.img.data;
      var talk = st === "listening" || st === "responding", proc = st === "processing", R = S.R;
      var cols = st === "responding" ? S.HOT : st === "listening" ? S.COOL : proc ? S.THINK : S.COOL.concat(S.HOT);
      if (!S.seeded) {                                                 // a resting splash so the first frame isn't empty
        S.seeded = true; this.splash(S, t, 0.55, S.COOL.concat(S.HOT), S.cx, S.cy);
        for (i = 0; i < S.blobs.length; i++) { S.blobs[i].vx *= 0.25; S.blobs[i].vy *= 0.25; }
      }
      var jx = function () { return S.cx + (R() - 0.5) * 0.3; }, jy = function () { return S.cy + (R() - 0.5) * 0.24; };
      if (talk && f.onset) this.splash(S, t, 0.35 + 0.65 * f.voice, cols, jx(), jy());
      if (talk && lv > 0.45 && t > S.nextSpray) { S.nextSpray = t + 0.14; this.splash(S, t, 0.18 + 0.2 * lv, cols, jx(), jy()); }
      if (!talk && !proc && t > S.nextIdle) { S.nextIdle = t + 2.5 + 2 * R(); this.splash(S, t, 0.2, cols, jx(), jy()); }
      S.swirl = follow(S.swirl, proc ? 1 : 0, 0.05, 0.05, dt);
      var sc = S.stain.getContext("2d");
      sc.globalCompositeOperation = "destination-out"; sc.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.992, dt * 30)).toFixed(4) + ")"; sc.fillRect(0, 0, fw, fh);
      sc.globalCompositeOperation = "source-over";
      for (i = S.blobs.length - 1; i >= 0; i--) {
        var b = S.blobs[i], age = t - b.t0, dx = b.x - S.cx, dy = b.y - S.cy;
        if (S.swirl > 0.01) { b.vx += (-dy * 1.6 - dx * 0.35) * S.swirl * dt; b.vy += (dx * 1.6 - dy * 0.35) * S.swirl * dt; }
        var dr = Math.exp(-2.3 * dt); b.vx *= dr; b.vy *= dr; b.x += b.vx * dt; b.y += b.vy * dt;
        if (age > b.life) {
          var fade = (age - b.life) / 1.4;
          if (fade >= 1) {                                             // leave a faint stain where it settled
            sc.globalAlpha = 0.3; sc.fillStyle = rgba(b.c, 1); sc.beginPath(); sc.arc(b.x * fh, b.y * fh, b.r0 * fh * 1.25, 0, TAU); sc.fill(); sc.globalAlpha = 1;
            S.blobs.splice(i, 1); continue;
          }
          b.r = b.r0 * (1 - fade);
        }
      }
      F.fill(0); Rw.fill(0); Cr.fill(0); Cg.fill(0); Cb.fill(0); Cw.fill(0);
      for (k = 0; k < S.blobs.length; k++) {
        var bl = S.blobs[k], bx = bl.x * fh, by = bl.y * fh, br = bl.r * fh;
        if (br < 0.35) continue;
        var RR = br * 2.1, R2 = RR * RR, iR2 = 1 / R2, cr = bl.c[0], cg = bl.c[1], cb = bl.c[2];
        var x0 = Math.max(0, Math.floor(bx - RR)), x1 = Math.min(fw - 1, Math.ceil(bx + RR)), y0 = Math.max(0, Math.floor(by - RR)), y1 = Math.min(fh - 1, Math.ceil(by + RR));
        for (y = y0; y <= y1; y++) {
          var ddy = y - by, dy2 = ddy * ddy, row = y * fw;
          if (dy2 >= R2) continue;
          for (x = x0; x <= x1; x++) {
            var ddx = x - bx, d2 = ddx * ddx + dy2;
            if (d2 < R2) { var q = 1 - d2 * iR2, c = q * q * q, w = c * c, p = row + x; F[p] += c; Rw[p] += c * br; Cr[p] += w * cr; Cg[p] += w * cg; Cb[p] += w * cb; Cw[p] += w; }
          }
        }
      }
      for (i = 0; i < F.length; i++) { var fv = F[i]; Hh[i] = fv > 0.5 ? Math.sqrt(fv - 0.5) * 1.35 * (Rw[i] / fv) : 0; }
      var Lx = -0.47, Ly = -0.62, Lz = 0.63, hx0 = Lx, hy0 = Ly, hz0 = Lz + 1, hl = 1 / Math.sqrt(hx0 * hx0 + hy0 * hy0 + hz0 * hz0);
      hx0 *= hl; hy0 *= hl; hz0 *= hl;
      for (y = 0; y < fh; y++) {
        var rw = y * fw;
        for (x = 0; x < fw; x++) {
          var ii = rw + x, j4 = ii << 2, fq = F[ii];
          if (fq < 0.3 || x === 0 || y === 0 || x === fw - 1 || y === fh - 1) { D[j4 + 3] = 0; continue; }
          var gx = (F[ii + 1] - F[ii - 1]) * 0.5, gy = (F[ii + fw] - F[ii - fw]) * 0.5, gm = Math.sqrt(gx * gx + gy * gy) + 1e-6;
          var al = (fq - 0.5) / gm + 0.5;
          if (al <= 0) { D[j4 + 3] = 0; continue; }
          if (al > 1) al = 1;
          var hx = (Hh[ii + 1] - Hh[ii - 1]) * 0.5, hy = (Hh[ii + fw] - Hh[ii - fw]) * 0.5;
          var il = 1 / Math.sqrt(hx * hx + hy * hy + 1), nx = -hx * il, ny = -hy * il, nz = il;
          var cw_ = Cw[ii] || 1e-6, pr = Cr[ii] / cw_, pg = Cg[ii] / cw_, pb = Cb[ii] / cw_;
          var dif = nx * Lx + ny * Ly + nz * Lz; if (dif < 0) dif = 0;
          var sp = nx * hx0 + ny * hy0 + nz * hz0, spec = 0;
          if (sp > 0) { var s2 = sp * sp, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8; spec = s16 * s16 * 235; }
          var edge = 1 - nz, crease = 1 - 0.55 * edge * edge, shade = (0.42 + 0.72 * dif) * crease;
          D[j4] = pr * shade + spec; D[j4 + 1] = pg * shade + spec; D[j4 + 2] = pb * shade + spec; D[j4 + 3] = al * 255;
        }
      }
      S.cA.getContext("2d").putImageData(S.img, 0, 0);
      var g = r.ctx;
      g.drawImage(S.bg, 0, 0);
      g.imageSmoothingEnabled = true;
      g.globalAlpha = 0.5; g.drawImage(S.stain, 0, 0, W, H); g.globalAlpha = 1;
      g.drawImage(S.cA, 0, 0, W, H);
      r.bloom(S.cA, 0.16 + 0.2 * lv, 0.02, 1);
    }
  });

  /* ---------- Fireworks \u2014 every syllable launches a shell; loud words burst bigger; the sky and the skyline flash with them ----------
     Rockets rise to a height set by the syllable's strength and burst as peony, ring or willow shells. Sparks fly with drag and a
     little gravity into a fading trail buffer (long streaks), glitter as they die, and the whole buffer blooms. */
  register({
    id: "fireworks", name: "Fireworks", layout: "bottom", text: "default",
    blurb: "A night-sky fireworks show \u2014 every syllable launches a shell, loud words burst bigger, and the whole sky blooms.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(404), i;
      S.R = R; S.rockets = []; S.sparks = []; S.flashes = []; S.nextAuto = 0; S.mix = 0; S.gold = 0; S.max = r.thumb ? 700 : 1800;
      S.ground = H * 0.86;
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, "#010208"); gr.addColorStop(0.55, "#050a1a"); gr.addColorStop(0.86, "#0d1430"); gr.addColorStop(1, "#070a16");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (i = 0; i < (r.thumb ? 120 : 260); i++) { var b = 0.15 + R() * R() * 0.7, s = (0.5 + R()) * u; g.fillStyle = "rgba(220,230,255," + b.toFixed(3) + ")"; g.fillRect(R() * W, R() * H * 0.7, s, s); }
      S.bg = bg;
      var sk = mkCanvas(W, H), q = sk.getContext("2d"), x = 0;
      q.fillStyle = "#03040a";
      var wins = [];
      while (x < W) {                                                  // a city skyline, windows dimly lit
        var bw = (26 + R() * 70) * u, bh = H * (0.05 + R() * R() * 0.13), top = S.ground - bh;
        q.fillRect(x, top, bw + 1, H - top);
        if (R() < 0.25) q.fillRect(x + bw * 0.4, top - bh * 0.25, bw * 0.12, bh * 0.25);
        for (var wy = top + 6 * u; wy < S.ground - 4 * u; wy += 9 * u) for (var wx = x + 5 * u; wx < x + bw - 6 * u; wx += 8 * u) if (R() < 0.16) wins.push([wx, wy]);
        x += bw + (R() < 0.3 ? R() * 16 * u : 0);
      }
      q.fillRect(0, S.ground, W, H - S.ground);
      q.fillStyle = "rgba(255,200,110,0.55)"; for (i = 0; i < wins.length; i++) q.fillRect(wins[i][0], wins[i][1], 3 * u, 3.4 * u);
      S.sky = sk;
      S.PA = [[120, 210, 255], [70, 130, 255], [140, 255, 220], [235, 245, 255]];
      S.PB = [[255, 95, 205], [255, 70, 120], [255, 205, 100], [200, 130, 255]];
      S.PG = [[255, 205, 95], [255, 165, 60], [255, 235, 170], [255, 190, 110]];
    },
    launch: function (S, W, H, str, t) {
      var R = S.R, y0 = S.ground, yb = H * (0.44 - 0.26 * str) + (R() - 0.5) * H * 0.06, gy = 0.55 * H;
      var vy = -Math.sqrt(2 * gy * Math.max(10, y0 - yb)), x = W * (0.2 + 0.6 * R());
      var r = R(), type = str > 0.7 && r < 0.3 ? "ring" : r < 0.22 ? "willow" : "peony";
      S.rockets.push({ x: x, y: y0, vx: (R() - 0.5) * W * 0.05, vy: vy, str: str, type: type, ci: (R() * 4) | 0, t0: t });
    },
    burst: function (S, H, rk, cols, t) {
      var R = S.R, n = Math.round((60 + 120 * rk.str) * (S.max < 1000 ? 0.5 : 1)), sp = H * (0.2 + 0.24 * rk.str), c = cols[rk.ci], c2 = cols[(rk.ci + 1) % cols.length], i;
      for (i = 0; i < n && S.sparks.length < S.max; i++) {
        var a = R() * TAU, v = rk.type === "ring" ? sp : sp * (0.35 + 0.65 * Math.sqrt(R())), willow = rk.type === "willow";
        S.sparks.push({ x: rk.x, y: rk.y, vx: Math.cos(a) * v * (willow ? 0.7 : 1), vy: Math.sin(a) * v * (willow ? 0.7 : 1),
          c: willow ? S.PG[(R() * 2) | 0] : (R() < 0.8 ? c : c2), t0: t, life: willow ? 2.4 + R() * 0.8 : 1.1 + R() * 0.8,
          drag: willow ? 2.4 : 1.35, grav: willow ? 0.5 : 0.28, tw: R() < 0.45, s: willow ? 1 : 1.4 });
      }
      S.flashes.push({ x: rk.x, y: rk.y, t0: t, a: 0.1 + 0.2 * rk.str, c: c });
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      var talk = st === "listening" || st === "responding", proc = st === "processing", R = S.R;
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      var cols = []; for (k = 0; k < 4; k++) cols.push(mixc(mixc(S.PA[k], S.PB[k], S.mix), S.PG[k], S.gold));
      if (talk && f.onset && S.rockets.length < 8) this.launch(S, W, H, 0.4 + 0.6 * f.voice, t);
      if (t > S.nextAuto) {
        if (talk) { S.nextAuto = t + 0.9 - 0.55 * lv; if (lv > 0.2) this.launch(S, W, H, 0.3 + 0.5 * lv, t); }
        else if (proc) { S.nextAuto = t + 0.45; this.launch(S, W, H, 0.22, t); }
        else { S.nextAuto = t + 2.6 + 2 * R(); this.launch(S, W, H, 0.3, t); }
      }
      var acc = r.buf("fwacc", W, H), a = acc.getContext("2d");
      a.globalCompositeOperation = "source-over"; a.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.84, dt * 30)).toFixed(3) + ")"; a.fillRect(0, 0, W, H);
      a.globalCompositeOperation = "lighter";
      var gy = 0.55 * H, trail = new Path2D();
      for (i = S.rockets.length - 1; i >= 0; i--) {
        var rk = S.rockets[i];
        var px = rk.x, py = rk.y;                                      // a continuous streak, not dots, at any frame rate
        rk.vy += gy * dt; rk.x += rk.vx * dt; rk.y += rk.vy * dt;
        trail.moveTo(px, py); trail.lineTo(rk.x, rk.y);
        if (R() < 0.8) S.sparks.push({ x: rk.x, y: rk.y, vx: (R() - 0.5) * 30 * u, vy: 40 * u, c: [255, 220, 170], t0: t, life: 0.35, drag: 3, grav: 0.2, tw: false, s: 0.8 });
        if (rk.vy > -0.06 * H) { this.burst(S, H, rk, cols, t); S.rockets.splice(i, 1); }
      }
      a.lineWidth = 1.6 * u; a.lineCap = "round"; a.strokeStyle = "rgba(255,205,140,0.6)"; a.stroke(trail);
      var buckets = {}, keys = [];
      for (i = S.sparks.length - 1; i >= 0; i--) {
        var p = S.sparks[i], age = t - p.t0;
        if (age > p.life) { S.sparks.splice(i, 1); continue; }
        var d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vy += gy * p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        var fade = 1 - age / p.life, al = fade * fade;
        if (p.tw && fade < 0.45 && R() < 0.5) al *= 0.2;               // glitter as they die
        var lvl = al > 0.66 ? 2 : al > 0.3 ? 1 : 0, key = p.c.join(",") + "|" + lvl;
        if (!buckets[key]) { buckets[key] = { path: new Path2D(), c: p.c, lvl: lvl }; keys.push(key); }
        var sz = p.s * (1.2 + 1.2 * fade) * u;
        buckets[key].path.rect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      var alv = [0.3, 0.62, 1];
      for (k = 0; k < keys.length; k++) { var bk = buckets[keys[k]]; a.fillStyle = rgba(mixc(bk.c, [255, 255, 255], bk.lvl * 0.18), alv[bk.lvl]); a.fill(bk.path); }
      a.globalCompositeOperation = "source-over";
      var g = r.ctx;
      g.drawImage(S.bg, 0, 0);
      g.globalCompositeOperation = "lighter";
      var sky = 0;
      for (i = S.flashes.length - 1; i >= 0; i--) {
        var fl = S.flashes[i], fa = 1 - (t - fl.t0) / 0.45;
        if (fa <= 0) { S.flashes.splice(i, 1); continue; }
        sky = Math.max(sky, fa * fl.a);
        var rad = H * 0.55, fg = g.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rad);
        fg.addColorStop(0, rgba(fl.c, fl.a * fa)); fg.addColorStop(1, rgba(fl.c, 0));
        g.fillStyle = fg; g.fillRect(fl.x - rad, fl.y - rad, rad * 2, rad * 2);
      }
      g.drawImage(acc, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.drawImage(S.sky, 0, 0);
      g.save(); g.beginPath(); g.rect(0, S.ground, W, H - S.ground); g.clip();   // the harbour mirrors the show
      g.translate(0, S.ground); g.scale(1, -0.26); g.translate(0, -S.ground); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.34;
      g.drawImage(acc, 0, 0); g.restore();
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      var wf = g.createLinearGradient(0, S.ground, 0, H); wf.addColorStop(0, "rgba(2,3,9,0)"); wf.addColorStop(1, "rgba(2,3,9,0.85)");
      g.fillStyle = wf; g.fillRect(0, S.ground, W, H - S.ground);
      if (sky > 0.01) {                                                // the skyline catches the light of each burst
        g.globalCompositeOperation = "lighter";
        var hz = g.createLinearGradient(0, S.ground - H * 0.2, 0, S.ground);
        hz.addColorStop(0, "rgba(0,0,0,0)"); hz.addColorStop(1, rgba(cols[0], sky * 0.6));
        g.fillStyle = hz; g.fillRect(0, S.ground - H * 0.2, W, H * 0.2);
        g.globalCompositeOperation = "source-over";
      }
      r.bloom(acc, 0.85 + 0.5 * lv, 0.022, 2);
    }
  });

  /* ---------- Synthwave \u2014 an 80s neon sunset: the striped sun pulses with the voice, the mountains ARE its spectrum,
     and the perspective grid rushes toward you faster as someone speaks; each syllable sends a bright wave down the grid. ---------- */
  register({
    id: "synthwave", name: "Synthwave", layout: "top", text: "default",
    blurb: "An 80s neon sunset \u2014 the striped sun pulses with the voice, the mountains are its spectrum, and the grid rushes at you.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(88), i;
      S.hz = H * 0.6; S.scroll = 0; S.mix = 0; S.gold = 0; S.waves = []; S.P = 72;
      S.front = new Float32Array(S.P); S.back = new Float32Array(S.P);
      S.base = new Float32Array(S.P);
      for (i = 0; i < S.P; i++) { var xn = i / (S.P - 1); S.base[i] = 0.25 + 0.5 * noise1(xn * 7 + 3) + 0.25 * noise1(xn * 19 + 1); }
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), sky = g.createLinearGradient(0, 0, 0, S.hz);
      sky.addColorStop(0, "#060217"); sky.addColorStop(0.5, "#1a0736"); sky.addColorStop(0.82, "#46104e"); sky.addColorStop(1, "#8c1f5c");
      g.fillStyle = sky; g.fillRect(0, 0, W, S.hz);
      for (i = 0; i < 190; i++) { var b = 0.2 + R() * R() * 0.8, s = (0.5 + R() * 1.1) * u; g.fillStyle = "rgba(255,230,255," + b.toFixed(3) + ")"; g.fillRect(R() * W, Math.pow(R(), 1.6) * S.hz * 0.7, s, s); }
      var fl = g.createLinearGradient(0, S.hz, 0, H); fl.addColorStop(0, "#1a0530"); fl.addColorStop(1, "#050109");
      g.fillStyle = fl; g.fillRect(0, S.hz, W, H - S.hz);
      S.bg = bg;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      var talk = st === "listening" || st === "responding", proc = st === "processing", hz = S.hz;
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      var neon = mixc(mixc([60, 235, 255], [255, 60, 200], S.mix), [255, 190, 60], S.gold);
      var neon2 = mixc(mixc([255, 60, 200], [80, 220, 255], S.mix), [255, 120, 60], S.gold);
      S.scroll += dt * (0.9 + 3.6 * lv + (proc ? 1.2 : 0));
      if (f.onset && talk && S.waves.length < 6) S.waves.push({ z: 14, a: 0.5 + 0.5 * f.voice });
      // mountains: the spectrum mirrored from the middle, low notes nearest the sun
      for (i = 0; i < S.P; i++) {
        var xn = i / (S.P - 1), d = Math.abs(xn - 0.5) * 2, bi = d * 26, b0 = bi | 0, bv = f.bands[b0] + (f.bands[Math.min(31, b0 + 1)] - f.bands[b0]) * (bi - b0);
        var gapC = smoothstep(0.1, 0.34, d), tgt = (S.base[i] * 0.35 + (talk ? bv * (0.6 + 0.8 * lv) : proc ? 0.25 + 0.2 * Math.sin(t * 3 + d * 9) : 0.08)) * gapC;
        S.front[i] = follow(S.front[i], tgt, 0.45, 0.12, dt);
        S.back[i] = follow(S.back[i], S.base[i] * 0.55 * gapC + tgt * 0.35, 0.05, 0.03, dt);
      }
      var sc = r.scene(), g = sc.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.bg, 0, 0);
      // the sun: gradient disc with widening cut stripes, pulsing with the low bands
      var bass = (f.bands[1] + f.bands[3] + f.bands[5]) / 3, Rs = H * (0.155 + 0.012 * f.slow + (talk ? 0.012 * lv : 0)), cx = W / 2, cy = hz - H * 0.075;
      var ssz = Math.ceil(H * 0.37 + 6), sun = r.buf("swsun", ssz, ssz), q = sun.getContext("2d"), o = ssz / 2;   // fixed size: no realloc as it pulses
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, sun.width, sun.height);
      var sg = q.createLinearGradient(0, o - Rs, 0, o + Rs);
      sg.addColorStop(0, "#fff27a"); sg.addColorStop(0.45, "#ffb03a"); sg.addColorStop(0.75, "#ff4f7a"); sg.addColorStop(1, "#d61e8f");
      q.fillStyle = sg; q.beginPath(); q.arc(o, o, Rs, 0, TAU); q.fill();
      q.globalCompositeOperation = "destination-out";
      for (k = 0; k < 7; k++) {
        var sy = o + Rs * (0.02 + k * 0.155), th = Rs * (0.018 + 0.028 * k / 6) * (0.8 + 1.4 * (talk ? bass : 0.15) + (proc ? 0.3 * (0.5 + 0.5 * Math.sin(t * 5 - k)) : 0));
        q.fillRect(0, sy, sun.width, th);
      }
      q.globalCompositeOperation = "source-over";
      g.save(); g.beginPath(); g.rect(0, 0, W, hz); g.clip();
      g.globalCompositeOperation = "lighter";
      var glow = g.createRadialGradient(cx, cy, Rs * 0.6, cx, cy, Rs * 2.4);
      glow.addColorStop(0, "rgba(255,90,160," + (0.22 + 0.25 * lv).toFixed(3) + ")"); glow.addColorStop(1, "rgba(255,90,160,0)");
      g.fillStyle = glow; g.fillRect(cx - Rs * 2.4, cy - Rs * 2.4, Rs * 4.8, Rs * 4.8);
      g.globalCompositeOperation = "source-over";
      g.drawImage(sun, cx - o, cy - o);
      g.restore();
      // mountains (back ridge, then the live front ridge)
      function ridge(arr, hmax, fill, edge, lw) {
        g.beginPath(); g.moveTo(0, hz);
        for (var j = 0; j < S.P; j++) g.lineTo(j / (S.P - 1) * W, hz - arr[j] * hmax);
        g.lineTo(W, hz); g.closePath(); g.fillStyle = fill; g.fill();
        g.beginPath(); for (j = 0; j < S.P; j++) { var px = j / (S.P - 1) * W, py = hz - arr[j] * hmax; if (j) g.lineTo(px, py); else g.moveTo(px, py); }
        g.lineWidth = lw; g.strokeStyle = edge; g.stroke();
      }
      ridge(S.back, H * 0.2, "#12042a", rgba(neon2, 0.55), 1.2 * u);
      var mf = g.createLinearGradient(0, hz - H * 0.18, 0, hz); mf.addColorStop(0, "#1d0636"); mf.addColorStop(1, "#0b0218");
      ridge(S.front, H * 0.16, mf, rgba(neon, 0.95), 1.8 * u);
      // the horizon line
      g.globalCompositeOperation = "lighter";
      g.fillStyle = rgba(mixc(neon, [255, 255, 255], 0.4), 0.9); g.fillRect(0, hz - 0.8 * u, W, 1.6 * u);
      // the perspective grid
      var camH = H - hz, spacing = 1, zmax = 16, offset = S.scroll % spacing;
      g.lineWidth = 1.4 * u; g.strokeStyle = rgba(neon, 0.8);
      g.beginPath();
      for (var z = spacing - offset; z < zmax; z += spacing) {
        var zz = Math.max(0.05, z * 0.55), y = hz + camH * (1 / zz) * 0.55;
        if (y > H + 2 || y < hz) continue;
        g.moveTo(0, y); g.lineTo(W, y);
      }
      var nV = 26;
      for (k = -nV; k <= nV; k++) { var xb = cx + k * (W * 0.16); g.moveTo(cx + (xb - cx) * 0.02, hz); g.lineTo(cx + (xb - cx) * 2.2, H * 1.35); }
      g.stroke();
      // syllable waves rolling toward you
      for (i = S.waves.length - 1; i >= 0; i--) {
        var wv = S.waves[i]; wv.z -= dt * (5 + 6 * lv);
        if (wv.z < 0.9) { S.waves.splice(i, 1); continue; }
        var wy = hz + camH * (1 / Math.max(0.05, wv.z * 0.55)) * 0.55, wa = wv.a * Math.min(1, (14 - wv.z) / 3);
        var wg = g.createLinearGradient(0, wy - 10 * u, 0, wy + 10 * u);
        wg.addColorStop(0, rgba(neon2, 0)); wg.addColorStop(0.5, rgba(mixc(neon2, [255, 255, 255], 0.35), wa)); wg.addColorStop(1, rgba(neon2, 0));
        g.fillStyle = wg; g.fillRect(0, wy - 10 * u, W, 20 * u);
      }
      // fade the far grid into the haze
      g.globalCompositeOperation = "source-over";
      var haze = g.createLinearGradient(0, hz, 0, hz + (H - hz) * 0.35);
      haze.addColorStop(0, "rgba(26,5,48,0.9)"); haze.addColorStop(1, "rgba(26,5,48,0)");
      g.fillStyle = haze; g.fillRect(0, hz + 0.8 * u, W, (H - hz) * 0.35);
      r.present(sc, 0.55 + 0.45 * lv, 0.018, 2);
    }
  });

  /* ---------- HAL 9000 \u2014 the red eye from 2001: A Space Odyssey, set in its brushed-aluminium panel ----------
     The lens is the only thing that moves: it glows hotter and its core swells with the assistant's voice, stays watchful with a
     cool rim light while you talk, and breathes slowly while it thinks. Syllables flicker the core. The room, the panel,
     the nameplate, the chrome ring and the glass reflections are drawn once. */
  register({
    id: "hal-9000", name: "HAL 9000", layout: "left", text: "default", hiDpi: true,
    blurb: "The calm red eye from 2001: A Space Odyssey. It glows and flickers as the assistant speaks, and watches while you talk.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(2001), i;
      var pw = Math.min(W * 0.34, H * 0.52), pcx = W * 0.775, px = pcx - pw / 2;
      var Rc = pw * 0.41, Rb = Rc * 0.87, Rg = Rc * 0.75, ecy = H * 0.53;
      S.pcx = pcx; S.ecy = ecy; S.Rc = Rc; S.Rg = Rg; S.I = 0.5; S.flick = 0; S.cool = 0; S.gold = 0;
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      // the room: near-black, faintly lit behind the panel
      g.fillStyle = "#030304"; g.fillRect(0, 0, W, H);
      var room = g.createRadialGradient(pcx, ecy, 0, pcx, ecy, H * 1.1);
      room.addColorStop(0, "rgba(46,46,52,0.5)"); room.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = room; g.fillRect(0, 0, W, H);
      // the panel: brushed aluminium, running off the top and bottom of the screen
      g.save(); g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 34 * u; g.fillStyle = "#6c7075"; g.fillRect(px, -30, pw, H + 60); g.restore();
      var al = g.createLinearGradient(px, 0, px + pw, 0);
      al.addColorStop(0, "#63686d"); al.addColorStop(0.16, "#a2a7ab"); al.addColorStop(0.5, "#c6c9cc"); al.addColorStop(0.84, "#9ea3a7"); al.addColorStop(1, "#5d6267");
      g.fillStyle = al; g.fillRect(px, -30, pw, H + 60);
      for (i = 0; i < 1100; i++) {                                 // vertical brush strokes
        var a = R() * 0.07;
        g.fillStyle = (R() < 0.5 ? "rgba(255,255,255," : "rgba(0,0,0,") + a.toFixed(3) + ")";
        g.fillRect(px + R() * pw, -30 + R() * H * 0.4, Math.max(0.6, 0.6 * u), H * (0.3 + R() * 0.9));
      }
      var vf = g.createLinearGradient(0, 0, 0, H);
      vf.addColorStop(0, "rgba(255,255,255,0.1)"); vf.addColorStop(0.5, "rgba(0,0,0,0)"); vf.addColorStop(1, "rgba(0,0,0,0.4)");
      g.fillStyle = vf; g.fillRect(px, -30, pw, H + 60);
      g.fillStyle = "rgba(255,255,255,0.32)"; g.fillRect(px, -30, Math.max(1, u), H + 60);
      g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(px + pw - Math.max(1, 1.5 * u), -30, Math.max(1, 1.5 * u), H + 60);
      // the nameplate
      var nw = pw * 0.66, nh = pw * 0.15, nx = pcx - nw / 2, ny = H * 0.1;
      g.save(); g.shadowColor = "rgba(0,0,0,0.65)"; g.shadowBlur = 7 * u; g.shadowOffsetY = 2 * u;
      roundRect(g, nx, ny, nw, nh, 3 * u); g.fillStyle = "#0a0b0c"; g.fill(); g.restore();
      roundRect(g, nx + 2 * u, ny + 2 * u, nw - 4 * u, nh - 4 * u, 2 * u); g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = Math.max(1, u); g.stroke();
      var fs = nh * 0.5, fam = "px 'Helvetica Neue',Helvetica,Arial,sans-serif";
      g.textBaseline = "middle"; g.textAlign = "left"; g.fillStyle = "#f1f1f1";
      g.font = "700 " + fs.toFixed(1) + fam; var w1 = g.measureText("HAL").width;
      g.font = "300 " + fs.toFixed(1) + fam; var w2 = g.measureText(" 9000").width, tx = pcx - (w1 + w2) / 2;
      g.font = "700 " + fs.toFixed(1) + fam; g.fillText("HAL", tx, ny + nh * 0.53);
      g.font = "300 " + fs.toFixed(1) + fam; g.fillText(" 9000", tx + w1, ny + nh * 0.53);
      // the chrome ring: machined, so it bands as it turns (conic where the browser has it)
      var ring;
      if (g.createConicGradient) {
        ring = g.createConicGradient(-0.7, pcx, ecy);
        [[0, "#eceef0"], [0.12, "#8a8e93"], [0.26, "#f6f7f8"], [0.4, "#6a6e73"], [0.55, "#dadcdf"], [0.7, "#777b80"], [0.86, "#eff0f2"], [1, "#eceef0"]]
          .forEach(function (s) { ring.addColorStop(s[0], s[1]); });
      } else {
        ring = g.createLinearGradient(pcx - Rc, ecy - Rc, pcx + Rc, ecy + Rc);
        ring.addColorStop(0, "#eef0f2"); ring.addColorStop(0.5, "#80858a"); ring.addColorStop(1, "#d7dadd");
      }
      g.save(); g.shadowColor = "rgba(0,0,0,0.65)"; g.shadowBlur = 14 * u; g.shadowOffsetY = 4 * u;
      g.beginPath(); g.arc(pcx, ecy, Rc, 0, TAU); g.fillStyle = ring; g.fill(); g.restore();
      g.beginPath(); g.arc(pcx, ecy, Rc * 0.955, 0, TAU); g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = Math.max(1, 1.3 * u); g.stroke();
      g.beginPath(); g.arc(pcx, ecy, Rc - 0.8 * u, 0, TAU); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = Math.max(1, 0.8 * u); g.stroke();
      // the black bezel and the glass well
      var bz = g.createRadialGradient(pcx, ecy - Rb * 0.35, Rb * 0.15, pcx, ecy, Rb);
      bz.addColorStop(0, "#202023"); bz.addColorStop(1, "#040404");
      g.beginPath(); g.arc(pcx, ecy, Rb, 0, TAU); g.fillStyle = bz; g.fill();
      g.beginPath(); g.arc(pcx, ecy, Rg + 1.5 * u, 0, TAU); g.fillStyle = "#000"; g.fill();
      S.bg = bg;
      // the glass: lens elements, the fisheye reflections of the room, and the dark edge
      var gs = Math.ceil(Rg * 2 + 4), gl = mkCanvas(gs, gs), q = gl.getContext("2d"), o = gs / 2;
      q.save(); q.beginPath(); q.arc(o, o, Rg, 0, TAU); q.clip();
      [0.2, 0.33, 0.47, 0.6, 0.74, 0.88].forEach(function (k, j) {
        q.beginPath(); q.arc(o, o, Rg * k, 0, TAU); q.strokeStyle = "rgba(255,255,255," + (0.028 + 0.014 * (j % 2)).toFixed(3) + ")";
        q.lineWidth = Math.max(1, u); q.stroke();
      });
      function arcR(rad, a0, a1, w, al) { q.beginPath(); q.arc(o, o, rad, a0, a1); q.strokeStyle = "rgba(255,255,255," + al + ")"; q.lineWidth = w; q.lineCap = "round"; q.stroke(); }
      arcR(Rg * 0.8, Math.PI * 1.07, Math.PI * 1.38, 4 * u, 0.12);
      arcR(Rg * 0.69, Math.PI * 1.11, Math.PI * 1.31, 2.4 * u, 0.08);
      arcR(Rg * 0.87, Math.PI * 1.56, Math.PI * 1.72, 2 * u, 0.05);
      arcR(Rg * 0.55, Math.PI * 0.2, Math.PI * 0.32, 1.6 * u, 0.04);
      for (i = 0; i < 6; i++) {                                    // a row of ceiling lights, bent by the lens
        var aa = Math.PI * (1.15 + i * 0.034), rr = Rg * 0.6;
        q.beginPath(); q.arc(o + Math.cos(aa) * rr, o + Math.sin(aa) * rr, (1.1 + 0.7 * (i % 2)) * u, 0, TAU);
        q.fillStyle = "rgba(255,255,255,0.26)"; q.fill();
      }
      var sp = q.createRadialGradient(o - Rg * 0.38, o - Rg * 0.43, 0, o - Rg * 0.38, o - Rg * 0.43, Rg * 0.17);
      sp.addColorStop(0, "rgba(255,255,255,0.55)"); sp.addColorStop(0.35, "rgba(255,255,255,0.12)"); sp.addColorStop(1, "rgba(255,255,255,0)");
      q.fillStyle = sp; q.fillRect(0, 0, gs, gs);
      var sheen = q.createLinearGradient(0, o - Rg, 0, o + Rg * 0.15);
      sheen.addColorStop(0, "rgba(255,255,255,0.07)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
      q.fillStyle = sheen; q.fillRect(0, 0, gs, gs);
      var ed = q.createRadialGradient(o, o, Rg * 0.6, o, o, Rg);
      ed.addColorStop(0, "rgba(0,0,0,0)"); ed.addColorStop(1, "rgba(0,0,0,0.7)");
      q.fillStyle = ed; q.fillRect(0, 0, gs, gs);
      q.restore();
      S.glass = gl; S.gs = gs;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      if (f.onset && talk) S.flick = 1;
      S.flick = Math.max(0, S.flick - dt * 5);
      var target = st === "responding" ? 0.5 + 0.8 * lv : st === "listening" ? 0.48 + 0.3 * lv
                 : proc ? 0.55 + 0.22 * Math.sin(t * 2.4) : 0.46 + 0.04 * Math.sin(t * 0.9);
      S.I = follow(S.I, target, 0.35, 0.12, dt);
      S.cool = follow(S.cool, st === "listening" ? 1 : 0, 0.1, 0.06, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      var I = S.I + (st === "responding" ? 0.22 : 0.1) * S.flick, g = r.ctx, cx = S.pcx, cy = S.ecy, Rg = S.Rg;
      g.drawImage(S.bg, 0, 0);
      // the eye, drawn into its own full-frame buffer so only the eye blooms
      var eb = r.buf("haleye", W, H), e = eb.getContext("2d");
      e.clearRect(cx - Rg - 2, cy - Rg - 2, Rg * 2 + 4, Rg * 2 + 4);
      var k = clamp(0.72 + 0.5 * I, 0.5, 1.4);
      var core = mixc([255, 250, 214], [255, 222, 140], S.gold), mid = mixc([255, 196, 72], [255, 176, 44], S.gold);
      var eg = e.createRadialGradient(cx, cy, 0, cx, cy, Rg);
      eg.addColorStop(0, rgba(core, 1));
      eg.addColorStop(0.045 * k, rgba(mid, 1));
      eg.addColorStop(0.12 * k, rgba([255, 72, 18], 1));
      eg.addColorStop(0.28 * k, rgba([206, 8, 0], clamp(0.72 + 0.28 * I, 0, 1)));
      eg.addColorStop(0.58, rgba([96, 0, 0], clamp(0.5 + 0.4 * I, 0, 1)));
      eg.addColorStop(0.86, "rgba(28,0,0,0.92)");
      eg.addColorStop(1, "rgba(5,0,0,1)");
      e.save(); e.beginPath(); e.arc(cx, cy, Rg, 0, TAU); e.globalAlpha = clamp(0.5 + 0.55 * I, 0, 1); e.fillStyle = eg; e.fill(); e.restore();
      g.drawImage(eb, 0, 0);
      g.save(); g.globalCompositeOperation = "lighter";
      var spill = g.createRadialGradient(cx, cy, Rg * 0.95, cx, cy, S.Rc * 1.2);    // the red light catching the chrome
      spill.addColorStop(0, rgba([255, 36, 10], 0.14 * I)); spill.addColorStop(1, "rgba(255,36,10,0)");
      g.fillStyle = spill; g.beginPath(); g.arc(cx, cy, S.Rc * 1.2, 0, TAU); g.fill();
      g.restore();
      g.drawImage(S.glass, cx - S.gs / 2, cy - S.gs / 2);
      if (S.cool > 0.02) {                                        // a cool rim light while you speak
        g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
        g.beginPath(); g.arc(cx, cy, Rg * 0.93, Math.PI * 0.18, Math.PI * 0.82);
        g.strokeStyle = rgba([120, 215, 255], (0.08 + 0.3 * lv) * S.cool); g.lineWidth = 3 * u; g.stroke();
        g.restore();
      }
      r.bloom(eb, 0.65 + 0.7 * I, 0.03, 2);
    }
  });

  /* ---------- Mother \u2014 MU/TH/UR 6000 from Alien: a phosphor terminal ready for inquiry, beside a wall of lamps ----------
     The terminal types its ready line at the start of every conversation and traces the voice along its foot; the lamp wall
     chatters faster the louder someone speaks (each column follows its own slice of the spectrum), sweeps in a diagonal
     wave while it thinks, and throws a cluster of lamps on every syllable. The transcript is the HTML layer ("mother"
     text theme), sitting inside the screen. */
  register({
    id: "mother", name: "Mother", layout: "left", text: "mother", hiDpi: true,
    blurb: "MU/TH/UR 6000 from Alien. A green terminal, ready for your question, beside a wall of lamps that chatters as you talk.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(2037), i, j, a, b;
      S.C = [140, 255, 214]; S.R = rng(6000);
      // the terminal
      var cx0 = W * 0.03, cy0 = H * 0.05, cw = W * 0.555, ch = H * 0.9, pad = Math.min(cw, ch) * 0.045;
      S.sx = cx0 + pad; S.sy = cy0 + pad; S.sw = cw - 2 * pad; S.sh = ch - 2 * pad; S.cr = 16 * u;
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#050607"; g.fillRect(0, 0, W, H);
      var amb = g.createRadialGradient(W * 0.3, H * 0.5, 0, W * 0.3, H * 0.5, W * 0.7);
      amb.addColorStop(0, "rgba(30,60,52,0.35)"); amb.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = amb; g.fillRect(0, 0, W, H);
      g.save(); g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 22 * u;
      roundRect(g, cx0, cy0, cw, ch, 24 * u);
      var bz = g.createLinearGradient(0, cy0, 0, cy0 + ch); bz.addColorStop(0, "#2a2c2b"); bz.addColorStop(1, "#121313");
      g.fillStyle = bz; g.fill(); g.restore();
      roundRect(g, S.sx - 5 * u, S.sy - 5 * u, S.sw + 10 * u, S.sh + 10 * u, S.cr + 5 * u); g.fillStyle = "#020303"; g.fill();
      var scr = g.createRadialGradient(S.sx + S.sw / 2, S.sy + S.sh / 2, 0, S.sx + S.sw / 2, S.sy + S.sh / 2, S.sw * 0.65);
      scr.addColorStop(0, "#04120e"); scr.addColorStop(0.75, "#020a08"); scr.addColorStop(1, "#010403");
      roundRect(g, S.sx, S.sy, S.sw, S.sh, S.cr); g.fillStyle = scr; g.fill();
      g.fillStyle = "rgba(170,185,178,0.5)"; g.font = "700 " + (10 * u).toFixed(1) + "px 'Courier New',monospace";
      g.textBaseline = "middle"; g.textAlign = "left"; g.fillText("MU/TH/UR 6000", cx0 + 24 * u, cy0 + ch - pad * 0.45);
      g.textAlign = "right"; g.fillText("INTERFACE 2037", cx0 + cw - 24 * u, cy0 + ch - pad * 0.45);
      // the lamp wall: 3 x 5 panels of 5 x 4 lamps, dark sockets drawn once
      var lx0 = W * 0.615, ly0 = H * 0.05, lw = W * 0.355, lh = H * 0.9, PC = 3, PR = 5, LC = 5, LR = 4;
      var gap = Math.min(lw, lh) * 0.03, pw = (lw - gap * (PC - 1)) / PC, ph = (lh - gap * (PR - 1)) / PR;
      var lr = Math.min(pw / LC, ph / LR) * 0.2;
      S.lr = lr; S.lamps = []; S.wall = [lx0, ly0, lw, lh];
      for (a = 0; a < PC; a++) for (b = 0; b < PR; b++) {
        var px = lx0 + a * (pw + gap), py = ly0 + b * (ph + gap);
        g.save(); g.shadowColor = "rgba(0,0,0,0.8)"; g.shadowBlur = 8 * u;
        roundRect(g, px, py, pw, ph, 5 * u);
        var pg = g.createLinearGradient(px, py, px, py + ph); pg.addColorStop(0, "#1d1f20"); pg.addColorStop(1, "#111213");
        g.fillStyle = pg; g.fill(); g.restore();
        roundRect(g, px + 1.5 * u, py + 1.5 * u, pw - 3 * u, ph - 3 * u, 4 * u); g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = Math.max(1, u); g.stroke();
        g.fillStyle = "rgba(150,160,155,0.35)"; g.font = "600 " + (7.5 * u).toFixed(1) + "px 'Courier New',monospace"; g.textAlign = "left";
        g.fillText(String.fromCharCode(65 + b) + "-" + (a * PR + b + 11), px + 5 * u, py + ph - 6 * u);
        for (i = 0; i < LC; i++) for (j = 0; j < LR; j++) {
          var x = px + pw * (0.14 + 0.72 * i / (LC - 1)), y = py + ph * (0.16 + 0.58 * j / (LR - 1)), p = R();
          var type = p < 0.66 ? 0 : p < 0.9 ? 1 : 2;
          g.beginPath(); g.arc(x, y, lr * 1.35, 0, TAU); g.fillStyle = "#070808"; g.fill();
          g.beginPath(); g.arc(x, y, lr, 0, TAU); g.fillStyle = ["#2c2a26", "#2e2518", "#2e1a17"][type]; g.fill();
          S.lamps.push({ x: x, y: y, type: type, on: R() < 0.3, rate: 0.35 + R() * 1.5, band: Math.min(31, ((a * LC + i) / (PC * LC - 1) * 30) | 0),
                         diag: a * LC + i + (b * LR + j) * 0.7, flash: 0 });
        }
      }
      S.bg = bg;
      S.spr = [[255, 246, 226], [255, 178, 72], [255, 74, 44]].map(function (c) { return dotSprite(Math.ceil(lr * 7), c, [255, 255, 250]); });
      // the glass: scanlines, a curvature vignette and a faint reflection
      var gl = mkCanvas(S.sw, S.sh), q = gl.getContext("2d");
      q.fillStyle = "rgba(0,0,0,0.22)"; for (var yy = 0; yy < S.sh; yy += 3) q.fillRect(0, yy, S.sw, 1);
      var vg = q.createRadialGradient(S.sw / 2, S.sh / 2, S.sh * 0.3, S.sw / 2, S.sh / 2, S.sw * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.6)"); q.fillStyle = vg; q.fillRect(0, 0, S.sw, S.sh);
      var rf = q.createLinearGradient(0, 0, S.sw * 0.7, S.sh); rf.addColorStop(0, "rgba(255,255,255,0.05)"); rf.addColorStop(0.35, "rgba(255,255,255,0.012)"); rf.addColorStop(0.36, "rgba(255,255,255,0)");
      q.fillStyle = rf; q.fillRect(0, 0, S.sw, S.sh);
      S.glass = gl;
      S.typeT = null; S.lastSt = null; S.cool = 0; S.warm = 0; S.gold = 0;
      S.READY = "INTERFACE 2037 READY FOR INQUIRY";
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, i, L;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      if (S.typeT === null) S.typeT = t - 99;                     // first frame: the ready line is already typed
      if (st !== S.lastSt) { if (st === "listening" && S.lastSt !== null) S.typeT = t; S.lastSt = st; }
      S.cool = follow(S.cool, st === "listening" ? 1 : 0, 0.1, 0.06, dt);
      S.warm = follow(S.warm, st === "responding" ? 1 : 0, 0.1, 0.06, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.1, 0.05, dt);
      // the lamps
      var act = talk ? 0.7 + 5.5 * lv : 0.45, n = S.lamps.length;
      if (f.onset && talk) for (i = 0; i < 7; i++) { L = S.lamps[(R() * n) | 0]; L.on = true; L.flash = 1; }
      for (i = 0; i < n; i++) {
        L = S.lamps[i];
        if (proc) L.on = Math.sin(t * 6.5 - L.diag * 0.5) > 0.5 || (L.on && R() < 0.3);
        else if (R() < clamp(dt * L.rate * act * (talk ? 0.45 + 1.3 * f.bands[L.band] : 1), 0, 0.9)) L.on = !L.on;
        L.flash = Math.max(0, L.flash - dt * 3);
      }
      var g = r.ctx; g.drawImage(S.bg, 0, 0);
      var lb = r.buf("mulamps", W, H), c = lb.getContext("2d"), wl = S.wall, half = S.spr[0].width / 2;
      c.globalCompositeOperation = "source-over"; c.clearRect(wl[0] - half, wl[1] - half, wl[2] + 2 * half, wl[3] + 2 * half);
      for (i = 0; i < n; i++) {
        L = S.lamps[i]; if (!L.on && L.flash < 0.05) continue;
        c.globalAlpha = clamp((L.on ? 0.8 : 0) + 0.45 * L.flash, 0, 1); c.drawImage(S.spr[L.type], L.x - half, L.y - half);
      }
      c.globalAlpha = 1;
      var tint = S.cool > 0.02 ? [[150, 215, 255], 0.45 * S.cool] : S.warm > 0.02 ? [[255, 150, 205], 0.35 * S.warm] : [[255, 196, 90], 0.4 * S.gold];
      if (tint[1] > 0.02) {
        c.globalCompositeOperation = "source-atop"; c.fillStyle = rgba(tint[0], tint[1]);
        c.fillRect(wl[0] - half, wl[1] - half, wl[2] + 2 * half, wl[3] + 2 * half); c.globalCompositeOperation = "source-over";
      }
      g.save(); g.globalCompositeOperation = "lighter"; g.drawImage(lb, 0, 0); g.restore();
      // the terminal's phosphor, with a little persistence
      var sw = S.sw, sh = S.sh, P = r.buf("muphos", sw, sh), p = P.getContext("2d"), C = S.C;
      p.globalCompositeOperation = "destination-out"; p.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.55, dt * 30)).toFixed(3) + ")"; p.fillRect(0, 0, sw, sh);
      p.globalCompositeOperation = "lighter";
      var fs = Math.max(10, sh * 0.042), x0 = sw * 0.07, y0 = sh * 0.1, mono = "'Cascadia Mono','Consolas','Lucida Console','Courier New',monospace";
      p.textBaseline = "middle"; p.textAlign = "left"; p.fillStyle = rgba(C, 0.95);
      p.font = "700 " + fs.toFixed(1) + "px " + mono; p.fillText("MU/TH/UR 6000", x0, y0);
      p.font = "400 " + fs.toFixed(1) + "px " + mono;
      var typed = clamp(Math.floor((t - S.typeT) * 34), 0, S.READY.length), line = S.READY.slice(0, typed);
      p.fillStyle = rgba(C, 0.85); p.fillText(line, x0, y0 + fs * 1.6);
      if (typed < S.READY.length || (t * 1.6) % 1 < 0.55) {
        var cwid = p.measureText("M").width; p.fillStyle = rgba(C, 0.9);
        p.fillRect(x0 + p.measureText(line).width + cwid * 0.2, y0 + fs * 1.6 - fs * 0.5, cwid * 0.9, fs * 1.0);
      }
      p.fillStyle = rgba(C, 0.35); p.fillRect(x0, y0 + fs * 2.7, sw * 0.86, Math.max(1, u));
      // the foot: a live trace of the voice, or a progress row while it thinks
      var fy = sh * 0.9, fx0 = x0, fx1 = sw * 0.93, amp = sh * 0.05;
      p.fillStyle = rgba(C, 0.45); p.font = "600 " + (fs * 0.62).toFixed(1) + "px " + mono; p.fillText(proc ? "COMPUTING" : "AUDIO I/O", fx0, fy - amp * 1.9);
      if (proc) {
        var nb = 24, bw = (fx1 - fx0) / nb, lit = Math.floor((t * 12) % (nb + 6));
        for (i = 0; i < nb; i++) { p.fillStyle = rgba(C, i <= lit ? 0.85 : 0.14); p.fillRect(fx0 + i * bw + bw * 0.15, fy - amp * 0.35, bw * 0.7, amp * 0.7); }
      } else {
        var wv = f.wave, gn = talk ? 2.4 : 0.5;
        p.beginPath();
        for (i = 0; i < 200; i++) { var xx = fx0 + (fx1 - fx0) * i / 199, yv = fy - Math.tanh(wv[(i * 1.28) | 0] * gn) * amp; if (i) p.lineTo(xx, yv); else p.moveTo(xx, yv); }
        p.strokeStyle = rgba(C, 0.85); p.lineWidth = 1.6 * u; p.stroke();
      }
      var flick = 0.93 + 0.07 * noise1(t * 23);
      g.save(); roundRect(g, S.sx, S.sy, sw, sh, S.cr); g.clip();
      g.globalCompositeOperation = "lighter"; g.globalAlpha = flick; g.drawImage(P, S.sx, S.sy);
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.glass, S.sx, S.sy);
      g.restore();
      var bl = r.buf("mubloom", W, H), bc = bl.getContext("2d");
      bc.globalCompositeOperation = "source-over"; bc.clearRect(0, 0, W, H); bc.drawImage(P, S.sx, S.sy);
      bc.globalCompositeOperation = "lighter"; bc.globalAlpha = 0.7; bc.drawImage(lb, 0, 0); bc.globalAlpha = 1;
      r.bloom(bl, 0.75 + 0.5 * lv, 0.02, 2);
    }
  });

  /* ---------- Light Cycles \u2014 the Grid from Tron: two cycles race an arena and write your voices as walls of light ----------
     Cyan is you, orange is the assistant. Whoever is speaking rides fast and turns 90 degrees on their syllables, and the wall behind
     each cycle is as tall as that voice was loud, so the trails are the conversation's waveform in 3-D. Walls fade after six
     seconds. While it thinks, both slow down and gold rings pulse out across the floor. The grid itself is static, so it
     is drawn once; only the walls, the cycles and their glow are drawn per frame. */
  register({
    id: "light-cycles", name: "Light Cycles", layout: "top", text: "tron", hiDpi: true,
    blurb: "Tron's Grid. Two light cycles, cyan for you and orange for the assistant, turn on every syllable and leave walls shaped like your voices.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, i, k;
      S.hy = H * 0.38; S.hc = 14; S.cx = W / 2; S.fp = (H - S.hy) * 10 / S.hc;     // the floor at z = 10 meets the bottom edge
      S.A = 19; S.z0 = 10.6; S.z1 = 46; S.LIFE = 6; S.R = rng(1982); S.rings = 0;   // the arena fills the floor in front of you
      var D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      S.D = D;
      function cyc(x, z, dir, col) { return { x: x, z: z, dir: dir, col: col, trail: [], lastTurn: -9, next: 0, sampled: -9, flash: 0 }; }
      S.cyc = [cyc(-7, 15, 0, [90, 225, 255]), cyc(7, 34, 2, [255, 150, 40])];
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), hy = S.hy;
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      var sky = g.createLinearGradient(0, hy - H * 0.25, 0, hy);
      sky.addColorStop(0, "rgba(0,40,70,0)"); sky.addColorStop(1, "rgba(0,70,110,0.35)");
      g.fillStyle = sky; g.fillRect(0, hy - H * 0.25, W, H * 0.25);
      var fl = g.createLinearGradient(0, hy, 0, H); fl.addColorStop(0, "#001426"); fl.addColorStop(0.3, "#000a14"); fl.addColorStop(1, "#000308");
      g.fillStyle = fl; g.fillRect(0, hy, W, H - hy);
      function P(x, z) { return [S.cx + S.fp * x / z, hy + S.fp * S.hc / z]; }
      // grid: lines across (constant z) fade with distance; lines along (constant x) fade toward the horizon
      var step = 2;
      for (k = 10; k < 170; k += step) {
        var y = P(0, k)[1], a = clamp(0.5 * Math.pow(10 / k, 0.9), 0.03, 0.5);
        g.fillStyle = "rgba(40,150,255," + a.toFixed(3) + ")"; g.fillRect(0, y - 0.6 * u, W, Math.max(1, 1.2 * u));
      }
      var along = g.createLinearGradient(0, hy, 0, H); along.addColorStop(0, "rgba(40,150,255,0)"); along.addColorStop(0.2, "rgba(40,150,255,0.14)"); along.addColorStop(1, "rgba(40,150,255,0.5)");
      g.strokeStyle = along; g.lineWidth = Math.max(1, 1.2 * u); g.beginPath();
      for (i = -40; i <= 40; i++) { var x = i * step, n = P(x, 10), fz = P(x, 170); g.moveTo(n[0], n[1]); g.lineTo(fz[0], fz[1]); }
      g.stroke();
      // the arena's edge
      var c = [P(-S.A, S.z0), P(S.A, S.z0), P(S.A, S.z1), P(-S.A, S.z1)];
      g.save(); g.shadowColor = "rgba(80,200,255,0.9)"; g.shadowBlur = 10 * u;
      g.beginPath(); g.moveTo(c[0][0], c[0][1]); for (i = 1; i < 4; i++) g.lineTo(c[i][0], c[i][1]); g.closePath();
      g.strokeStyle = "rgba(120,220,255,0.85)"; g.lineWidth = 2 * u; g.stroke(); g.restore();
      g.fillStyle = "rgba(160,235,255,0.9)"; g.fillRect(0, hy - 0.7 * u, W, Math.max(1, 1.4 * u));
      S.bg = bg;
      S.spr = S.cyc.map(function (cy) { return dotSprite(Math.ceil(130 * u), cy.col, [255, 255, 255]); });
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, D = S.D, i, j;
      var proc = st === "processing", hy = S.hy, cx = S.cx, fp = S.fp, hc = S.hc;
      function PX(x, z) { return cx + fp * x / z; }
      function PY(y, z) { return hy + fp * (hc - y) / z; }
      function free(cy, dir, ahead) {
        var nx = cy.x + D[dir][0] * ahead, nz = cy.z + D[dir][1] * ahead;
        return nx > -S.A + 0.5 && nx < S.A - 0.5 && nz > S.z0 + 0.5 && nz < S.z1 - 0.5;
      }
      function turn(cy) {
        var l = (cy.dir + 3) % 4, rt = (cy.dir + 1) % 4, fl = free(cy, l, 2.5), fr = free(cy, rt, 2.5);
        cy.dir = fl && fr ? (R() < 0.5 ? l : rt) : fl ? l : fr ? rt : (cy.dir + 2) % 4;
        cy.lastTurn = t; cy.trail.push({ x: cy.x, z: cy.z, h: cy.trail.length ? cy.trail[cy.trail.length - 1].h : 0.4, t: t });
      }
      for (i = 0; i < 2; i++) {
        var cy = S.cyc[i], active = (st === "listening" && i === 0) || (st === "responding" && i === 1);
        var spd = active ? 6 + 14 * lv : proc ? 4 : 3.4, h = active ? 0.5 + 6 * lv : proc ? 0.7 : 0.55;
        if (!cy.next) cy.next = t + 1 + R() * 2;
        if (active && f.onset && t - cy.lastTurn > 0.32) { turn(cy); cy.flash = 1; }
        else if (!active && t > cy.next) { turn(cy); cy.next = t + (proc ? 0.8 : 1.2) + R() * 1.6; }
        if (!free(cy, cy.dir, 0.6)) turn(cy);
        cy.x += D[cy.dir][0] * spd * dt; cy.z += D[cy.dir][1] * spd * dt;
        cy.x = clamp(cy.x, -S.A + 0.3, S.A - 0.3); cy.z = clamp(cy.z, S.z0 + 0.3, S.z1 - 0.3);
        cy.h = follow(cy.h || 0.4, h, 0.5, 0.2, dt);
        if (t - cy.sampled > 1 / 30) { cy.trail.push({ x: cy.x, z: cy.z, h: cy.h, t: t }); cy.sampled = t; }
        while (cy.trail.length > 2 && t - cy.trail[1].t > S.LIFE) cy.trail.shift();
        cy.flash = Math.max(0, cy.flash - dt * 4);
      }
      var g = r.ctx; g.drawImage(S.bg, 0, 0);
      var sc = r.buf("lcglow", W, H), q = sc.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, W, H); q.globalCompositeOperation = "lighter";
      // gold rings rolling out across the floor while it thinks
      S.rings = follow(S.rings, proc ? 1 : 0, 0.08, 0.05, dt);
      if (S.rings > 0.02) {
        for (j = 0; j < 2; j++) {
          var ph = ((t * 0.55 + j * 0.5) % 1), rad = 2 + ph * 30, zc = (S.z0 + S.z1) / 2;
          q.beginPath();
          for (i = 0; i <= 72; i++) { var an = i / 72 * TAU, wx = Math.cos(an) * rad, wz = zc + Math.sin(an) * rad * 0.6; if (wz < 10.5) wz = 10.5; if (i) q.lineTo(PX(wx, wz), PY(0, wz)); else q.moveTo(PX(wx, wz), PY(0, wz)); }
          q.strokeStyle = rgba([255, 200, 90], 0.55 * (1 - ph) * S.rings); q.lineWidth = 2.2 * u; q.stroke();
        }
      }
      // walls of light: bucketed by age so each bucket is one fill + one stroke
      for (i = 0; i < 2; i++) {
        var cyc = S.cyc[i], tr = cyc.trail.concat([{ x: cyc.x, z: cyc.z, h: cyc.h, t: t }]), B = 5, fills = [], tops = [], k;
        for (k = 0; k < B; k++) { fills.push(new Path2D()); tops.push(new Path2D()); }
        for (j = 1; j < tr.length; j++) {
          var p0 = tr[j - 1], p1 = tr[j], life = 1 - (t - p1.t) / S.LIFE;
          if (life <= 0) continue;
          var bk = Math.min(B - 1, (life * B) | 0);
          var ax = PX(p0.x, p0.z), ay = PY(0, p0.z), bx = PX(p1.x, p1.z), by = PY(0, p1.z), ty0 = PY(p0.h, p0.z), ty1 = PY(p1.h, p1.z);
          fills[bk].moveTo(ax, ay); fills[bk].lineTo(bx, by); fills[bk].lineTo(bx, ty1); fills[bk].lineTo(ax, ty0); fills[bk].closePath();
          tops[bk].moveTo(ax, ty0); tops[bk].lineTo(bx, ty1); tops[bk].moveTo(ax, ay); tops[bk].lineTo(bx, by);
        }
        var col = cyc.col, hot = mixc(col, [255, 255, 255], 0.55);
        q.lineCap = "round"; q.lineJoin = "round";
        for (k = 0; k < B; k++) {
          var a = (k + 0.5) / B;
          q.fillStyle = rgba(col, 0.3 * a); q.fill(fills[k]);
          q.strokeStyle = rgba(hot, 0.95 * a); q.lineWidth = 2.2 * u; q.stroke(tops[k]);
        }
        // the cycle: a hot streak, its glow, and a pool of light on the floor
        var d = D[cyc.dir], zz = cyc.z, sx = PX(cyc.x, zz), sy = PY(0.45, zz), bxk = PX(cyc.x - d[0] * 1.3, cyc.z - d[1] * 1.3), byk = PY(0.45, cyc.z - d[1] * 1.3);
        var sz = 10 / zz, pool = q.createRadialGradient(sx, PY(0, zz), 0, sx, PY(0, zz), 110 * u * sz);
        pool.addColorStop(0, rgba(col, 0.32 + 0.3 * cyc.flash)); pool.addColorStop(1, rgba(col, 0));
        q.save(); q.translate(sx, PY(0, zz)); q.scale(1, 0.32); q.translate(-sx, -PY(0, zz));
        q.fillStyle = pool; q.beginPath(); q.arc(sx, PY(0, zz), 110 * u * sz, 0, TAU); q.fill(); q.restore();
        q.beginPath(); q.moveTo(bxk, byk); q.lineTo(sx, sy); q.strokeStyle = rgba(hot, 1); q.lineWidth = 10 * u * sz + 1.5; q.stroke();
        var spr = S.spr[i], ss = spr.width * sz * (1 + 0.6 * cyc.flash);
        q.drawImage(spr, sx - ss / 2, sy - ss / 2, ss, ss);
      }
      g.save(); g.globalCompositeOperation = "lighter"; g.drawImage(sc, 0, 0); g.restore();
      r.bloom(sc, 0.7 + 0.5 * lv, 0.02, 2);
    }
  });

  /* ---------- LCARS \u2014 the Starfleet computer console from Star Trek: The Next Generation ----------
     Elbows, sidebar blocks and bar segments in the LCARS palette frame the transcript ("lcars" layout + text theme); below
     it a row of rounded bars is the live spectrum: blue while you talk, lavender while the assistant does, a gold chase while it
     thinks. Syllables flash a sidebar block and roll the readouts. The frame is drawn once; highlights sit on top of it. */
  register({
    id: "lcars", name: "LCARS", layout: "lcars", text: "lcars", hiDpi: true,
    blurb: "The Starfleet computer's LCARS console. Its bars light blue for you and lavender for the assistant, and chase in gold while it thinks.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(1701), i;
      var C = S.C = { orange: [255, 153, 102], peach: [255, 204, 153], lav: [204, 153, 204], blue: [153, 153, 255], sky: [153, 204, 255],
                      gold: [255, 204, 102], pink: [255, 153, 204], tan: [204, 153, 102], red: [204, 102, 102] };
      var mx = W * 0.035, my = H * 0.05, sw = W * 0.14, th = H * 0.065, ro = Math.min(sw * 0.85, th * 2.6), ri = th * 0.9;
      var yA = my + th + H * 0.1, yB = H - my - th - H * 0.1, xE = mx + sw + W * 0.07, gapX = W * 0.006, gapY = H * 0.012;
      S.fam = "'Antonio','Bahnschrift Condensed','Bahnschrift','Arial Narrow','Roboto Condensed',sans-serif";
      function font(q, w, px) { q.font = w + " " + px.toFixed(1) + "px " + S.fam; try { q.fontStretch = "condensed"; } catch (e) {} }
      S.font = font;
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      function elbow(top) {
        var y0 = top ? my : H - my, s = top ? 1 : -1, yEnd = top ? yA : yB;
        g.beginPath(); g.moveTo(mx, yEnd); g.lineTo(mx, y0 + s * ro); g.arcTo(mx, y0, mx + ro, y0, ro);
        g.lineTo(xE, y0); g.lineTo(xE, y0 + s * th); g.lineTo(mx + sw + ri, y0 + s * th);
        g.arcTo(mx + sw, y0 + s * th, mx + sw, y0 + s * (th + ri), ri); g.lineTo(mx + sw, yEnd); g.closePath();
      }
      elbow(true); g.fillStyle = rgba(C.orange, 1); g.fill();
      elbow(false); g.fillStyle = rgba(C.lav, 1); g.fill();
      // sidebar blocks between the elbows
      var props = [0.22, 0.12, 0.34, 0.14, 0.18], cols = [C.lav, C.peach, C.blue, C.orange, C.tan], y = yA + gapY, avail = yB - gapY - y - gapY * (props.length - 1);
      S.blocks = [];
      for (i = 0; i < props.length; i++) {
        var bh = avail * props[i]; S.blocks.push([mx, y, sw, bh, cols[i]]);
        g.fillStyle = rgba(cols[i], 1); g.fillRect(mx, y, sw, bh);
        g.fillStyle = "#000"; font(g, "600", Math.min(sw * 0.13, bh * 0.4)); g.textAlign = "right"; g.textBaseline = "bottom";
        g.fillText(("0" + ((R() * 90 + 10) | 0)).slice(-2) + "-" + (1000 + ((R() * 8999) | 0)), mx + sw - sw * 0.06, y + bh - bh * 0.08);
        y += bh + gapY;
      }
      // the top bar: segments, then the title
      font(g, "600", th * 1.18); g.textAlign = "right"; g.textBaseline = "middle"; g.fillStyle = rgba(C.orange, 1);
      var title = "VOICE INTERFACE", tw = g.measureText(title).width, tx = W - mx;
      g.fillText(title, tx, my + th * 0.54);
      function segs(x0, x1, yy, hh, parts, capRight) {
        var tot = x1 - x0 - gapX * (parts.length - 1), x = x0, out = [];
        parts.forEach(function (p, k) {
          var w = tot * p[0]; out.push([x, yy, w, hh, p[1]]);
          g.fillStyle = rgba(p[1], 1);
          if (capRight && k === parts.length - 1) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w - hh / 2, yy); g.arc(x + w - hh / 2, yy + hh / 2, hh / 2, -Math.PI / 2, Math.PI / 2); g.lineTo(x, yy + hh); g.closePath(); g.fill(); }
          else g.fillRect(x, yy, w, hh);
          x += w + gapX;
        });
        return out;
      }
      S.topSegs = segs(xE + gapX, tx - tw - W * 0.015, my, th, [[0.46, C.lav], [0.2, C.sky], [0.34, C.peach]], false);
      S.botSegs = segs(xE + gapX, W - mx, H - my - th, th, [[0.16, C.blue], [0.42, C.peach], [0.26, C.lav], [0.16, C.orange]], true);
      S.th = th; S.my = my; S.mx = mx;
      // the spectrum area
      S.vx0 = mx + sw + W * 0.045; S.vx1 = W - mx; S.vy0 = H * 0.565; S.vy1 = H - my - th - H * 0.05;
      S.N = 28; S.h = new Float32Array(S.N); S.flash = new Float32Array(props.length);
      var pitch = (S.vx1 - S.vx0) / S.N; S.pitch = pitch; S.pwid = pitch * 0.6;
      font(g, "600", H * 0.028); g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = rgba(C.orange, 1);
      g.fillText("VOICE ANALYSIS", S.vx0, S.vy0);
      g.fillStyle = rgba(C.peach, 0.9); g.fillRect(S.vx0, S.vy0 + H * 0.022, S.vx1 - S.vx0, Math.max(1, 1.5 * u));
      for (i = 0; i < S.N; i++) {                                 // dark tracks behind each bar
        var cx = S.vx0 + pitch * (i + 0.5), top = S.vy0 + H * 0.05;
        roundRect(g, cx - S.pwid / 2, top, S.pwid, S.vy1 - top, S.pwid / 2); g.fillStyle = "rgba(60,48,70,0.45)"; g.fill();
      }
      S.bg = bg; S.nums = []; S.numT = -9; S.mode = 0; S.R = rng(47);
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, C = S.C, R = S.R, i;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      var g = r.ctx; g.drawImage(S.bg, 0, 0);
      // syllables flash a sidebar block; the readouts roll with the voice
      if (f.onset && talk) S.flash[(R() * S.flash.length) | 0] = 1;
      for (i = 0; i < S.flash.length; i++) S.flash[i] = Math.max(0, S.flash[i] - dt * 3);
      if (t - S.numT > (talk ? 0.35 : proc ? 0.2 : 1.4)) {
        S.numT = t; S.nums = S.botSegs.map(function () { return ((R() * 90 + 10) | 0) + "-" + ((R() * 9000 + 1000) | 0); });
      }
      var hl = r.buf("lchl", W, H), q = hl.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, W, H);
      S.blocks.forEach(function (b, k) {
        var a = S.flash[k] * 0.55 + (proc && ((t * 5) | 0) % S.blocks.length === k ? 0.4 : 0);
        if (a > 0.01) { q.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")"; q.fillRect(b[0], b[1], b[2], b[3]); }
      });
      if (proc) S.topSegs.forEach(function (b, k) { if (((t * 4) | 0) % S.topSegs.length === k) { q.fillStyle = "rgba(255,255,255,0.35)"; q.fillRect(b[0], b[1], b[2], b[3]); } });
      g.drawImage(hl, 0, 0);
      S.font(g, "600", S.th * 0.46); g.textAlign = "right"; g.textBaseline = "bottom"; g.fillStyle = "#000";
      S.botSegs.forEach(function (b, k) { if (b[2] > S.th * 2.2 && S.nums[k]) g.fillText(S.nums[k], b[0] + b[2] - S.th * (k === S.botSegs.length - 1 ? 0.7 : 0.25), b[1] + b[3] - S.th * 0.1); });
      S.font(g, "600", H * 0.028); g.textAlign = "right"; g.textBaseline = "middle";
      g.fillStyle = rgba(proc ? C.gold : st === "responding" ? C.lav : st === "listening" ? C.sky : C.tan, 1);
      g.fillText(proc ? "COMPUTING" : st === "responding" ? "TRANSMITTING" : st === "listening" ? "RECEIVING" : "STANDBY", S.vx1, S.vy0);
      // the spectrum bars
      var top = S.vy0 + H * 0.05, span = S.vy1 - top, pw = S.pwid, bars = r.buf("lcbars", W, H), b2 = bars.getContext("2d");
      b2.globalCompositeOperation = "source-over"; b2.clearRect(S.vx0 - 4, top - 4, S.vx1 - S.vx0 + 8, span + 8);
      for (i = 0; i < S.N; i++) {
        var target;
        if (talk) {
          var bi = i / (S.N - 1) * 30, b0 = bi | 0, bv = f.bands[b0] * (1 - (bi - b0)) + f.bands[Math.min(31, b0 + 1)] * (bi - b0);
          target = clamp((bv - 0.28) / 0.72 * (0.9 + 0.3 * i / (S.N - 1)) * (0.55 + 0.6 * lv), 0, 1);
        } else if (proc) target = 0.12 + 0.72 * Math.pow(0.5 + 0.5 * Math.sin(t * 5 - i * 0.45), 4);
        else target = 0.05 + 0.05 * noise1(i * 0.8 + t * 1.2);
        S.h[i] = target > S.h[i] ? S.h[i] + (target - S.h[i]) * (1 - Math.pow(0.25, dt * 30)) : Math.max(target, S.h[i] - dt * 1.1);
        var hh = pw + (span - pw) * S.h[i], cx = S.vx0 + S.pitch * (i + 0.5);
        var col = proc ? C.gold : st === "responding" ? (i % 2 ? C.pink : C.lav) : st === "listening" ? (i % 2 ? C.blue : C.sky) : C.tan;
        roundRect(b2, cx - pw / 2, S.vy1 - hh, pw, hh, pw / 2); b2.fillStyle = rgba(col, talk || proc ? 1 : 0.55); b2.fill();
      }
      g.drawImage(bars, 0, 0);
      r.bloom(bars, 0.12 + 0.2 * lv, 0.012, 1);
    }
  });

  /* ---------- shared bits for the 1980s arcade skins: a 5x7 pixel font, pixel sprites, vector digits, CRT scanlines ----------
     Sprites are original designs drawn in the style of the era, not copies of any game's artwork. */
  var PIX_FONT = (function () {
    var src = {                                          // 7 rows per glyph, 5 bits each (MSB = leftmost), as hex pairs
      "0": "0E11131519110E", "1": "040C040404040E", "2": "0E11010204081F", "3": "1F02040201110E", "4": "02060A121F0202",
      "5": "1F101E0101110E", "6": "0608101E11110E", "7": "1F010204080808", "8": "0E11110E11110E", "9": "0E11110F01020C",
      "A": "0E1111111F1111", "B": "1E11111E11111E", "C": "0E11101010110E", "D": "1C12111111121C", "E": "1F10101E10101F",
      "F": "1F10101E101010", "G": "0E11101711110F", "H": "1111111F111111", "I": "0E04040404040E", "J": "0702020202120C",
      "K": "11121418141211", "L": "1010101010101F", "M": "111B1515111111", "N": "11111915131111", "O": "0E11111111110E",
      "P": "1E11111E101010", "Q": "0E11111115120D", "R": "1E11111E141211", "S": "0F10100E01011E", "T": "1F040404040404",
      "U": "1111111111110E", "V": "11111111110A04", "W": "1111111515150A", "X": "11110A040A1111", "Y": "1111110A040404",
      "Z": "1F01020408101F", "!": "04040404040004", "-": "0000001F000000", "<": "02040810080402", ">": "08040201020408",
      ":": "000C0C000C0C00", "=": "00001F001F0000", "?": "0E110102040004", ".": "00000000000C0C", " ": "00000000000000"
    }, out = {};
    for (var ch in src) {
      var rows = [];
      for (var i = 0; i < 7; i++) rows.push(parseInt(src[ch].substr(i * 2, 2), 16));
      out[ch] = rows;
    }
    return out;
  })();
  // Text in the 5x7 font: px = size of one font pixel. align: "left" | "center" | "right". Returns the width drawn.
  function pixText(g, text, x, y, px, color, align) {
    text = String(text).toUpperCase();
    var w = text.length * 6 * px - px, x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x, i, r, c;
    g.fillStyle = color;
    for (i = 0; i < text.length; i++) {
      var gl = PIX_FONT[text[i]] || PIX_FONT[" "];
      for (r = 0; r < 7; r++) { var bits = gl[r]; if (!bits) continue; for (c = 0; c < 5; c++) if (bits & (16 >> c)) g.fillRect(x0 + (i * 6 + c) * px, y + r * px, px, px); }
    }
    return w;
  }
  // A pixel sprite from rows of characters; pal maps a character to a colour (anything else is transparent)
  function pixSprite(rows, pal, px) {
    var h = rows.length, w = 0, i, j;
    for (i = 0; i < h; i++) w = Math.max(w, rows[i].length);
    var c = mkCanvas(w * px, h * px), g = c.getContext("2d");
    for (i = 0; i < h; i++) for (j = 0; j < rows[i].length; j++) { var col = pal[rows[i][j]]; if (col) { g.fillStyle = col; g.fillRect(j * px, i * px, px, px); } }
    return c;
  }
  // Vector digits (seven segments on a 4x6 cell), as drawn by vector-monitor games
  var VSEG = { a: [0, 0, 4, 0], b: [4, 0, 4, 3], c: [4, 3, 4, 6], d: [0, 6, 4, 6], e: [0, 3, 0, 6], f: [0, 0, 0, 3], g: [0, 3, 4, 3] };
  var VDIG = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afedcg", "7": "abc", "8": "abcdefg", "9": "abcfgd" };
  function vecText(g, text, x, y, s) {                   // s = size of one grid step; strokes into the current path
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      var segs = VDIG[text[i]] || "", ox = x + i * 6 * s;
      for (var k = 0; k < segs.length; k++) { var q = VSEG[segs[k]]; g.moveTo(ox + q[0] * s, y + q[1] * s); g.lineTo(ox + q[2] * s, y + q[3] * s); }
    }
    return text.length * 6 * s - 2 * s;
  }
  // CRT scanlines: a cached pattern laid over the frame
  function scanlines(r, alpha) {
    var S = r.S, W = r.w, H = r.h;
    if (!S.__scan) {
      var c = mkCanvas(W, H), g = c.getContext("2d"), step = Math.max(2, Math.round(3 * r.u));
      g.fillStyle = "rgba(0,0,0,1)";
      for (var y = 0; y < H; y += step) g.fillRect(0, y, W, Math.max(1, Math.round(step / 3)));
      S.__scan = c;
    }
    var gg = r.ctx; gg.save(); gg.globalAlpha = alpha; gg.drawImage(S.__scan, 0, 0); gg.restore();
  }

  /* ---------- Pac-Man: a neon maze where you drive Pac-Man and the assistant's voice turns the ghosts blue ----------
     Your syllables make Pac-Man chomp and dash through the maze eating dots, and the dots light up across the maze with the
     spectrum of whoever is speaking. When the assistant answers, Pac-Man gets a power pellet: the ghosts turn blue, flash on
     its syllables and get eaten (200, 400, 800, 1600). While it thinks, the ghosts scatter to their corners.
     The maze is an original layout in the classic style (a corridor graph, mirrored), drawn once as double-line neon walls;
     the characters are drawn as vectors every frame. */
  var PAC_HI = 10000;
  register({
    id: "pac-man", name: "Pac-Man", layout: "left", text: "arcade", hiDpi: true,
    blurb: "A neon maze. Your syllables make Pac-Man chomp and dash; when the assistant answers, the ghosts turn blue and flash with its voice.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, i, k;
      // ---- the maze: corridor rows [y, x1, x2] and columns [x, y1, y2] for the left half (x2 = 13.5 crosses the middle)
      var HR = [[1, 1, 12], [5, 1, 13.5], [8, 1, 6], [8, 9, 12], [11, 9, 13.5], [14, 0, 9], [17, 9, 13.5], [20, 1, 12], [23, 1, 3],
                [23, 6, 13.5], [26, 1, 6], [26, 9, 12], [29, 1, 13.5]];
      var VC = [[1, 1, 8], [1, 20, 23], [1, 26, 29], [3, 23, 26], [6, 1, 26], [9, 5, 8], [9, 11, 20], [9, 23, 26], [12, 1, 5],
                [12, 8, 11], [12, 20, 23], [12, 26, 29]];
      var Hs = [], Vs = [];
      HR.forEach(function (s) { if (s[2] === 13.5) Hs.push([s[0], s[1], 27 - s[1]]); else { Hs.push(s); Hs.push([s[0], 27 - s[2], 27 - s[1]]); } });
      VC.forEach(function (s) { Vs.push(s); Vs.push([27 - s[0], s[1], s[2]]); });
      var N = {}, nodes = [];
      function node(x, y) { var key = x + "," + y; if (!N[key]) { N[key] = { id: nodes.length, x: x, y: y, e: [] }; nodes.push(N[key]); } return N[key]; }
      Hs.forEach(function (s) { node(s[1], s[0]); node(s[2], s[0]); });
      Vs.forEach(function (s) { node(s[0], s[1]); node(s[0], s[2]); });
      Hs.forEach(function (h) { Vs.forEach(function (v) { if (v[0] >= h[1] && v[0] <= h[2] && h[0] >= v[1] && h[0] <= v[2]) node(v[0], h[0]); }); });
      var edges = [];
      function link(a, b, wrap) { var e = { a: a, b: b, len: wrap ? 3 : Math.abs(a.x - b.x) + Math.abs(a.y - b.y), wrap: !!wrap }; edges.push(e); a.e.push(e); b.e.push(e); }
      Hs.forEach(function (h) {
        var row = nodes.filter(function (n) { return n.y === h[0] && n.x >= h[1] && n.x <= h[2]; }).sort(function (a, b) { return a.x - b.x; });
        for (i = 1; i < row.length; i++) link(row[i - 1], row[i]);
      });
      Vs.forEach(function (v) {
        var col = nodes.filter(function (n) { return n.x === v[0] && n.y >= v[1] && n.y <= v[2]; }).sort(function (a, b) { return a.y - b.y; });
        for (i = 1; i < col.length; i++) link(col[i - 1], col[i]);
      });
      link(N["0,14"], N["27,14"], true);                                      // the tunnel
      S.N = N; S.edges = edges; S.R = rng(1980);
      // ---- geometry: the maze fills the right of the screen; the transcript takes the left
      var rx = W * 0.545, rw = W * 0.43, T = Math.min(rw / 28, H * 0.9 / 34);
      S.T = T; S.ox = rx + (rw - 28 * T) / 2; S.oy = (H - 34 * T) / 2 + 2.3 * T;
      function X(x) { return S.ox + (x + 0.5) * T; }
      function Y(y) { return S.oy + (y + 0.5) * T; }
      S.X = X; S.Y = Y;
      // ---- walls: stroke every corridor wide in blue, then narrower in black -> double-line walls with round corners
      function wallLayer(col) {
        var c = mkCanvas(W, H), g = c.getContext("2d"), p = new Path2D(), lw = Math.max(1.4, 0.13 * T), cw = 1.72 * T;
        g.fillStyle = "#000"; g.fillRect(0, 0, W, H);                         // opaque: this layer repaints the whole frame
        Hs.forEach(function (h) { var x1 = h[1] === 0 ? -1.6 : h[1], x2 = h[2] === 27 ? 28.6 : h[2]; p.moveTo(X(x1), Y(h[0])); p.lineTo(X(x2), Y(h[0])); });
        Vs.forEach(function (v) { p.moveTo(X(v[0]), Y(v[1])); p.lineTo(X(v[0]), Y(v[2])); });
        g.lineCap = "round"; g.lineJoin = "round";
        g.strokeStyle = col; g.lineWidth = lw;                                // the outer wall
        roundRect(g, X(-0.85), Y(-0.85), 28.7 * T, 31.7 * T, 0.9 * T); g.stroke();
        g.lineWidth = cw + 2 * lw; g.stroke(p);
        g.strokeStyle = "#000"; g.lineWidth = cw; g.stroke(p);
        g.fillStyle = "#000"; g.fillRect(X(-3), Y(14) - cw / 2, 3.2 * T, cw); g.fillRect(X(27.8), Y(14) - cw / 2, 3.2 * T, cw);   // tunnel mouths
        g.strokeStyle = col; g.lineWidth = lw;                                // the ghost house, with its door
        roundRect(g, X(10.1), Y(12.2), 6.8 * T, 3.6 * T, 0.35 * T); g.stroke();
        roundRect(g, X(10.1) + 2 * lw, Y(12.2) + 2 * lw, 6.8 * T - 4 * lw, 3.6 * T - 4 * lw, 0.25 * T); g.stroke();
        g.fillStyle = "#000"; g.fillRect(X(12.6), Y(12.2) - lw, 1.8 * T, 4 * lw);
        g.fillStyle = "#ffb8de"; g.fillRect(X(12.6), Y(12.2) + 0.2 * lw, 1.8 * T, 1.6 * lw);
        return c;
      }
      function glowOf(src) { var c = mkCanvas(W, H), g = c.getContext("2d"); g.filter = "blur(" + Math.max(1.5, 0.28 * T).toFixed(1) + "px)"; g.drawImage(src, 0, 0); g.filter = "none"; return c; }
      S.bg = wallLayer("#2d3cff"); S.bgFlash = wallLayer("#e8ecff");
      S.glow = glowOf(S.bg); S.glowFlash = glowOf(S.bgFlash);             // the neon glow is blurred once, not every frame
      // ---- dots (none around the ghost house or in the tunnel) and the four power pellets
      S.dots = []; S.dotAt = {};
      function dot(x, y) {
        var key = x + "," + y;
        if (S.dotAt[key] || x < 1 || x > 26 || (y >= 10 && y <= 18 && x !== 6 && x !== 21)) return;
        var d = { x: x, y: y, alive: true, big: (x === 1 || x === 26) && (y === 3 || y === 23) };
        S.dotAt[key] = d; S.dots.push(d);
      }
      Hs.forEach(function (h) { for (k = Math.ceil(h[1]); k <= h[2]; k++) dot(k, h[0]); });
      Vs.forEach(function (v) { for (k = v[1]; k <= v[2]; k++) dot(v[0], k); });
      S.left = S.dots.length; S.score = 0; S.popups = []; S.flashUntil = 0; S.flashDone = 0; S.dying = 0; S.readyUntil = 0; S.power = false;
      S.eatMul = 200; S.lastState = "";
      // ---- characters
      function onEdge(ax, ay, bx, by, d, fwd) {
        var A = N[ax + "," + ay], B = N[bx + "," + by];
        // d = distance from A; fwd = heading for B. An actor's d counts from the node it set out from.
        for (var j = 0; j < A.e.length; j++) { var e = A.e[j]; if ((e.a === A && e.b === B) || (e.b === A && e.a === B)) return { e: e, fwd: (e.a === A) === fwd, d: fwd ? d : e.len - d }; }
        return null;
      }
      S.onEdge = onEdge;
      S.reset = function () {
        var p = onEdge(12, 23, 15, 23, 1.5, true);
        S.pac = { e: p.e, fwd: true, d: p.d, x: 13.5, y: 23, dx: 1, dy: 0, chomp: 0, dash: 0 };
        var cols = [[255, 32, 32], [255, 184, 255], [40, 255, 255], [255, 184, 82]];
        S.ghosts = cols.map(function (c, j) {
          var gh = { col: c, i: j, mode: j === 0 ? "out" : "house", hx: [13.5, 11.5, 13.5, 15.5][j], hy: j === 0 ? 11 : 14, x: 0, y: 0, dx: -1, dy: 0,
                     release: [0, 1.5, 4, 6.5][j], flash: 0, fright: false, e: null, fwd: true, d: 0, bob: j * 1.3 };
          if (j === 0) { var q = onEdge(12, 11, 15, 11, 1.5, false); gh.e = q.e; gh.fwd = q.fwd; gh.d = q.d; }
          gh.x = gh.hx; gh.y = gh.hy;
          return gh;
        });
        S.born = -1;
      };
      S.reset();
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, st = f.state, lv = f.level, T = S.T, X = S.X, Y = S.Y, R = S.R, i, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing";
      if (S.born < 0) { S.born = t; S.readyUntil = t + 1.2; }
      // ---- the assistant's turn = power mode
      if (reply && !S.power) { S.power = true; S.eatMul = 200; S.ghosts.forEach(function (g) { if (g.mode !== "eyes") { g.fright = true; if (g.mode === "out") { g.fwd = !g.fwd; g.d = g.e.len - g.d; } } }); }
      if (!reply && S.power) { S.power = false; S.ghosts.forEach(function (g) { g.fright = false; }); }
      if (f.onset && reply) S.ghosts.forEach(function (g) { if (g.fright) g.flash = 1; });
      var P = S.pac, frozen = t < S.readyUntil || S.dying || t < S.flashUntil;
      function pos(a) {                                                      // an actor's tile position along its edge
        var e = a.e, fr = a.d / e.len;
        if (e.wrap) {                                                        // off one edge of the maze and in at the other
          var left = a.fwd === (e.a.x === 0), x = left ? -a.d : 27 + a.d;
          if (x < -1.5) x += 30; if (x > 28.5) x -= 30;
          a.x = x; a.y = 14; a.dx = left ? -1 : 1; a.dy = 0; return;
        }
        var A = a.fwd ? e.a : e.b, B = a.fwd ? e.b : e.a;
        a.x = A.x + (B.x - A.x) * fr; a.y = A.y + (B.y - A.y) * fr; a.dx = Math.sign(B.x - A.x); a.dy = Math.sign(B.y - A.y);
      }
      function advance(a, dist, choose) {
        a.d += dist;
        while (a.d >= a.e.len) {
          var at = a.fwd ? a.e.b : a.e.a, left = a.d - a.e.len, from = a.e, opts = at.e.filter(function (e) { return e !== from; });
          if (!opts.length) opts = at.e;
          var ne = choose(at, opts, from);
          a.e = ne; a.fwd = ne.a === at; a.d = left;
        }
        pos(a);
      }
      function far(e, at) { return e.a === at ? e.b : e.a; }
      function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
      // ---- Pac-Man: dots ahead, keep away from hunting ghosts, chase blue ones
      if (!frozen) {
        P.dash = Math.max(0, P.dash - dt);
        if (listen && f.onset) { P.dash = 0.35; P.chomp += 0.6; }
        var spd = (listen ? 5.5 + 6 * lv : reply ? 7 + 3 * lv : think ? 4 : 5) * (P.dash > 0 ? 1.45 : 1);
        advance(P, spd * dt, function (at, opts) {
          var best = null, bs = -1e9;
          opts.forEach(function (e) {
            var to = far(e, at), sc = R() * 2, n = 0;
            if (!e.wrap) for (k = 0; k <= e.len; k++) { var dd = S.dotAt[Math.round(at.x + Math.sign(to.x - at.x) * k) + "," + Math.round(at.y + Math.sign(to.y - at.y) * k)]; if (dd && dd.alive) n++; }
            sc += n * 3;
            S.ghosts.forEach(function (g) {
              if (g.mode !== "out") return;
              var d = Math.sqrt(dist2(to.x, to.y, g.x, g.y));
              if (g.fright) sc += 40 / (1 + d); else if (d < 6) sc -= 90 / (1 + d);
            });
            if (sc > bs) { bs = sc; best = e; }
          });
          return best;
        });
        P.chomp += dt * spd * 1.6;
        var key = Math.round(P.x) + "," + Math.round(P.y), dt0 = S.dotAt[key];
        if (dt0 && dt0.alive && dist2(P.x, P.y, dt0.x, dt0.y) < 0.2) {
          dt0.alive = false; S.left--; S.score += dt0.big ? 50 : 10;
          if (!S.left) { S.flashUntil = t + 2.2; S.flashDone = t + 2.2; }
        }
      }
      if (S.flashDone && t >= S.flashDone) { S.flashDone = 0; S.dots.forEach(function (d) { d.alive = true; }); S.left = S.dots.length; S.reset(); S.readyUntil = t + 1.2; }
      // ---- ghosts: classic targeting (chase / scatter / frightened / eyes home)
      var corners = [[25, -3], [2, -3], [27, 32], [0, 32]];
      S.ghosts.forEach(function (g, j) {
        g.flash = Math.max(0, g.flash - dt * 3);
        if (frozen) return;
        if (g.mode === "house") {                                           // bob in the house, then leave through the door
          g.y = 14 + Math.sin((t + g.bob) * 5) * 0.35;
          if (t - S.born > g.release) g.mode = "leaving";
          return;
        }
        if (g.mode === "leaving") {
          var sp = 3 * dt;
          if (Math.abs(g.x - 13.5) > 0.05) g.x += Math.sign(13.5 - g.x) * Math.min(sp, Math.abs(13.5 - g.x));
          else if (g.y > 11) g.y = Math.max(11, g.y - sp);
          else { var q = S.onEdge(12, 11, 15, 11, 1.5, R() < 0.5); g.e = q.e; g.fwd = q.fwd; g.d = q.d; g.mode = "out"; g.fright = S.power; }
          g.dx = 0; g.dy = -1;
          return;
        }
        var speed = g.mode === "eyes" ? 11 : g.fright ? 3.4 : think ? 4.6 : 5.2 + (listen ? 1.2 * lv : 0);
        var tx, ty;
        if (g.mode === "eyes") { tx = 13.5; ty = 11; }
        else if (think || st === "idle") { tx = corners[j][0]; ty = corners[j][1]; }
        else if (j === 0) { tx = P.x; ty = P.y; }
        else if (j === 1) { tx = P.x + 4 * P.dx; ty = P.y + 4 * P.dy; }
        else if (j === 2) { tx = 2 * (P.x + 2 * P.dx) - S.ghosts[0].x; ty = 2 * (P.y + 2 * P.dy) - S.ghosts[0].y; }
        else { if (dist2(g.x, g.y, P.x, P.y) > 64) { tx = P.x; ty = P.y; } else { tx = corners[3][0]; ty = corners[3][1]; } }
        advance(g, speed * dt, function (at, opts) {
          if (g.fright && g.mode === "out") return opts[(R() * opts.length) | 0];
          var best = opts[0], bd = 1e9;
          opts.forEach(function (e) { var to = far(e, at), d = e.wrap ? 1e6 : dist2(to.x, to.y, tx, ty); if (d < bd) { bd = d; best = e; } });
          return best;
        });
        if (g.mode === "eyes" && Math.abs(g.y - 11) < 0.3 && Math.abs(g.x - 13.5) < 0.6) { g.mode = "leaving"; g.x = 13.5; g.y = 12.5; g.fright = false; }
      });
      // ---- meetings: eat a blue ghost, or lose a life to a hunting one
      if (!frozen) S.ghosts.forEach(function (g) {
        if (g.mode !== "out" || dist2(g.x, g.y, P.x, P.y) > 0.6) return;
        if (g.fright) {
          g.mode = "eyes"; g.fright = false; S.score += S.eatMul;
          S.popups.push({ x: g.x, y: g.y, txt: String(S.eatMul), t: t }); S.eatMul = Math.min(1600, S.eatMul * 2);
        } else if (!S.dying) S.dying = t;
      });
      if (S.dying && t - S.dying > 1.95) { S.dying = 0; S.reset(); S.readyUntil = t + 1.2; }
      PAC_HI = Math.max(PAC_HI, S.score);
      // ---- draw: walls, dots, characters, header
      var g0 = r.ctx, fl = t < S.flashUntil && Math.floor((S.flashUntil - t) * 4) % 2 === 0;
      g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1;
      g0.drawImage(fl ? S.bgFlash : S.bg, 0, 0);
      g0.globalCompositeOperation = "lighter"; g0.globalAlpha = clamp(0.55 + 0.6 * lv, 0, 1);   // the walls glow brighter with the voice
      g0.drawImage(fl ? S.glowFlash : S.glow, 0, 0);
      g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1;
      var sc = r.buf("pacdyn", W, H), q = sc.getContext("2d");               // dots + characters, bloomed on their own
      q.globalCompositeOperation = "source-over"; q.globalAlpha = 1; q.clearRect(0, 0, W, H);
      var bands = f.bands, amp = 0.35 + 0.65 * lv, lvlPaths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()], ds = 0.24 * T;
      var pelOn = Math.floor(t * 5) % 2 === 0 || reply;
      for (i = 0; i < S.dots.length; i++) {
        var d = S.dots[i];
        if (!d.alive) continue;
        var bv = clamp((bands[Math.min(31, (d.x / 27 * 31) | 0)] - 0.3) / 0.7, 0, 1) * amp, li = Math.min(4, (bv * 5) | 0);
        if (d.big) {
          if (!pelOn) continue;
          var pr = T * (0.42 + 0.25 * lv + (reply ? 0.12 * Math.sin(t * 12) : 0));
          q.fillStyle = "#ffcfc0"; q.beginPath(); q.arc(X(d.x), Y(d.y), pr, 0, TAU); q.fill();
          continue;
        }
        var s2 = ds * (1 + 0.5 * bv);
        lvlPaths[li].rect(X(d.x) - s2 / 2, Y(d.y) - s2 / 2, s2, s2);
      }
      for (k = 0; k < 5; k++) { q.fillStyle = rgba(mixc([255, 184, 174], [255, 255, 255], k / 5), 0.62 + k * 0.095); q.fill(lvlPaths[k]); }
      // clip characters to the maze so the tunnel hides them
      q.save(); q.beginPath(); q.rect(X(-0.5), Y(-1), 28 * T, 33 * T); q.clip();
      S.ghosts.forEach(function (g) { if (!(S.dying && t - S.dying > 0.5)) drawGhost(q, X(g.x), Y(g.y), 0.82 * T, g, t); });
      if (S.dying) drawPacDeath(q, X(P.x), Y(P.y), 0.8 * T, (t - S.dying) / 1.5);
      else {
        var mouth = 0.04 + 0.62 * Math.abs(Math.sin(P.chomp * 2.2)), ang = Math.atan2(P.dy, P.dx);
        if (frozen && t < S.readyUntil) mouth = 0.5;
        q.fillStyle = "#ffff2a"; q.beginPath(); q.moveTo(X(P.x), Y(P.y)); q.arc(X(P.x), Y(P.y), 0.8 * T * (1 + 0.06 * (P.dash > 0)), ang + mouth, ang + TAU - mouth); q.closePath(); q.fill();
      }
      q.restore();
      g0.drawImage(sc, 0, 0);
      r.bloom(sc, 0.45 + 0.45 * lv, 0.007, 2);
      // text and lives go on after the glow so they stay crisp: popups, READY!, the header
      var px = T * 0.12;
      S.popups = S.popups.filter(function (p) { return t - p.t < 1.1; });
      S.popups.forEach(function (p) { pixText(g0, p.txt, X(p.x), Y(p.y) - 3.5 * px, px, "#39e6ff", "center"); });
      if (t < S.readyUntil) pixText(g0, "READY!", X(13.5), Y(17) - 3.5 * px, px, "#ffff2a", "center");
      if (Math.floor(t * 3) % 2 === 0) pixText(g0, "1UP", X(3.5), Y(-2.6), px, "#fff", "center");
      pixText(g0, String(S.score).padStart(2, "0"), X(5.5), Y(-1.6), px, "#fff", "right");
      pixText(g0, "HIGH SCORE", X(13.5), Y(-2.6), px, "#fff", "center");
      pixText(g0, String(PAC_HI), X(15.5), Y(-1.6), px, "#fff", "right");
      for (k = 0; k < 2; k++) { var lx = X(1.5 + k * 2), ly = Y(31.1); g0.fillStyle = "#ffff2a"; g0.beginPath(); g0.moveTo(lx, ly); g0.arc(lx, ly, 0.62 * T, Math.PI + 0.6, Math.PI + TAU - 0.6); g0.closePath(); g0.fill(); }
      scanlines(r, 0.1);

      function drawGhost(q, x, y, s, g, t) {
        var eyes = g.mode === "eyes", blue = g.fright, wht = blue && g.flash > 0.5;
        if (!eyes) {
          q.fillStyle = blue ? (wht ? "#e9e9ff" : "#2424ff") : rgba(g.col, 1);
          q.beginPath(); q.arc(x, y - 0.12 * s, 0.9 * s, Math.PI, 0);
          var base = y + 0.82 * s, n = 4, w = 1.8 * s / n, ph = Math.floor(t * 8 + g.i) % 2 ? 0.5 : 0;
          q.lineTo(x + 0.9 * s, base);
          for (var j = 0; j < n; j++) {
            var xr = x + 0.9 * s - j * w;
            q.lineTo(xr - (0.5 + ph * 0.5) * w * 0.5, base - 0.3 * s * (ph ? 1 : 0.6));
            q.lineTo(xr - w, base);
          }
          q.closePath(); q.fill();
        }
        if (blue && !eyes) {                                               // frightened face
          q.fillStyle = wht ? "#ff2020" : "#ffc8b8";
          q.fillRect(x - 0.38 * s, y - 0.28 * s, 0.2 * s, 0.2 * s); q.fillRect(x + 0.18 * s, y - 0.28 * s, 0.2 * s, 0.2 * s);
          q.beginPath(); for (var m = 0; m <= 6; m++) { var mx = x - 0.6 * s + m * 0.2 * s, my = y + 0.3 * s + (m % 2 ? -0.1 : 0.1) * s; if (m) q.lineTo(mx, my); else q.moveTo(mx, my); }
          q.strokeStyle = q.fillStyle; q.lineWidth = Math.max(1, 0.1 * s); q.stroke();
          return;
        }
        var ex = g.dx * 0.12 * s, ey = g.dy * 0.14 * s;
        for (var ei = -1; ei <= 1; ei += 2) {
          q.fillStyle = "#fff"; q.beginPath(); q.ellipse(x + ei * 0.34 * s + ex * 0.5, y - 0.2 * s + ey * 0.5, 0.24 * s, 0.3 * s, 0, 0, TAU); q.fill();
          q.fillStyle = "#1f38ff"; q.beginPath(); q.arc(x + ei * 0.34 * s + ex * 1.4, y - 0.2 * s + ey * 1.4, 0.13 * s, 0, TAU); q.fill();
        }
      }
      function drawPacDeath(q, x, y, rad, p) {
        if (p < 1) { var m = 0.3 + (Math.PI - 0.3) * p, a = -Math.PI / 2; q.fillStyle = "#ffff2a"; q.beginPath(); q.moveTo(x, y); q.arc(x, y, rad, a + m, a + TAU - m); q.closePath(); q.fill(); }
        else if (p < 1.25) {
          q.strokeStyle = "#ffff2a"; q.lineWidth = Math.max(1, rad * 0.14); q.beginPath();
          for (var j = 0; j < 8; j++) { var an = j * TAU / 8, r0 = rad * 0.3, r1 = rad * (0.6 + (p - 1) * 2); q.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); q.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); }
          q.stroke();
        }
      }
    }
  });

  /* ---------- Space Invaders: you are the cannon; the assistant's voice makes the invaders dance ----------
     Your syllables make the cannon line up under the formation and fire. When the assistant answers, each column of invaders
     bobs with its slice of the spectrum, the march speeds up with its voice and its syllables rain bombs on the bunkers
     (which erode pixel by pixel); a UFO crosses on its loudest moments. The field is drawn at a low resolution, tinted by
     the coloured strips of the old cabinet screens (red UFO lane, green bunkers and cannon), then scaled up crisp with a glow.
     The invader, UFO and cannon sprites are original designs in the style of the era. */
  var INV_HI = 5000;
  register({
    id: "space-invaders", name: "Space Invaders", layout: "top", text: "arcade", hiDpi: true,
    blurb: "The cannon fires on your syllables; when the assistant answers, the invaders bob to its voice, march faster and drop bombs.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, i, j;
      S.VW = 340; S.VH = 200;
      S.s = Math.min(W * 0.94 / S.VW, H * 0.6 / S.VH);
      S.fx = Math.round((W - S.VW * S.s) / 2); S.fy = Math.round(H - S.VH * S.s - H * 0.015);
      var WH = { "#": "#fff" };
      S.types = [
        { w: 8, pts: 30, f: [pixSprite(["..####..", ".######.", "##.##.##", "########", ".#.##.#.", "#.#..#.#", ".#....#.", "........"], WH, 1),
                             pixSprite(["..####..", ".######.", "##.##.##", "########", ".##..##.", "#..##..#", "##....##", "........"], WH, 1)] },
        { w: 11, pts: 20, f: [pixSprite(["...#...#...", "....#.#....", "..#######..", ".##.#.#.##.", "###########", ".#########.", ".#.#...#.#.", "#.#.....#.#"], WH, 1),
                              pixSprite(["...#...#...", "#...#.#...#", "#.#######.#", "###.#.#.###", "###########", "..#######..", "..#.....#..", ".#.......#."], WH, 1)] },
        { w: 12, pts: 10, f: [pixSprite(["....####....", "..########..", ".##########.", "##..####..##", "############", "..#.#..#.#..", ".#..#..#..#.", "#..#....#..#"], WH, 1),
                              pixSprite(["....####....", "..########..", ".##########.", "##..####..##", "############", ".#..#..#..#.", "#..#....#..#", ".#........#."], WH, 1)] }
      ];
      S.rowType = [0, 1, 1, 2, 2];
      S.cannonSpr = pixSprite(["......#......", ".....###.....", ".....###.....", ".###########.", "#############", "#############", "#############", "#############"], WH, 1);
      S.ufoSpr = pixSprite([".....######.....", "...##########...", "..############..", ".##.##.##.##.##.", "################", "..###..##..###..", "...#........#..."], WH, 1);
      S.boomSpr = pixSprite(["....#...#....", ".#...#.#...#.", "..#.......#..", "...#.....#...", "##.........##", "...#.....#...", "..#.#...#.#..", ".#...#.#...#."], WH, 1);
      S.bombSpr = [pixSprite([".#.", "#..", ".#.", "..#", ".#.", "#..", ".#."], WH, 1), pixSprite([".#.", "..#", ".#.", "#..", ".#.", "..#", ".#."], WH, 1)];
      S.R = rng(1978);
      var R = S.R;
      S.deadSpr = [0, 1].map(function () { var rows = []; for (var y = 0; y < 8; y++) { var s = ""; for (var x = 0; x < 15; x++) s += (y > 2 && R() < 0.2 + 0.1 * y) || (y > 5 && R() < 0.5) ? "#" : "."; rows.push(s); } return pixSprite(rows, WH, 1); });
      // bunkers: an arch, kept as a pixel mask so hits can bite pieces out of it
      var BK = ["....##############....", "...################...", "..##################..", ".####################.",
                "######################", "######################", "######################", "######################",
                "######################", "######################", "######################", "######################",
                "######..........######", "######..........######", "#####............#####", "#####............#####"];
      S.makeBunkers = function () {
        S.bunkers = [];
        for (i = 0; i < 4; i++) {
          var bx = Math.round(S.VW * (0.2 + 0.2 * i) - 11), m = new Uint8Array(22 * 16), c = mkCanvas(22, 16);
          for (j = 0; j < 16; j++) for (var x = 0; x < 22; x++) m[j * 22 + x] = BK[j][x] === "#" ? 1 : 0;
          S.bunkers.push({ x: bx, y: 146, m: m, c: c, dirty: true });
        }
      };
      S.newWave = function () {
        S.alive = []; for (i = 0; i < 5; i++) { S.alive.push([]); for (j = 0; j < 11; j++) S.alive[i].push(true); }
        S.ox = Math.round((S.VW - 176) / 2); S.oy = 44; S.dir = 1; S.frame = 0; S.stepAt = 0; S.waveAt = 0;
        S.makeBunkers();
      };
      S.newWave();
      S.score = 0; S.lives = 3; S.cx = S.VW / 2; S.deadUntil = 0; S.shots = []; S.bombs = []; S.boom = []; S.ufo = null; S.nextUfo = 12; S.lastUfo = -99; S.thump = 0;
      // the backdrop: stars over a dim moonscape, drawn once
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      var vg = g.createRadialGradient(W / 2, H * 0.7, 0, W / 2, H * 0.7, W * 0.7);
      vg.addColorStop(0, "rgba(20,30,70,0.35)"); vg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
      for (i = 0; i < 170; i++) { var a = 0.15 + 0.6 * R() * R(); g.fillStyle = "rgba(210,220,255," + a.toFixed(2) + ")"; var sz = R() < 0.1 ? 2 : 1; g.fillRect(R() * W, R() * H * 0.85, sz * r.u * 1.4, sz * r.u * 1.4); }
      g.fillStyle = "rgba(40,48,78,0.55)"; g.beginPath(); g.moveTo(0, H);
      for (i = 0; i <= 40; i++) { var x = i / 40 * W, y = H * (0.9 + 0.03 * Math.sin(i * 0.9) + 0.02 * Math.sin(i * 2.3 + 1) + 0.015 * R()); g.lineTo(x, y); }
      g.lineTo(W, H); g.closePath(); g.fill();
      for (i = 0; i < 9; i++) { var cxr = R() * W, cyr = H * (0.94 + 0.04 * R()), rr = (8 + 26 * R()) * r.u; g.strokeStyle = "rgba(70,80,120,0.4)"; g.lineWidth = 1.2 * r.u; g.beginPath(); g.ellipse(cxr, cyr, rr, rr * 0.28, 0, 0, TAU); g.stroke(); }
      S.bg = bg;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, VW = S.VW, i, j, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing";
      if (!S.stepAt) { S.stepAt = t; S.nextUfo = t + 10; }
      // ---- the formation: where each invader is (the columns bob with the assistant's voice)
      var bands = f.bands, bob = [], count = 0;
      for (j = 0; j < 11; j++) bob.push(reply ? -Math.round(clamp((bands[3 + j * 2] - 0.3) / 0.7, 0, 1) * (3 + 7 * lv)) : 0);
      function ax(row, col) { var ty = S.types[S.rowType[row]]; return S.ox + col * 16 + Math.floor((16 - ty.w) / 2); }
      function ay(row, col) { return S.oy + row * 14 + bob[col]; }
      var minX = 1e9, maxX = -1e9, maxY = -1e9;
      for (i = 0; i < 5; i++) for (j = 0; j < 11; j++) if (S.alive[i][j]) {
        count++; var x = ax(i, j), w = S.types[S.rowType[i]].w;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, S.oy + i * 14 + 8);
      }
      // ---- the march: faster as the formation thins, and faster still with the assistant's voice
      var interval = (0.03 + 0.55 * count / 55) * (reply ? 1 / (1 + 1.8 * lv) : think ? 0.8 : listen ? 1 : 1.25);
      if (count && t >= S.stepAt) {
        S.stepAt = t + interval; S.frame ^= 1; S.thump = 1;
        if ((S.dir > 0 && maxX + 3 > VW - 4) || (S.dir < 0 && minX - 3 < 4)) { S.oy += 6; S.dir = -S.dir; }
        else S.ox += 3 * S.dir;
      }
      S.thump = Math.max(0, S.thump - dt * 6);
      if ((!count && !S.waveAt) || maxY > 140) S.waveAt = t + (count ? 0.2 : 1.2);
      if (S.waveAt && t >= S.waveAt) S.newWave();
      // ---- the cannon: you
      var alive = t >= S.deadUntil;
      if (alive) {
        var target = VW / 2;
        if (listen || st === "idle") {
          var bestD = 1e9;
          for (j = 0; j < 11; j++) for (i = 4; i >= 0; i--) if (S.alive[i][j]) { var cxj = ax(i, j) + S.types[S.rowType[i]].w / 2, d = Math.abs(cxj - S.cx); if (d < bestD) { bestD = d; target = cxj; } break; }
        }
        var sp = (listen ? 60 + 140 * lv : 35) * dt;
        S.cx += clamp(target - S.cx, -sp, sp);
        var fire = (listen && f.onset) || (st === "idle" && R() < dt * 0.8);
        if (fire && S.shots.length < 2) S.shots.push({ x: Math.round(S.cx), y: 170 });
      }
      // ---- the invaders' bombs: on the assistant's syllables, from the loudest column; now and then otherwise
      var bombChance = reply ? (f.onset ? 1 : 0) : think || st === "idle" ? dt * 0.7 : dt * 0.35;
      if (count && S.bombs.length < 5 && R() < bombChance) {
        var col = 0, bv = -1;
        for (j = 0; j < 11; j++) { var hasAny = false; for (i = 0; i < 5; i++) if (S.alive[i][j]) hasAny = true; var v = hasAny ? bands[3 + j * 2] + R() * 0.2 : -1; if (v > bv) { bv = v; col = j; } }
        for (i = 4; i >= 0; i--) if (S.alive[i][col]) { S.bombs.push({ x: ax(i, col) + (S.types[S.rowType[i]].w >> 1) - 1, y: ay(i, col) + 8, ph: 0 }); break; }
      }
      // ---- the UFO: now and then, and on the assistant's loudest moments
      if (!S.ufo && (t > S.nextUfo || (reply && f.onset && lv > 0.55 && t - S.lastUfo > 8))) {
        var fromLeft = R() < 0.5; S.ufo = { x: fromLeft ? -16 : VW, dir: fromLeft ? 1 : -1 }; S.lastUfo = t; S.nextUfo = t + 16 + R() * 12;
      }
      if (S.ufo) { S.ufo.x += S.ufo.dir * 42 * dt; if (S.ufo.x < -20 || S.ufo.x > VW + 4) S.ufo = null; }
      // ---- shots and bombs
      function bunkerHit(x, y, up) {
        for (var b = 0; b < S.bunkers.length; b++) {
          var bk = S.bunkers[b], lx = Math.round(x - bk.x), ly = Math.round(y - bk.y);
          if (lx < 0 || lx >= 22 || ly < 0 || ly >= 16 || !bk.m[ly * 22 + lx]) continue;
          for (var e = 0; e < 14; e++) {                                   // bite a ragged chunk out of it
            var ex = lx + Math.round((R() - 0.5) * 5), ey = ly + Math.round((R() - 0.5) * 5) + (up ? -1 : 1);
            if (ex >= 0 && ex < 22 && ey >= 0 && ey < 16) bk.m[ey * 22 + ex] = 0;
          }
          bk.m[ly * 22 + lx] = 0; bk.dirty = true; return true;
        }
        return false;
      }
      S.shots = S.shots.filter(function (s) {
        for (var n = 0; n < 4; n++) {                                        // sub-steps so nothing is skipped
          s.y -= 230 * dt / 4;
          if (s.y < 22) { S.boom.push({ x: s.x - 4, y: 22, t: t, spr: null }); return false; }
          if (bunkerHit(s.x, s.y, true)) return false;
          if (S.ufo && s.y < 34 && s.x >= S.ufo.x && s.x < S.ufo.x + 16) {
            var pts = [50, 100, 150, 300][(R() * 4) | 0]; S.score += pts; S.boom.push({ x: S.ufo.x, y: 26, t: t, txt: String(pts), red: true }); S.ufo = null; return false;
          }
          for (var a = 0; a < 5; a++) for (var c = 0; c < 11; c++) {
            if (!S.alive[a][c]) continue;
            var ix = ax(a, c), iy = ay(a, c), tw = S.types[S.rowType[a]].w;
            if (s.x >= ix && s.x < ix + tw && s.y >= iy && s.y < iy + 8) {
              S.alive[a][c] = false; S.score += S.types[S.rowType[a]].pts; S.boom.push({ x: ix + tw / 2 - 6, y: iy, t: t, spr: S.boomSpr }); return false;
            }
          }
        }
        return true;
      });
      S.bombs = S.bombs.filter(function (b) {
        for (var n = 0; n < 3; n++) {
          b.y += 75 * dt / 3; b.ph += dt * 12 / 3;
          if (bunkerHit(b.x + 1, b.y + 7, false)) return false;
          if (alive && b.y + 7 >= 172 && b.y < 180 && b.x + 2 >= S.cx - 7 && b.x <= S.cx + 6) {
            S.deadUntil = t + 1.2; S.lives = S.lives > 1 ? S.lives - 1 : 3; S.boom.push({ x: S.cx - 7, y: 172, t: t, dead: true }); return false;
          }
          if (b.y > 176) { S.boom.push({ x: b.x - 2, y: 178, t: t, small: true }); return false; }
        }
        return true;
      });
      INV_HI = Math.max(INV_HI, S.score);
      // ---- draw the field at 1 px per unit
      var fb = r.buf("invField", VW, S.VH), q = fb.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, VW, S.VH); q.imageSmoothingEnabled = false;
      pixText(q, "SCORE<1>", 12, 2, 1, "#fff", "left"); pixText(q, "HI-SCORE", VW / 2, 2, 1, "#fff", "center"); pixText(q, "SCORE<2>", VW - 12, 2, 1, "#fff", "right");
      pixText(q, String(S.score).padStart(4, "0"), 24, 12, 1, "#fff", "left"); pixText(q, String(INV_HI).padStart(4, "0"), VW / 2, 12, 1, "#fff", "center");
      if (S.ufo) q.drawImage(S.ufoSpr, Math.round(S.ufo.x), 27);
      for (i = 0; i < 5; i++) for (j = 0; j < 11; j++) if (S.alive[i][j]) q.drawImage(S.types[S.rowType[i]].f[S.frame], ax(i, j), ay(i, j));
      S.bunkers.forEach(function (bk) {
        if (bk.dirty) { var bc = bk.c.getContext("2d"), im = bc.createImageData(22, 16); for (var p = 0; p < 22 * 16; p++) if (bk.m[p]) { im.data[p * 4] = im.data[p * 4 + 1] = im.data[p * 4 + 2] = 255; im.data[p * 4 + 3] = 255; } bc.putImageData(im, 0, 0); bk.dirty = false; }
        q.drawImage(bk.c, bk.x, bk.y);
      });
      q.fillStyle = "#fff";
      S.shots.forEach(function (s) { q.fillRect(Math.round(s.x), Math.round(s.y), 1, 4); });
      S.bombs.forEach(function (b) { q.drawImage(S.bombSpr[Math.floor(b.ph) % 2], Math.round(b.x), Math.round(b.y)); });
      if (alive) q.drawImage(S.cannonSpr, Math.round(S.cx - 6), 172);
      S.boom = S.boom.filter(function (e) {
        var age = t - e.t;
        if (e.dead) { if (age > 1.2) return false; q.drawImage(S.deadSpr[Math.floor(age * 10) % 2], Math.round(e.x), 172); return true; }
        if (e.txt) { if (age > 1) return false; pixText(q, e.txt, e.x + 8, 27, 1, "#fff", "center"); return true; }
        if (age > (e.small ? 0.15 : 0.28)) return false;
        if (e.spr) q.drawImage(e.spr, Math.round(e.x), Math.round(e.y));
        else { q.fillRect(Math.round(e.x) + 2, Math.round(e.y), 1, 1); q.fillRect(Math.round(e.x) + 4, Math.round(e.y) + 1, 1, 1); q.fillRect(Math.round(e.x) + 1, Math.round(e.y) + 2, 1, 1); q.fillRect(Math.round(e.x) + 5, Math.round(e.y) + 3, 1, 1); q.fillRect(Math.round(e.x) + 3, Math.round(e.y) + 2, 1, 1); }
        return true;
      });
      q.globalAlpha = 0.75 + 0.25 * S.thump; q.fillRect(0, 183, VW, 1); q.globalAlpha = 1;   // the ground thumps with the march
      pixText(q, String(S.lives), 12, 188, 1, "#fff", "left");
      for (k = 0; k < S.lives - 1; k++) q.drawImage(S.cannonSpr, 26 + k * 16, 188);
      pixText(q, "CREDIT 00", VW - 12, 188, 1, "#fff", "right");
      // the cabinet's coloured strips
      q.globalCompositeOperation = "source-atop";
      q.fillStyle = "#ff3d3d"; q.fillRect(0, 22, VW, 16);
      q.fillStyle = "#3dff6a"; q.fillRect(0, 138, VW, 48); q.fillRect(0, 186, 90, 14);
      q.globalCompositeOperation = "source-over";
      // ---- to the screen: backdrop, the field scaled up crisp, glow, scanlines
      var g0 = r.ctx, s = S.s;
      g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1; g0.drawImage(S.bg, 0, 0);
      var sc = r.buf("invScaled", W, H), qq = sc.getContext("2d");
      qq.clearRect(0, 0, W, H); qq.imageSmoothingEnabled = false; qq.drawImage(fb, S.fx, S.fy, VW * s, S.VH * s);
      g0.drawImage(sc, 0, 0);
      r.bloom(sc, 0.55 + 0.5 * lv, 0.006, 2);
      scanlines(r, 0.14);
    }
  });

  /* ---------- Defender: a side-scrolling planet where the mountains are your voices ----------
     The ship flies right over a jagged planet surface generated from whoever is speaking, so the conversation scrolls past as
     a mountain range. Your syllables thrust the ship on and fire its rainbow laser at landers, mutants and baiters, which burst
     into rings of pixels. When the assistant answers, its syllables send landers down to snatch humanoids (one that reaches the
     top becomes a mutant), and its loudest moments set off a smart bomb. The top panel carries the scanner (a radar of the
     neighbourhood), the score, ships and smart bombs. Sprites are original designs in the style of the era. */
  register({
    id: "defender", name: "Defender", layout: "bottom", text: "arcade", hiDpi: true,
    blurb: "A scrolling planet whose mountains are your voices. Your syllables fire the laser; the assistant's voice sends landers after the humanoids.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, i;
      var p = S.p = Math.max(2, Math.round(3 * u));
      S.top = H * 0.17; S.base = H * 0.68; S.R = rng(1981);
      var PAL = { w: "#ffffff", p: "#b060ff", y: "#ffe040", r: "#ff4040", g: "#40ff60", m: "#ff40ff", b: "#c050ff", h: "#ffffff", c: "#60e0ff" };
      S.ship = pixSprite(["...ww...........", "..wwwp..........", "pwwwwwwwwwwyy...", "wwwwwwwwwwwwwwww", "pwwwwwwwwww.....", ".pp............."], PAL, p);
      S.kinds = {
        lander: { spr: pixSprite(["...ggg...", "..ggggg..", ".gg.g.gg.", "ggggggggg", ".gyyyyyg.", "..y.y.y..", ".y..y..y.", "y...y...y"], PAL, p), col: [64, 255, 96], pts: 150 },
        mutant: { spr: pixSprite(["..mmmmm..", ".mgmgmgm.", "mmmmmmmmm", "m.m.m.m.m", ".mmmmmmm.", "..g...g..", ".g.g.g.g.", "g...g...g"], PAL, p), col: [255, 64, 255], pts: 150 },
        baiter: { spr: pixSprite(["..ggggggggg..", "ggggggggggggg", ".g.g.g.g.g.g.", "..ggggggggg.."], PAL, p), col: [96, 255, 96], pts: 200 }
      };
      S.human = pixSprite([".h.", "hhh", ".b.", "bbb", ".b.", ".b.", "b.b", "b.b"], PAL, p);
      S.cam = 0; S.shipY = 0.45; S.terr = []; S.stepW = 7 * p; S.enemies = []; S.humans = []; S.parts = []; S.lasers = [];
      S.score = 0; S.lives = 3; S.bombs = 3; S.flash = 0; S.lastBomb = -99; S.nextHuman = 0;
      S.stars = []; for (i = 0; i < 110; i++) S.stars.push({ x: S.R() * W, y: S.top + S.R() * (S.base - S.top) * 0.95, d: 0.15 + S.R() * 0.5, c: [[255, 255, 255], [255, 120, 120], [120, 200, 255], [255, 240, 120]][(S.R() * 4) | 0], ph: S.R() * TAU });
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, p = S.p, i, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing";
      var top = S.top, base = S.base, span = base - top;
      // ---- flight: your voice is thrust; the camera follows the ship, which sits a third of the way across
      var speed = W * (listen ? 0.25 + 1.1 * lv : reply ? 0.3 : think ? 0.16 : 0.22);
      S.cam += speed * dt;
      var shipX = S.cam + W * 0.3;
      // ---- terrain: new ground appears ahead, its height taken from whoever is speaking right now
      var sw = S.stepW;
      if (!S.terr.length) for (var x0 = S.cam - W * 1.6; x0 < S.cam + W * 2.6; x0 += sw) S.terr.push({ x: x0, h: 0.06 + 0.05 * noise1(x0 * 0.004) + 0.03 * R() });
      while (S.terr[S.terr.length - 1].x < S.cam + W * 2.6) {                // plain ground far ahead (the scanner shows it)...
        var lx = S.terr[S.terr.length - 1].x + sw;
        S.terr.push({ x: lx, h: clamp(0.06 + 0.05 * noise1(lx * 0.004) + 0.035 * (R() - 0.3), 0.02, 0.2) });
      }
      var voiced = (listen || reply) ? f.voice * (0.18 + 0.22 * lv) + 0.12 * f.level : 0;
      for (i = S.terr.length - 1; i >= 0 && S.terr[i].x > S.cam + W * 0.98; i--) {   // ...raised by the voice as it comes on screen
        var s0 = S.terr[i];
        if (!s0.v && s0.x < S.cam + W * 1.04) { s0.v = true; s0.h = clamp(s0.h + voiced, 0.02, 0.42); }
      }
      while (S.terr.length && S.terr[0].x < S.cam - W * 1.7) S.terr.shift();
      function groundAt(wx) {
        var i0 = Math.floor((wx - S.terr[0].x) / sw); i0 = clamp(i0, 0, S.terr.length - 2);
        var a = S.terr[i0], b = S.terr[i0 + 1], fr = clamp((wx - a.x) / sw, 0, 1);
        return a.h + (b.h - a.h) * fr;
      }
      // ---- humanoids stand on the ground every so often; enemies are topped up ahead of the ship
      if (!S.nextHuman) S.nextHuman = S.cam;
      while (S.nextHuman < S.cam + W * 2.4) { S.humans.push({ x: S.nextHuman + R() * W * 0.3, y: 0, held: null, fall: 0 }); S.nextHuman += W * (0.45 + 0.4 * R()); }
      S.humans = S.humans.filter(function (h) { return h.x > S.cam - W * 1.7; });
      S.humans.forEach(function (h) { if (!h.held) { var gy = 1 - groundAt(h.x); if (h.fall) { h.y += h.fall * dt; h.fall += 1.2 * dt; if (h.y >= gy) { h.y = gy; h.fall = 0; } } else h.y = gy; } });
      var ahead = S.enemies.filter(function (e) { return e.x > S.cam - W * 0.2 && e.x < S.cam + W * 2.4; }).length;
      while (ahead < 9) {
        var kind = R() < 0.62 ? "lander" : R() < 0.6 ? "mutant" : "baiter";
        S.enemies.push({ kind: kind, x: S.cam + W * (1.05 + 1.3 * R()), y: 0.1 + 0.5 * R(), vx: (R() - 0.5) * 0.08, ph: R() * TAU, grab: null, target: null }); ahead++;
      }
      S.enemies = S.enemies.filter(function (e) { return e.x > S.cam - W * 1.7; });
      // ---- the assistant's syllables send a lander after a humanoid; its loudest moment is a smart bomb
      if (reply && f.onset) {
        var cands = S.enemies.filter(function (e) { return e.kind === "lander" && !e.grab && !e.target && e.x > S.cam && e.x < S.cam + W; });
        if (cands.length) {
          var en = cands[(R() * cands.length) | 0], best = null, bd = 1e9;
          S.humans.forEach(function (h) { if (!h.held && !h.fall) { var d = Math.abs(h.x - en.x); if (d < bd) { bd = d; best = h; } } });
          if (best && bd < W * 0.6) en.target = best;
        }
        if (lv > 0.62 && t - S.lastBomb > 7 && S.bombs > 0) {
          S.lastBomb = t; S.flash = 1; S.bombs--; if (!S.bombs) S.bombs = 3;
          S.enemies.forEach(function (e) { if (e.x > S.cam && e.x < S.cam + W) kill(e); });
        }
      }
      var bands = f.bands;
      S.enemies.forEach(function (e, n) {
        if (e.dead) return;
        var wob = reply ? clamp((bands[(n * 5) % 32] - 0.3) / 0.7, 0, 1) * lv : 0;
        if (e.target) {                                                      // swoop down, grab, climb
          var h = e.target;
          if (!e.grab) {
            e.x += clamp(h.x - e.x, -W * 0.25 * dt, W * 0.25 * dt); e.y += clamp(h.y - 0.07 - e.y, -0.35 * dt, 0.35 * dt);
            if (Math.abs(h.x - e.x) < 4 * p && Math.abs(h.y - 0.07 - e.y) < 0.02) { e.grab = h; h.held = e; }
          } else {
            e.y -= 0.12 * dt; h.x = e.x; h.y = e.y + 0.075;
            if (e.y < 0.02) { e.kind = "mutant"; e.target = null; e.grab = null; h.dead = true; }
          }
        } else if (e.kind === "mutant") {
          e.y += clamp(S.shipY - e.y, -0.2 * dt, 0.2 * dt) + (R() - 0.5) * 0.02; e.x += (R() - 0.5) * W * 0.02;
        } else if (e.kind === "baiter") {
          e.x += W * (0.06 + 0.25 * wob) * dt * (e.ph > Math.PI ? 1 : -1); e.y = clamp(e.y + Math.sin(t * 2 + e.ph) * 0.1 * dt, 0.05, 0.7);
        } else {
          e.x += e.vx * W * dt; e.y = clamp(e.y + Math.sin(t * 1.5 + e.ph) * (0.03 + 0.2 * wob) * dt, 0.04, 0.72);
        }
        e.bob = wob;
      });
      S.humans = S.humans.filter(function (h) { return !h.dead; });
      // ---- the ship steers toward the nearest enemy ahead; your syllables fire the laser
      var aim = null, ad = 1e9;
      S.enemies.forEach(function (e) { if (!e.dead && e.x > shipX && e.x < S.cam + W) { var d = e.x - shipX; if (d < ad) { ad = d; aim = e; } } });
      S.shipY = follow(S.shipY, aim ? aim.y : 0.4 + 0.1 * Math.sin(t * 0.7), 0.06 + 0.1 * lv, 0.06 + 0.1 * lv, dt);
      if ((listen && f.onset) || (st === "idle" && R() < dt * 0.6)) {
        var hit = null, hd = 1e9, tol = 0.07;
        S.enemies.forEach(function (e) { if (!e.dead && e.x > shipX && e.x < S.cam + W && Math.abs(e.y - S.shipY) < tol) { var d = e.x - shipX; if (d < hd) { hd = d; hit = e; } } });
        S.lasers.push({ x: shipX + 16 * p, y: S.shipY, t: t, to: hit ? hit.x : S.cam + W * 1.05 });
        if (hit) kill(hit);
      }
      function kill(e) {
        if (e.dead) return;
        e.dead = true; S.score += S.kinds[e.kind].pts;
        if (e.grab) { e.grab.held = null; e.grab.fall = 0.05; }
        if (e.target) e.target = null;
        var c = S.kinds[e.kind].col;
        for (var j = 0; j < 20; j++) { var an = j / 20 * TAU; S.parts.push({ x: e.x, y: e.y, vx: Math.cos(an) * (0.9 + 0.3 * (j % 2)), vy: Math.sin(an) * (0.9 + 0.3 * (j % 2)), t: t, c: j % 3 ? c : [255, 255, 255] }); }
      }
      S.enemies = S.enemies.filter(function (e) { return !e.dead; });
      // ---- draw
      var g0 = r.ctx; g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1; g0.fillStyle = "#000"; g0.fillRect(0, 0, W, H);
      var sc = r.buf("defScene", W, H), q = sc.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, W, H); q.imageSmoothingEnabled = false;
      function SX(wx) { return wx - S.cam; }
      function SY(y) { return top + y * span; }
      S.stars.forEach(function (s) {                                         // parallax stars
        var x = ((s.x - S.cam * s.d) % W + W) % W, a = 0.35 + 0.35 * Math.sin(t * 2 + s.ph);
        q.fillStyle = rgba(s.c, a); q.fillRect(x, s.y, p * 0.8, p * 0.8);
      });
      q.beginPath();                                                        // the planet surface
      var first = true;
      S.terr.forEach(function (s) { var x = SX(s.x); if (x < -sw || x > W + sw) return; var y = base - s.h * span; if (first) { q.moveTo(x, y); first = false; } else q.lineTo(x, y); });
      q.strokeStyle = "#d8722a"; q.lineWidth = Math.max(1.5, 0.7 * p); q.lineJoin = "miter"; q.stroke();
      S.humans.forEach(function (h) { var x = SX(h.x); if (x > -10 && x < W + 10) q.drawImage(S.human, Math.round(x - 1.5 * p), Math.round(SY(h.y) - 8 * p)); });
      S.enemies.forEach(function (e) {
        var x = SX(e.x); if (x < -20 * p || x > W + 20 * p) return;
        var spr = S.kinds[e.kind].spr, s2 = 1 + 0.35 * (e.bob || 0);
        q.drawImage(spr, Math.round(x - spr.width * s2 / 2), Math.round(SY(e.y) - spr.height * s2 / 2), spr.width * s2, spr.height * s2);
      });
      // lasers: a white head racing out with a rainbow tail behind it
      var RB = [[255, 60, 60], [255, 200, 40], [80, 255, 90], [60, 220, 255], [110, 110, 255], [255, 80, 255]];
      S.lasers = S.lasers.filter(function (L) {
        var age = t - L.t; if (age > 0.3) return false;
        var x0 = SX(L.x), x1 = SX(L.to), reach = Math.min(1, age / 0.08), head = x0 + (x1 - x0) * reach, y = Math.round(SY(L.y)), seg = 10 * p, fade = 1 - Math.max(0, age - 0.12) / 0.18;
        for (var xx = x0, n = 0; xx < head; xx += seg, n++) { q.fillStyle = rgba(RB[(n + Math.floor(t * 30)) % RB.length], 0.9 * fade); q.fillRect(xx, y, Math.min(seg, head - xx), Math.max(1, 0.6 * p)); }
        q.fillStyle = rgba([255, 255, 255], fade); q.fillRect(head - 3 * p, y - 0.2 * p, 3 * p, Math.max(1, p));
        return true;
      });
      S.parts = S.parts.filter(function (pt) {                               // rings of pixels flying apart
        var age = t - pt.t; if (age > 0.9) return false;
        var x = SX(pt.x) + pt.vx * age * W * 0.12, y = SY(pt.y) + pt.vy * age * W * 0.12;
        q.fillStyle = rgba(pt.c, 1 - age / 0.9); q.fillRect(x, y, p * 1.2, p * 1.2);
        return true;
      });
      // the ship, with a flickering exhaust while it thrusts
      var sx = SX(shipX), sy = Math.round(SY(S.shipY) - S.ship.height / 2), thr = listen ? 0.3 + lv : 0.25;
      for (k = 0; k < 4; k++) { var fl = (2 + 6 * thr * (0.6 + 0.4 * R())) * p; q.fillStyle = rgba(RB[(k + Math.floor(t * 20)) % 4], 0.85); q.fillRect(sx - fl - k * 0.5 * p, sy + 2 * p + (k % 2) * p, fl, p); }
      q.drawImage(S.ship, Math.round(sx), sy);
      // ---- the top panel: scanner, score, ships, smart bombs
      var px0 = W * 0.28, pw = W * 0.44, py0 = H * 0.02, ph = H * 0.115, win0 = S.cam - W * 1.5, winW = W * 4;
      function MX(wx) { return px0 + (wx - win0) / winW * pw; }
      q.fillStyle = "rgba(216,114,42,0.8)";
      S.terr.forEach(function (s, n) { if (n % 3) return; var x = MX(s.x); if (x >= px0 && x <= px0 + pw) q.fillRect(x, py0 + ph - 2 - s.h * ph * 0.8, 1.5, 1.5); });
      S.enemies.forEach(function (e) { var x = MX(e.x); if (x >= px0 && x <= px0 + pw) { q.fillStyle = rgba(S.kinds[e.kind].col, 1); q.fillRect(x - 1.5, py0 + 3 + e.y * (ph - 8), 3, 3); } });
      S.humans.forEach(function (h) { var x = MX(h.x); if (x >= px0 && x <= px0 + pw) { q.fillStyle = "#c050ff"; q.fillRect(x - 1, py0 + 3 + h.y * (ph - 8), 2, 3); } });
      q.fillStyle = "#fff"; q.fillRect(MX(shipX) - 2.5, py0 + 3 + S.shipY * (ph - 8), 5, 3);
      if (think) { var sweep = px0 + ((t * 0.5) % 1) * pw; q.fillStyle = "rgba(120,160,255,0.35)"; q.fillRect(sweep, py0, 2, ph); }
      pixText(q, String(S.score).padStart(6, "0"), W * 0.235, H * 0.035, Math.max(2, 0.55 * p), "#fff", "right");
      for (k = 0; k < S.lives; k++) q.drawImage(S.ship, W * 0.1 + k * 7 * p, H * 0.085, S.ship.width * 0.4, S.ship.height * 0.4);
      for (k = 0; k < S.bombs; k++) { q.fillStyle = "#ffe040"; q.fillRect(W * 0.235 - 2 * p, H * 0.085 + k * 1.6 * p, 2 * p, p); }
      g0.drawImage(sc, 0, 0);
      r.bloom(sc, 0.5 + 0.5 * lv, 0.006, 2);
      // panel frame, crisp over the glow
      g0.strokeStyle = "#3a54ff"; g0.lineWidth = Math.max(1.5, 0.5 * p);
      g0.beginPath(); g0.moveTo(0, top - 3 * p); g0.lineTo(W, top - 3 * p); g0.stroke();
      g0.strokeRect(px0 - 2, py0 - 2, pw + 4, ph + 4);
      var vx0 = MX(S.cam), vx1 = MX(S.cam + W), bl = 5 * p;               // brackets: the part of the scanner on screen
      g0.strokeStyle = "#fff"; g0.beginPath();
      g0.moveTo(vx0, py0 + bl); g0.lineTo(vx0, py0); g0.lineTo(vx0 + bl, py0); g0.moveTo(vx1 - bl, py0); g0.lineTo(vx1, py0); g0.lineTo(vx1, py0 + bl);
      g0.moveTo(vx0, py0 + ph - bl); g0.lineTo(vx0, py0 + ph); g0.lineTo(vx0 + bl, py0 + ph); g0.moveTo(vx1 - bl, py0 + ph); g0.lineTo(vx1, py0 + ph); g0.lineTo(vx1, py0 + ph - bl);
      g0.stroke();
      if (S.flash > 0) { g0.fillStyle = "rgba(255,255,255," + (0.85 * S.flash).toFixed(3) + ")"; g0.fillRect(0, 0, W, H); S.flash = Math.max(0, S.flash - dt * 5); }
      scanlines(r, 0.12);
    }
  });

  /* ---------- Asteroids: a vector-monitor rock field where your syllables are the ship's shots ----------
     Everything is drawn as glowing white vector lines with bright vertex dots and phosphor afterglow. Your syllables turn the
     ship onto the nearest rock and fire; rocks split large, medium, small. When the assistant answers, the beam throbs,
     every rock's outline ripples with its slice of the spectrum, the ship returns fire on some of its syllables and a
     saucer turns up to shoot back on others. While it thinks, the ship
     drifts and hops through hyperspace. The play area wraps like the original; the rock outlines are generated. */
  var AST_HI = 20000;
  register({
    id: "asteroids", name: "Asteroids", layout: "bottom", text: "vector", hiDpi: true,
    blurb: "A glowing vector rock field. Your syllables aim and fire; while the assistant answers, the beam throbs, the rocks ripple with its voice and a saucer joins the fight.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, i, k;
      S.AW = W; S.AH = H * 0.7; S.s = Math.min(W, S.AH * 1.6) / 1000; S.R = rng(1979);
      var R = S.R;
      S.tpl = [];                                                           // four jagged rock outlines, radius ~1
      for (k = 0; k < 4; k++) { var pts = []; for (i = 0; i < 11; i++) { var a = i / 11 * TAU + (R() - 0.5) * 0.35, rr = 0.72 + 0.28 * R(); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } S.tpl.push(pts); }
      S.rocks = []; S.shots = []; S.eshots = []; S.parts = []; S.debris = []; S.wave = 0; S.waveAt = 0.01;
      S.ship = { x: W / 2, y: S.AH / 2, a: -Math.PI / 2, vx: 0, vy: 0, dead: 0, hyper: 0, thrust: 0 };
      S.saucer = null; S.lastSaucer = -99; S.nextHyper = 0; S.score = 0; S.lives = 3; S.n = 0;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, AW = S.AW, AH = S.AH, s = S.s, i, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing", sh = S.ship;
      function wrap(o) { o.x = (o.x % AW + AW) % AW; o.y = (o.y % AH + AH) % AH; }
      function wd(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; dx -= Math.round(dx / AW) * AW; dy -= Math.round(dy / AH) * AH; return [dx, dy]; }
      function rock(x, y, size, vx, vy) { S.rocks.push({ x: x, y: y, size: size, rad: [70, 35, 17][size] * s, vx: vx, vy: vy, tpl: (R() * 4) | 0, id: S.n++ }); }
      // ---- waves of big rocks, arriving from the edges
      if (S.waveAt && t >= S.waveAt) {
        S.waveAt = 0; S.wave++;
        for (i = 0; i < Math.min(8, 4 + S.wave); i++) {
          var edge = R() < 0.5, x = edge ? R() * AW : 0, y = edge ? 0 : R() * AH, an = R() * TAU, v = (40 + 35 * R()) * s;
          rock(x, y, 0, Math.cos(an) * v, Math.sin(an) * v);
        }
      }
      if (!S.rocks.length && !S.waveAt) S.waveAt = t + 1.5;
      var spdMul = 1 + (reply ? 0.6 * lv : 0);
      S.rocks.forEach(function (o) { o.x += o.vx * dt * spdMul; o.y += o.vy * dt * spdMul; wrap(o); });
      // ---- the ship: aim at the nearest rock (leading it), fire on your syllables; drift and hyperspace while thinking
      var alive = !sh.dead && !sh.hyper;
      if (sh.dead && t - sh.dead > 2) {
        var clear = S.rocks.every(function (o) { var d = wd(AW / 2, AH / 2, o.x, o.y); return Math.hypot(d[0], d[1]) > o.rad + 90 * s; });
        if (clear) { sh.dead = 0; sh.x = AW / 2; sh.y = AH / 2; sh.vx = sh.vy = 0; sh.a = -Math.PI / 2; }
      }
      if (think && alive && t > S.nextHyper) { sh.hyper = t; S.nextHyper = t + 4 + 3 * R(); sparkle(sh.x, sh.y); }
      if (sh.hyper && t - sh.hyper > 0.8) { sh.hyper = 0; sh.x = AW * (0.2 + 0.6 * R()); sh.y = AH * (0.2 + 0.6 * R()); sparkle(sh.x, sh.y); }
      if (alive) {
        var tgt = null, td = 1e9;
        S.rocks.forEach(function (o) { var d = wd(sh.x, sh.y, o.x, o.y), dd = Math.hypot(d[0], d[1]); if (dd < td) { td = dd; tgt = o; } });
        var want = sh.a;
        if (tgt && (listen || st === "idle" || reply)) {
          var d0 = wd(sh.x, sh.y, tgt.x, tgt.y), tt = Math.hypot(d0[0], d0[1]) / (520 * s);
          want = Math.atan2(d0[1] + tgt.vy * tt, d0[0] + tgt.vx * tt);
        } else if (think) want = sh.a + 1.2 * dt * 4;
        var da = ((want - sh.a + Math.PI) % TAU + TAU) % TAU - Math.PI, turn = (listen ? 7 : 3.5) * dt;
        sh.a += clamp(da, -turn, turn);
        sh.thrust = listen ? clamp(lv * 1.4 - 0.2, 0, 1) : 0;
        sh.vx += Math.cos(sh.a) * sh.thrust * 160 * s * dt; sh.vy += Math.sin(sh.a) * sh.thrust * 160 * s * dt;
        sh.vx *= Math.pow(0.55, dt); sh.vy *= Math.pow(0.55, dt);
        sh.x += sh.vx * dt; sh.y += sh.vy * dt; wrap(sh);
        var fire = (listen && f.onset) || (reply && f.onset && R() < 0.45) || (st === "idle" && R() < dt * 0.9);   // it fights back while the assistant talks
        if (fire && S.shots.length < 6) S.shots.push({ x: sh.x + Math.cos(sh.a) * 14 * s, y: sh.y + Math.sin(sh.a) * 14 * s, vx: Math.cos(sh.a) * 520 * s + sh.vx, vy: Math.sin(sh.a) * 520 * s + sh.vy, t: t });
      }
      // ---- the saucer: shows up on the assistant's voice and shoots on its syllables
      if (!S.saucer && ((reply && f.onset && t - S.lastSaucer > 6) || t - S.lastSaucer > 28)) {
        var fl = R() < 0.5; S.saucer = { x: fl ? 0 : AW, y: AH * (0.15 + 0.7 * R()), vx: (fl ? 1 : -1) * 110 * s, vy: 0, turnAt: t + 1 }; S.lastSaucer = t;
      }
      if (S.saucer) {
        var sc0 = S.saucer; sc0.x += sc0.vx * dt; sc0.y += sc0.vy * dt;
        if (t > sc0.turnAt) { sc0.vy = (R() - 0.5) * 140 * s; sc0.turnAt = t + 0.8 + R(); }
        sc0.y = (sc0.y % AH + AH) % AH;
        if (sc0.x < -30 * s || sc0.x > AW + 30 * s) S.saucer = null;
        else if ((reply && f.onset) || R() < dt * 0.5) {
          var d1 = wd(sc0.x, sc0.y, sh.x, sh.y), ea = Math.atan2(d1[1], d1[0]) + (R() - 0.5) * 0.5;
          S.eshots.push({ x: sc0.x, y: sc0.y, vx: Math.cos(ea) * 330 * s, vy: Math.sin(ea) * 330 * s, t: t });
        }
      }
      // ---- shots, hits, splits
      function sparkle(x, y) { for (var j = 0; j < 10; j++) { var an = R() * TAU, v = (30 + 90 * R()) * s; S.parts.push({ x: x, y: y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, t: t, life: 0.5 }); } }
      function burst(x, y, n, v) { for (var j = 0; j < n; j++) { var an = R() * TAU, vv = (0.3 + R()) * v * s; S.parts.push({ x: x, y: y, vx: Math.cos(an) * vv, vy: Math.sin(an) * vv, t: t, life: 0.7 + 0.4 * R() }); } }
      function hitRock(o) {
        S.score += [20, 50, 100][o.size]; burst(o.x, o.y, 10 - o.size * 2, 140);
        if (o.size < 2) for (var j = 0; j < 2; j++) { var an = Math.atan2(o.vy, o.vx) + (j ? 0.7 : -0.7) + (R() - 0.5) * 0.6, v = Math.hypot(o.vx, o.vy) * (1.3 + 0.4 * R()); rock(o.x, o.y, o.size + 1, Math.cos(an) * v, Math.sin(an) * v); }
        o.gone = true;
      }
      S.shots = S.shots.filter(function (b) {
        b.x += b.vx * dt; b.y += b.vy * dt; wrap(b);
        if (t - b.t > 1.0) return false;
        for (var j = 0; j < S.rocks.length; j++) { var o = S.rocks[j]; if (o.gone) continue; var d = wd(b.x, b.y, o.x, o.y); if (Math.hypot(d[0], d[1]) < o.rad) { hitRock(o); return false; } }
        if (S.saucer) { var d2 = wd(b.x, b.y, S.saucer.x, S.saucer.y); if (Math.abs(d2[0]) < 18 * s && Math.abs(d2[1]) < 9 * s) { S.score += 200; burst(S.saucer.x, S.saucer.y, 12, 160); S.saucer = null; return false; } }
        return true;
      });
      S.rocks = S.rocks.filter(function (o) { return !o.gone; });
      S.eshots = S.eshots.filter(function (b) {
        b.x += b.vx * dt; b.y += b.vy * dt; wrap(b);
        if (t - b.t > 1.2) return false;
        if (alive) { var d = wd(b.x, b.y, sh.x, sh.y); if (Math.hypot(d[0], d[1]) < 9 * s) { crash(); return false; } }
        return true;
      });
      if (alive) S.rocks.forEach(function (o) { if (sh.dead) return; var d = wd(sh.x, sh.y, o.x, o.y); if (Math.hypot(d[0], d[1]) < o.rad * 0.85 + 7 * s) { hitRock(o); crash(); } });
      S.rocks = S.rocks.filter(function (o) { return !o.gone; });
      function crash() {
        if (sh.dead) return;
        sh.dead = t; S.lives = S.lives > 1 ? S.lives - 1 : 3;
        var P = shipPts(sh.x, sh.y, sh.a);
        for (var j = 0; j < 5; j++) { var a0 = P[j], b0 = P[(j + 1) % 5], an = R() * TAU; S.debris.push({ x0: a0[0], y0: a0[1], x1: b0[0], y1: b0[1], vx: Math.cos(an) * 40 * s, vy: Math.sin(an) * 40 * s, rot: (R() - 0.5) * 4, t: t }); }
      }
      AST_HI = Math.max(AST_HI, S.score);
      alive = !sh.dead && !sh.hyper;
      S.beat = Math.max(0, (S.beat || 0) - dt * 3.2);                           // the beam throbs on the assistant's syllables
      if (reply && f.onset) S.beat = 1;
      // ---- draw on a phosphor layer that fades a little each frame (afterglow)
      var ph = r.buf("astPhos", W, H), q = ph.getContext("2d");
      q.globalCompositeOperation = "destination-out"; q.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.5, dt * 30)).toFixed(3) + ")"; q.fillRect(0, 0, W, H);
      q.globalCompositeOperation = "source-over";
      var beam = "rgba(236,244,255," + (0.72 + 0.28 * Math.max(S.beat, reply ? lv : 0.6)).toFixed(3) + ")", lw = Math.max(1.2, (1.6 + 0.6 * S.beat) * s), dots = [], bands = f.bands;
      q.strokeStyle = beam; q.lineWidth = lw; q.lineJoin = "round"; q.lineCap = "round";
      q.beginPath();
      S.rocks.forEach(function (o, n) {
        var tp = S.tpl[o.tpl], amp = reply ? 0.3 * lv : 0.04 * lv;
        for (var j = 0; j <= tp.length; j++) {
          var pv = tp[j % tp.length], bi = (o.id * 5 + (j % tp.length) * 3) % 32, rip = 1 + amp * clamp((bands[bi] - 0.25) / 0.75, 0, 1) * (j % 2 ? 1 : -0.6);
          var x = o.x + pv[0] * o.rad * rip, y = o.y + pv[1] * o.rad * rip;
          if (j) q.lineTo(x, y); else q.moveTo(x, y);
          if (j < tp.length) dots.push(x, y);
        }
      });
      q.stroke();
      function shipPts(x, y, a) {
        var sz = 14 * s, c = Math.cos(a), sn = Math.sin(a);
        return [[1, 0], [-0.75, 0.62], [-0.45, 0.3], [-0.45, -0.3], [-0.75, -0.62]].map(function (pp) { return [x + (pp[0] * c - pp[1] * sn) * sz, y + (pp[0] * sn + pp[1] * c) * sz]; });
      }
      if (alive) {
        var P = shipPts(sh.x, sh.y, sh.a);
        q.beginPath(); q.moveTo(P[0][0], P[0][1]); q.lineTo(P[1][0], P[1][1]); q.moveTo(P[0][0], P[0][1]); q.lineTo(P[4][0], P[4][1]);
        q.moveTo(P[2][0], P[2][1]); q.lineTo(P[3][0], P[3][1]); q.stroke();
        if (sh.thrust > 0.05 && Math.floor(t * 20) % 2) {
          var c = Math.cos(sh.a), sn = Math.sin(sh.a), fx = sh.x - c * (14 * s) * (0.45 + 0.6 * sh.thrust), fy = sh.y - sn * (14 * s) * (0.45 + 0.6 * sh.thrust);
          q.beginPath(); q.moveTo(P[2][0] + (P[3][0] - P[2][0]) * 0.2, P[2][1] + (P[3][1] - P[2][1]) * 0.2); q.lineTo(fx, fy); q.lineTo(P[3][0] + (P[2][0] - P[3][0]) * 0.2, P[3][1] + (P[2][1] - P[3][1]) * 0.2); q.stroke();
        }
        dots.push(P[0][0], P[0][1]);
      }
      S.debris = S.debris.filter(function (d) {
        var age = t - d.t; if (age > 1.6) return false;
        var mx = (d.x0 + d.x1) / 2 + d.vx * age, my = (d.y0 + d.y1) / 2 + d.vy * age, hx = (d.x1 - d.x0) / 2, hy = (d.y1 - d.y0) / 2, ra = d.rot * age, c = Math.cos(ra), sn = Math.sin(ra);
        q.globalAlpha = 1 - age / 1.6; q.beginPath(); q.moveTo(mx - (hx * c - hy * sn), my - (hx * sn + hy * c)); q.lineTo(mx + (hx * c - hy * sn), my + (hx * sn + hy * c)); q.stroke(); q.globalAlpha = 1;
        return true;
      });
      if (S.saucer) {                                                        // the classic saucer: a hull, a band, a dome
        var ux = S.saucer.x, uy = S.saucer.y, a1 = 18 * s, b1 = 6 * s;
        q.beginPath(); q.moveTo(ux - a1, uy); q.lineTo(ux + a1, uy); q.lineTo(ux + a1 * 0.55, uy + b1); q.lineTo(ux - a1 * 0.55, uy + b1); q.closePath();
        q.moveTo(ux - a1, uy); q.lineTo(ux - a1 * 0.5, uy - b1); q.lineTo(ux + a1 * 0.5, uy - b1); q.lineTo(ux + a1, uy);
        q.moveTo(ux - a1 * 0.4, uy - b1); q.lineTo(ux - a1 * 0.25, uy - b1 * 2); q.lineTo(ux + a1 * 0.25, uy - b1 * 2); q.lineTo(ux + a1 * 0.4, uy - b1); q.stroke();
      }
      q.fillStyle = "#fff";
      var ds = Math.max(1.5, 2.2 * s);
      for (i = 0; i < dots.length; i += 2) q.fillRect(dots[i] - ds / 2, dots[i + 1] - ds / 2, ds, ds);   // the beam dwells at the corners
      S.shots.concat(S.eshots).forEach(function (b) { q.fillRect(b.x - ds, b.y - ds, ds * 2, ds * 2); });
      S.parts = S.parts.filter(function (pt) {
        var age = t - pt.t; if (age > pt.life) return false;
        q.globalAlpha = 1 - age / pt.life; q.fillRect(pt.x + pt.vx * age - ds / 2, pt.y + pt.vy * age - ds / 2, ds, ds); q.globalAlpha = 1;
        return true;
      });
      // score, high score and ships in vector digits
      q.beginPath(); vecText(q, String(S.score).padStart(2, "0"), W * 0.06, H * 0.03, 5 * s); vecText(q, String(AST_HI), W * 0.47, H * 0.03, 3.2 * s); q.stroke();
      for (k = 0; k < S.lives; k++) {
        var LP = [[0, -1], [0.62, 0.75], [0.3, 0.45], [-0.3, 0.45], [-0.62, 0.75]], lx = W * 0.06 + k * 22 * s + 8 * s, ly = H * 0.03 + 50 * s, z = 10 * s;
        q.beginPath(); q.moveTo(lx + LP[0][0] * z, ly + LP[0][1] * z); q.lineTo(lx + LP[1][0] * z, ly + LP[1][1] * z); q.moveTo(lx + LP[0][0] * z, ly + LP[0][1] * z); q.lineTo(lx + LP[4][0] * z, ly + LP[4][1] * z); q.moveTo(lx + LP[2][0] * z, ly + LP[2][1] * z); q.lineTo(lx + LP[3][0] * z, ly + LP[3][1] * z); q.stroke();
      }
      var g0 = r.ctx; g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1; g0.fillStyle = "#000"; g0.fillRect(0, 0, W, H);
      g0.drawImage(ph, 0, 0);
      r.bloom(ph, 0.6 + 0.45 * lv + 0.35 * S.beat, 0.005, 2);
      scanlines(r, 0.06);
    }
  });

  /* ---------------- demo conversation (gallery + previews): analysed speech clips on a loop ---------------- */
  function simTexture(t) {
    var v = 0.30 + 0.38 * Math.abs(Math.sin(t * 3.3)) + 0.26 * Math.abs(Math.sin(t * 7.9 + 1.7)) * (0.5 + 0.5 * Math.sin(t * 1.3));
    return Math.min(1, v);
  }
  var DEMO_TEXT = {
    user: "Okay Nabu, can you show me something beautiful?",
    reply: "Of course. Here's a little light show: twenty-two different looks, all dancing to my voice. Pick your favourite, and I'll wear it every time we talk."
  };
  var demoClips = null;
  function getDemoClips() { if (!demoClips) demoClips = { user: unpackClip(VV_DEMO.user), reply: unpackClip(VV_DEMO.reply) }; return demoClips; }

  function Demo(offset) { this.offset = offset || 0; this.fb = new FrameBuilder(); this.bands = new Float32Array(32); this.last = -1; }
  Demo.prototype.timeline = function () {
    var c = getDemoClips(), a = 0.6, b = a + c.user.dur + 0.3, p = b + 1.3, e = p + c.reply.dur + 0.4;
    return { a: a, b: b, p: p, e: e, L: e + 2.2 };
  };
  // now: seconds. Returns the frame plus the transcript the overlay would be showing at that moment.
  Demo.prototype.sample = function (now) {
    var c = getDemoClips(), T = this.timeline(), tt = (((now + this.offset) % T.L) + T.L) % T.L, st, clip = null, ct = 0, crisp = false, b;
    if (tt < T.a) st = "idle";
    else if (tt < T.b) { st = "listening"; clip = c.user; ct = tt - T.a - 0.1; }
    else if (tt < T.p) st = "processing";
    else if (tt < T.e) { st = "responding"; clip = c.reply; ct = tt - T.p - 0.15; crisp = true; }
    else st = "idle";
    var lvl = 0, bands = null;
    if (clip) {
      var idx = Math.floor(ct / 0.02);
      if (idx >= 0 && idx < clip.frames) { lvl = clip.env[idx]; for (b = 0; b < 32; b++) this.bands[b] = clip.bands[idx * 32 + b]; }
      else for (b = 0; b < 32; b++) this.bands[b] = 0;
      bands = this.bands;
    }
    var target = st === "processing" ? 0.42 + 0.14 * simTexture(now) : st === "responding" ? 0.12 + 0.88 * lvl : st === "listening" ? lvl : 0;
    var dt = this.last < 0 ? 1 / 30 : clamp(now - this.last, 0, 0.1); this.last = now;
    var f = this.fb.build({ t: now, dt: dt, state: st, target: target, voice: lvl, crisp: crisp, bands: bands, wave: null, person: null });
    return {
      f: f, state: st,
      status: st === "listening" ? "Listening" : st === "processing" ? "Thinking" : "",
      user: tt >= T.b ? DEMO_TEXT.user : "",
      reply: tt >= T.p ? DEMO_TEXT.reply : ""
    };
  };

  /* ---------------- Stage: canvas + transcript, laid out per skin (used by the overlay and the gallery) ---------------- */
  var VV_STYLE = [
    ".vv-stage{position:relative;overflow:hidden;background:#000;font-family:'Google Sans',Roboto,Noto,-apple-system,'Segoe UI',sans-serif;}",
    ".vv-overlay{position:fixed;inset:0;z-index:2147483000;opacity:0;visibility:hidden;transition:opacity .5s ease,visibility .5s ease;pointer-events:none;}",
    ".vv-overlay.show{opacity:1;visibility:visible;}",
    ".vv-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}",
    ".vv-content{position:absolute;display:flex;flex-direction:column;box-sizing:border-box;gap:1.6vmin;pointer-events:none;}",
    ".vv-thumb .vv-content{display:none;}",
    // layouts
    ".vv-l-full .vv-content{inset:0;justify-content:center;padding:0 8%;}",
    ".vv-l-left .vv-content{top:0;bottom:0;left:0;right:44%;justify-content:center;padding:0 3% 0 7%;}",
    ".vv-l-bottom .vv-content{left:7%;right:7%;bottom:5%;max-height:30%;justify-content:flex-end;align-items:center;text-align:center;}",
    ".vv-l-top .vv-content{left:7%;right:7%;top:5%;max-height:34%;justify-content:flex-start;align-items:center;text-align:center;}",
    // text
    ".vv-status{font-size:clamp(11px,1.1vw,15px);letter-spacing:.3em;text-transform:uppercase;min-height:1.2em;}",
    ".vv-user{font-size:clamp(20px,3.1vw,40px);line-height:1.25;text-wrap:balance;}",
    ".vv-assistant{font-size:clamp(24px,3.8vw,48px);line-height:1.3;text-wrap:pretty;max-height:52vh;overflow:hidden;}",
    ".vv-l-bottom .vv-user,.vv-l-top .vv-user{font-size:clamp(17px,2.2vw,30px);}",
    ".vv-l-bottom .vv-assistant,.vv-l-top .vv-assistant{font-size:clamp(19px,2.6vw,36px);max-height:17vh;}",
    ".vv-long .vv-assistant{font-size:clamp(17px,2.2vw,30px);}",
    ".vv-user:empty,.vv-assistant:empty{display:none;}",
    // themes
    ".vv-t-default .vv-status{color:rgba(230,236,255,.55);text-shadow:0 0 8px rgba(0,0,0,.9);}",
    ".vv-t-default .vv-user{color:rgba(230,236,255,.8);text-shadow:0 0 4px rgba(0,0,0,.95),0 0 14px rgba(0,0,0,.75),0 2px 4px rgba(0,0,0,.8);}",
    ".vv-t-default .vv-assistant{color:#e6ecff;text-shadow:0 0 4px rgba(0,0,0,.95),0 0 14px rgba(0,0,0,.85),0 2px 4px rgba(0,0,0,.9);}",
    ".vv-t-warm .vv-status{color:#ffb638;text-shadow:0 0 10px rgba(255,150,40,.45);}",
    ".vv-t-warm .vv-user{color:rgba(255,236,205,.78);text-shadow:0 0 4px rgba(0,0,0,.95),0 2px 6px rgba(0,0,0,.8);}",
    ".vv-t-warm .vv-assistant{color:#ffe7c2;text-shadow:0 0 12px rgba(255,160,50,.28),0 0 4px rgba(0,0,0,.95),0 2px 6px rgba(0,0,0,.85);}",
    ".vv-t-terminal .vv-content{font-family:'Cascadia Mono','Consolas','Courier New',monospace;}",
    ".vv-t-terminal .vv-status{color:#5dff9a;text-shadow:0 0 8px rgba(80,255,140,.6);}",
    ".vv-t-terminal .vv-status:not(:empty)::before{content:'> ';}",
    ".vv-t-terminal .vv-status:not(:empty)::after{content:'_';animation:vvBlink 1s steps(1) infinite;}",
    ".vv-t-terminal .vv-user{color:rgba(150,255,190,.72);text-shadow:0 0 6px rgba(80,255,140,.35);}",
    ".vv-t-terminal .vv-user::before{content:'you: ';opacity:.6;}",
    ".vv-t-terminal .vv-assistant{color:#aaffc8;text-shadow:0 0 8px rgba(80,255,140,.55),0 0 2px rgba(0,0,0,.9);}",
    ".vv-t-terminal.vv-l-bottom .vv-user{font-size:clamp(14px,1.7vw,24px);}",
    ".vv-t-terminal.vv-l-bottom .vv-assistant{font-size:clamp(16px,2vw,28px);}",
    // Mother (Alien): uppercase aqua phosphor inside the terminal, a typed "> " inquiry and a block cursor on the status
    ".vv-t-mother .vv-content{font-family:'Cascadia Mono','Consolas','Lucida Console','Courier New',monospace;text-transform:uppercase;letter-spacing:.04em;}",
    ".vv-t-mother .vv-status{color:#8cffd6;text-shadow:0 0 8px rgba(90,255,200,.6);}",
    ".vv-t-mother .vv-status:not(:empty)::after{content:'\\2588';margin-left:.35em;animation:vvBlink 1s steps(1) infinite;}",
    ".vv-t-mother .vv-user{color:rgba(160,255,225,.72);text-shadow:0 0 6px rgba(90,255,200,.35);font-size:clamp(15px,1.9vw,26px);}",
    ".vv-t-mother .vv-user::before{content:'> ';}",
    ".vv-t-mother .vv-assistant{color:#b6ffe6;text-shadow:0 0 9px rgba(90,255,200,.55),0 0 2px rgba(0,0,0,.9);font-size:clamp(17px,2.3vw,31px);}",
    ".vv-t-mother.vv-long .vv-assistant{font-size:clamp(14px,1.8vw,24px);}",
    // Light Cycles (Tron): cyan for you, a warm glow for the assistant
    ".vv-t-tron .vv-status{color:#6fe8ff;text-shadow:0 0 10px rgba(60,220,255,.75);}",
    ".vv-t-tron .vv-user{color:rgba(205,246,255,.84);text-shadow:0 0 8px rgba(60,220,255,.4),0 0 3px rgba(0,0,0,.9);}",
    ".vv-t-tron .vv-assistant{color:#fff2e2;text-shadow:0 0 14px rgba(255,150,40,.5),0 0 3px rgba(0,0,0,.95);}",
    // LCARS (Star Trek): flat condensed capitals in the console palette, inside the frame's upper panel
    ".vv-l-lcars .vv-content{left:22%;right:5%;top:17%;max-height:36%;justify-content:flex-start;align-items:flex-start;text-align:left;gap:1.2vmin;}",
    ".vv-t-lcars .vv-content{font-family:'Antonio','Bahnschrift Condensed','Bahnschrift','Arial Narrow','Roboto Condensed',sans-serif;font-stretch:condensed;text-transform:uppercase;letter-spacing:.03em;}",
    ".vv-t-lcars .vv-status{color:#ff9966;letter-spacing:.12em;}",
    ".vv-t-lcars .vv-user{color:#99ccff;font-size:clamp(17px,2.4vw,33px);}",
    ".vv-t-lcars .vv-assistant{color:#ffcc99;font-size:clamp(19px,2.9vw,40px);max-height:25vh;}",
    ".vv-t-lcars.vv-long .vv-assistant{font-size:clamp(16px,2.2vw,30px);}",
    // 1980s arcade: chunky monospace capitals, a yellow "player" status, white glowing text
    ".vv-t-arcade .vv-content{font-family:'Lucida Console','Consolas','Courier New',monospace;text-transform:uppercase;letter-spacing:.05em;font-weight:700;}",
    ".vv-t-arcade .vv-status{color:#ffe600;text-shadow:0 0 10px rgba(255,220,0,.6);}",
    ".vv-t-arcade .vv-status:not(:empty)::after{content:'_';animation:vvBlink 1s steps(1) infinite;}",
    ".vv-t-arcade .vv-user{color:#7ff3ff;text-shadow:0 0 8px rgba(60,220,255,.45),0 0 3px rgba(0,0,0,.9);font-size:clamp(15px,1.9vw,26px);}",
    ".vv-t-arcade .vv-assistant{color:#fff;text-shadow:0 0 10px rgba(255,255,255,.35),0 0 3px rgba(0,0,0,.95);font-size:clamp(17px,2.35vw,32px);line-height:1.35;}",
    ".vv-t-arcade.vv-long .vv-assistant{font-size:clamp(14px,1.9vw,26px);}",
    // vector monitor: thin white capitals with a phosphor glow
    ".vv-t-vector .vv-content{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:.14em;font-weight:300;}",
    ".vv-t-vector .vv-status{color:rgba(255,255,255,.75);text-shadow:0 0 8px rgba(200,220,255,.8);}",
    ".vv-t-vector .vv-user{color:rgba(225,235,255,.78);text-shadow:0 0 8px rgba(160,190,255,.5);}",
    ".vv-t-vector .vv-assistant{color:#fff;text-shadow:0 0 10px rgba(210,225,255,.85),0 0 2px rgba(255,255,255,.9);}",
    "@keyframes vvBlink{50%{opacity:0;}}",
    "@media (prefers-reduced-motion: reduce){.vv-overlay{transition:none;}.vv-t-terminal .vv-status::after,.vv-t-mother .vv-status::after{animation:none;}}"
  ].join("");
  function injectStyle() {
    if (document.getElementById("vv-style")) return;
    var st = document.createElement("style"); st.id = "vv-style"; st.textContent = VV_STYLE; (document.head || document.documentElement).appendChild(st);
  }

  // opts: { overlay, thumb, quality, skin }
  function Stage(host, opts) {
    opts = opts || {};
    injectStyle();
    this.base = "vv-stage" + (opts.overlay ? " vv-overlay" : "") + (opts.thumb ? " vv-thumb" : "");
    this.el = document.createElement("div"); this.el.className = this.base;
    this.canvas = document.createElement("canvas"); this.canvas.className = "vv-canvas";
    this.content = document.createElement("div"); this.content.className = "vv-content";
    this.content.innerHTML = "<div class='vv-status'></div><div class='vv-user'></div><div class='vv-assistant'></div>";
    this.el.appendChild(this.canvas); this.el.appendChild(this.content);
    this.elStatus = this.content.children[0]; this.elUser = this.content.children[1]; this.elReply = this.content.children[2];
    this.txt = ["", "", ""]; this.shown = false;
    host.appendChild(this.el);
    this.renderer = new Renderer(this.canvas, { quality: opts.quality || 1, thumb: !!opts.thumb });
    this.setSkin(opts.skin || SKINS[0].id);
  }
  Stage.prototype.setSkin = function (id) {
    var sk = this.renderer.setSkin(id); this.skin = sk; this.applyClass(); return sk;
  };
  Stage.prototype.applyClass = function () {
    var sk = this.skin;
    this.el.className = this.base + " vv-l-" + (sk.layout || "full") + " vv-t-" + (sk.text || "default") +
      (this.txt[2].length > 150 ? " vv-long" : "") + (this.shown ? " show" : "");
  };
  Stage.prototype.show = function (on) { if (this.shown !== !!on) { this.shown = !!on; this.applyClass(); } };
  Stage.prototype.text = function (status, user, reply) {
    status = status || ""; user = user || ""; reply = reply || "";
    if (status !== this.txt[0]) { this.txt[0] = status; this.elStatus.textContent = status; }
    if (user !== this.txt[1]) { this.txt[1] = user; this.elUser.textContent = user; }
    if (reply !== this.txt[2]) { var wasLong = this.txt[2].length > 150; this.txt[2] = reply; this.elReply.textContent = reply; if (wasLong !== reply.length > 150) this.applyClass(); }
  };
  // Would this reply fit the reply box without clipping? Measured on a hidden twin with the same classes and width.
  Stage.prototype.replyFits = function (text) {
    var m = this.twin, c = this.content;
    if (!m) {
      m = this.twin = document.createElement("div"); m.className = "vv-assistant"; m.setAttribute("aria-hidden", "true");
      m.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;max-height:none;overflow:visible;";
      c.appendChild(m);
    }
    var cs = getComputedStyle(c), rs = getComputedStyle(this.elReply), H = this.el.clientHeight;
    function px(v) { return /%$/.test(v) ? parseFloat(v) * H / 100 : parseFloat(v); }   // % max-heights stay % when computed
    m.style.width = Math.max(50, c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + "px";
    m.textContent = text;
    var others = this.elStatus.offsetHeight + this.elUser.offsetHeight + 2 * (parseFloat(cs.rowGap) || 0);
    var room = px(rs.maxHeight), box = px(cs.maxHeight);
    if (isNaN(box)) box = c.clientHeight;
    room = isNaN(room) ? box - others : Math.min(room, box - others);
    return m.scrollHeight <= room + 1;
  };
  Stage.prototype.draw = function (f) { this.renderer.render(f); if (this.renderer.skin !== this.skin) { this.skin = this.renderer.skin; this.applyClass(); } };
  Stage.prototype.destroy = function () { if (this.el.parentNode) this.el.parentNode.removeChild(this.el); };

  /* ---------------- Home Assistant overlay: a full-screen voice visual driven by an Assist satellite ----------------
     Follows an assist_satellite entity (configured, or the first one found). The transcript comes from optional sensors or
     from Home Assistant's own record of each run (assist pipeline debug, admin users only), and the reply is shown as caption
     pages turned in time with the speech. Some satellites report idle before a long reply has finished playing, so the turn
     is held open while the satellite's speaker (a media_player on the same device) is still playing.
     Level/spectrum sources, best first:
       responding -> the REAL reply audio (pipeline debug tts_output -> fetch -> analyse), played back in sync with the speaker
       listening  -> this screen's own microphone (needs HTTPS)
       fallbacks  -> an optional room-level sensor, then an organic texture.
     The skin comes from input_select.voice_visual if it exists ("Surprise me" = a different one each turn), else config/localStorage.
     Shows on every dashboard unless config "dashboards" narrows it; localStorage vvOverlay = "1" (force on) / "0" (off). */
  var OV = { stage: null, fb: null, raf: null, lastT: 0, lastFrame: 0, hideTimer: null, lastActive: false, userSnap: "", replySnap: "",
             cur: "idle", lastSkin: null, demo: null, timers: [], dbg: null, dbgRaf: null, frameMs: 0, fpsCap: 30, started: false, dead: false, 
             turnWall: 0, turnAt: 0, heardRun: "", sawPlaying: false, spkIdleAt: 0, spokeEnd: 0, holdUntil: 0 };

  function getHass() { if (window.__mockHass) return window.__mockHass; var ha = document.querySelector("home-assistant"); return ha && ha.hass; }
  function stOf(hass, id) { var s = hass && hass.states && hass.states[id]; if (!s) return undefined; var v = s.state; return (v === "unknown" || v === "unavailable") ? "" : v; }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  var autoSat = "", autoSpk = "";
  function satEnt(hass) {                                    // the configured satellite, else the first one Home Assistant has
    if (CFG.stateEnt) return CFG.stateEnt;
    if (!autoSat && hass && hass.states) for (var id in hass.states) if (id.indexOf("assist_satellite.") === 0) { autoSat = id; break; }
    return autoSat;
  }
  function spkEnt(hass) {                                    // the configured speaker, else a media_player on the satellite's device
    if (CFG.speakerEnt) return CFG.speakerEnt;
    if (autoSpk || !hass || !hass.entities) return autoSpk;
    var reg = hass.entities[satEnt(hass)], dev = reg && reg.device_id;
    if (dev) for (var id in hass.entities) if (id.indexOf("media_player.") === 0 && hass.entities[id].device_id === dev) { autoSpk = id; break; }
    return autoSpk;
  }
  function overlayAllowed() {
    var o = lsGet("vvOverlay");
    if (o === "0") return false;
    if (o === "1") return true;
    return location.pathname.indexOf(CFG.panelPath) === 0;
  }

  /* ---- panel microphone: level + 32-band spectrum + a 20ms waveform ---- */
  var audioCtx = null, analyser = null, micTd = null, micFd = null, micState = "none", micErr = "", micStream = null;
  var micPk = 0.02, micTop = -60, micEdges = null, micBands = new Float32Array(32), micWave = new Float32Array(256);
  function ensureMic() {
    if (window.__mockLevel != null) { micState = "mock"; return; }
    if (micState === "live" || micState === "pending") {
      if (audioCtx && audioCtx.state === "suspended") { try { audioCtx.resume(); } catch (e) {} }
      return;
    }
    if (micState === "failed" && !window.isSecureContext) return;           // HTTP page: no mic API, don't retry
    micState = "pending";
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { micState = "failed"; micErr = "no-getUserMedia"; return; }
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === "suspended") { try { audioCtx.resume(); } catch (e) {} }
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(function (stream) {
          if (OV.dead) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          micStream = stream;
          var src = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.5;
          micTd = new Float32Array(1024); micFd = new Float32Array(512); micEdges = bandEdges(audioCtx.sampleRate, 1024);
          src.connect(analyser);
          micState = "live"; micErr = "";
        })
        .catch(function (e) { micState = "failed"; micErr = (e && (e.name || e.message)) || "?"; });
    } catch (e) { micState = "failed"; micErr = (e && (e.name || e.message)) || "?"; }
  }
  function micRead() {
    if (window.__mockLevel != null) return { level: clamp(+window.__mockLevel, 0, 1), bands: null, wave: null };
    if (micState !== "live" || !analyser) return null;
    analyser.getFloatTimeDomainData(micTd);
    var n = micTd.length, s = 0, pk = 0, i, b, k;
    for (i = 0; i < n; i++) { var a = micTd[i] < 0 ? -micTd[i] : micTd[i]; s += a; if (a > pk) pk = a; }
    var level = clamp((s / n - CFG.micGate) * CFG.micGain, 0, 1);
    micPk = Math.max(pk, micPk * 0.97, 0.015);
    var n20 = Math.min(n, Math.round(audioCtx.sampleRate * 0.02)), st0 = n - n20, gw = Math.min(1, level * 1.3) / micPk;
    for (i = 0; i < 256; i++) micWave[i] = clamp(micTd[st0 + Math.floor(i * n20 / 256)] * gw, -1.2, 1.2);
    analyser.getFloatFrequencyData(micFd);
    var mx = -200;
    for (b = 0; b < 32; b++) { var m = -200; for (k = micEdges[b]; k < Math.min(micEdges[b + 1], 512); k++) if (micFd[k] > m) m = micFd[k]; micBands[b] = m; if (m > mx) mx = m; }
    micTop = Math.max(mx, micTop - 0.25, -75);
    var gate = smoothstep(0.03, 0.25, level);
    for (b = 0; b < 32; b++) micBands[b] = clamp((micBands[b] - (micTop - 50)) / 50, 0, 1) * gate;
    return { level: level, bands: micBands, wave: micWave };
  }
  function readRoom() {
    var s = stOf(getHass(), CFG.roomEnt); if (!s) return null;
    var v = parseFloat(s); return isNaN(v) ? null : v;
  }

  /* ---- the reply: drive the visual from the REAL reply audio ----
     HA records every assistant run (pipeline_debug) including the TTS audio URL. When the satellite starts responding we fetch
     that same audio (HA synthesises once and shares it), analyse it (envelope + spectrum + waveform) and play the analysis
     back in time with the speaker. Needs an admin user (the pipeline debug data is admin-only). */
  var tts = null, ttsStartAt = 0, ttsReadyAt = 0, ttsBusy = false, ttsLastIdx = -1, ttsRun = "", ttsInfo = "none", pipeIds = null;
  var ttsBands = new Float32Array(32), ttsWave = new Float32Array(256);
  function wsCall(msg) { var h = getHass(); return (h && h.connection) ? h.connection.sendMessagePromise(msg) : Promise.reject("no-connection"); }
  function runTs(r) { return Date.parse(String(r.timestamp).replace(/(\.\d{3})\d+/, "$1")) || 0; }
  function speechOf(ev) {
    var d = ev && ev.data, r = d && d.intent_output && d.intent_output.response, p = r && r.speech && r.speech.plain;
    return (p && p.speech) || "";
  }
  function fetchTts(attempt) {
    if (ttsBusy) return;
    ttsBusy = true; ttsInfo = "finding"; attempt = attempt || 0;
    var prevRun = ttsRun, since = OV.turnWall - 20000, retry = false;   // this turn's run: started with the wake word
    (pipeIds ? Promise.resolve(pipeIds) : wsCall({ type: "assist_pipeline/pipeline/list" }).then(function (r) {
      pipeIds = (r.pipelines || []).map(function (p) { return p.id; }); return pipeIds;
    })).then(function (ids) {
      return Promise.all(ids.map(function (id) {
        return wsCall({ type: "assist_pipeline/pipeline_debug/list", pipeline_id: id }).then(function (r) {
          return (r.pipeline_runs || []).slice(-3).map(function (run) { return { id: id, run: run }; });
        }).catch(function () { return []; });
      }));
    }).then(function (lists) {
      // keyed by run, not by audio URL: asking the same thing twice gives the same cached URL
      var cands = [].concat.apply([], lists).filter(function (c) { return runTs(c.run) >= since && c.run.pipeline_run_id !== prevRun; })
        .sort(function (a, b) { return runTs(b.run) - runTs(a.run); });
      function tryAt(i) {
        if (i >= cands.length || i >= 8) throw "no-satellite-run";
        var c = cands[i];
        return wsCall({ type: "assist_pipeline/pipeline_debug/get", pipeline_id: c.id, pipeline_run_id: c.run.pipeline_run_id }).then(function (g) {
          var ev = g.events || [];
          function first(type) { return ev.filter(function (e) { return e.type === type; })[0]; }
          var rs = first("run-start");
          if (!rs || !rs.data || rs.data.satellite_id !== satEnt(getHass())) return tryAt(i + 1);   // another satellite's run
          var te = first("tts-end"), ts = first("tts-start");
          var out = (te && te.data && te.data.tts_output) || rs.data.tts_output;
          if (!out || !out.url) throw "no-tts-url";
          ttsRun = c.run.pipeline_run_id;
          var said = (ts && ts.data && ts.data.tts_input) || speechOf(first("intent-end"));
          var se = first("stt-end"), heard = se && se.data && se.data.stt_output && se.data.stt_output.text;
          if (heard && !CFG.heardEnt) OV.heardRun = String(heard).trim();
          if (said && OV.cur === "responding") capSet(said, true);           // the whole reply (a sensor state holds only 255 characters)
          return out.url;
        });
      }
      return tryAt(0);
    }).then(function (url) {
      ttsInfo = "synthesising";
      return fetch(url).then(function (r) { if (!r.ok) throw "http-" + r.status; return r.arrayBuffer(); });
    }).then(function (buf) {
      var readyAt = performance.now();                                   // the audio is ready for the satellite too
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = audioCtx || new AC();
      return audioCtx.decodeAudioData(buf).then(function (ab) { return { ab: ab, readyAt: readyAt }; });
    }).then(function (o) {
      if (OV.cur !== "responding") throw "late";                          // the turn moved on while we fetched
      tts = analyzeBuffer(o.ab);
      ttsReadyAt = o.readyAt; ttsStartAt = o.readyAt + leadMs(tts.dur); ttsLastIdx = -1;
      OV.holdUntil = ttsStartAt + tts.dur * 1000 + CFG.speakHoldMs;
      capTimeline();
      ttsInfo = "ready " + tts.dur.toFixed(1) + "s, starts +" + Math.round(ttsStartAt - o.readyAt) + "ms";
    }).catch(function (e) {
      ttsInfo = "fallback:" + e;
      retry = (e === "no-satellite-run" || e === "no-tts-url") && attempt < 3;  // the run may not be recorded yet
    }).then(function () {
      ttsBusy = false;
      if (retry) OV.timers.push(setTimeout(function () { if (OV.cur === "responding" && !tts) fetchTts(attempt + 1); }, 500));
    });
  }

  /* ---- when does the satellite start talking? The audio is ready at the same moment for it and for us, but it only starts
     once it has fetched the whole clip: ~0.3s + ~0.12s per second of speech. Each turn's real end (the speaker going
     idle) tells us when it actually started, and the last dozen turns refine both numbers. ---- */
  var leadFit = null;
  function leadModel() {
    if (leadFit) return leadFit;
    var obs = [], base = CFG.ttsLeadMs, perS = CFG.ttsLeadPerS;
    try { obs = JSON.parse(lsGet("vvLeadObs") || "[]") || []; } catch (e) {}
    var n = obs.length, mD = 0, mL = 0, sDD = 0, sDL = 0, i;
    for (i = 0; i < n; i++) { mD += obs[i][0] / n; mL += obs[i][1] / n; }
    for (i = 0; i < n; i++) { sDD += (obs[i][0] - mD) * (obs[i][0] - mD); sDL += (obs[i][0] - mD) * (obs[i][1] - mL); }
    if (n >= 3 && sDD / n > 4) {                                            // varied lengths: fit both
      perS = clamp(sDL / sDD / 1000, 0, 0.3); base = clamp(mL - perS * 1000 * mD, 0, 3000);
    } else if (n) {                                                         // keep the measured base, fit the slope
      var sd = 0, sl = 0;
      for (i = 0; i < n; i++) if (obs[i][0] >= 4) { sd += obs[i][0] * obs[i][0]; sl += obs[i][0] * (obs[i][1] - base); }
      if (sd) perS = clamp(sl / sd / 1000, 0, 0.3);
    }
    return (leadFit = { base: base, perS: perS });
  }
  function leadMs(durS) { var m = leadModel(); return m.base + m.perS * durS * 1000; }
  function learnLead(endAt) {
    if (!tts || !ttsReadyAt) return;
    var lead = endAt - CFG.endLagMs - tts.dur * 1000 - ttsReadyAt;
    if (tts.dur < 1.5 || lead < 0 || lead > 20000) return;
    var obs = [];
    try { obs = JSON.parse(lsGet("vvLeadObs") || "[]") || []; } catch (e) {}
    obs.push([+tts.dur.toFixed(2), Math.round(lead)]);
    lsSet("vvLeadObs", JSON.stringify(obs.slice(-12))); leadFit = null;
    ttsInfo += ", really started +" + Math.round(lead) + "ms";
  }

  /* ---- captions: the reply is cut into pages that fit the reply box (whole sentences where possible) and each page
     is shown while it is spoken. Page turns snap to the pauses in the real audio. ---- */
  var cap = null;
  function pageText(text, fits) {
    function ok(t) { return t.length <= CFG.capMaxChars && fits(t); }
    function pack(units) {                                                // greedy: as many units per page as fit
      var out = [], cur = "";
      units.forEach(function (u) {
        var cand = cur ? cur + " " + u : u;
        if (cur && !ok(cand)) { out.push(cur); cur = u; } else cur = cand;
      });
      if (cur) out.push(cur);
      return out;
    }
    var pieces = [];
    text.replace(/([.!?]+["')\]]*)\s+(?=["'(\[]?[A-Z0-9\u00a3])/g, "$1\u0001").split("\u0001").forEach(function (s) {
      if (ok(s)) { pieces.push(s); return; }
      pack(s.replace(/([,;:])\s+/g, "$1\u0001").split("\u0001")).forEach(function (c) {      // too long: clauses...
        if (ok(c)) pieces.push(c); else pack(c.split(" ")).forEach(function (w) { pieces.push(w); });   // ...then words
      });
    });
    return pack(pieces);
  }
  function capSet(text, full) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text || (cap && cap.full)) return;                                 // the full text wins over the sensor's copy
    if (cap && cap.text === text) { cap.full = cap.full || !!full; return; }
    var S = OV.stage;
    S.text(S.txt[0], S.txt[1], "");                                         // measure at the normal (not "long") size
    cap = { text: text, full: !!full, pages: pageText(text, function (t) { return S.replyFits(t); }), bounds: [], dur: 0 };
    capTimeline();
  }
  function spokenLen(t) {           // numbers and initials take longer to say than to write ("12:30 AM", "93 percent", "ESS")
    return t.length + 1 + 2.5 * (t.match(/\d/g) || []).length - (t.match(/:/g) || []).length +
      (t.match(/\b[A-Z]{2,4}\b/g) || []).reduce(function (a, w) { return a + 2 * w.length; }, 0);
  }
  // Piper pauses at nearly every comma and full stop, so line the punctuation up with the pauses IN ORDER (allowing the odd
  // missing or extra pause); a page then turns at the pause that belongs to its last punctuation mark.
  function alignMarks(expect, pauses) {
    var M = expect.length, P = pauses.length, SKIP = 1200, i, j, c = [], how = [];
    for (i = 0; i <= M; i++) { c.push(new Float64Array(P + 1)); how.push(new Int8Array(P + 1)); }
    for (i = 0; i <= M; i++) for (j = 0; j <= P; j++) {
      if (!i && !j) continue;
      var best = 1e18, h = 0;
      if (i && j) { best = c[i - 1][j - 1] + Math.abs(expect[i - 1] - pauses[j - 1]); h = 1; }          // mark i at pause j
      if (i && c[i - 1][j] + SKIP < best) { best = c[i - 1][j] + SKIP; h = 2; }                          // a mark with no pause
      if (j && c[i][j - 1] + SKIP < best) { best = c[i][j - 1] + SKIP; h = 3; }                          // a pause with no mark
      c[i][j] = best; how[i][j] = h;
    }
    var at = new Array(M); i = M; j = P;
    while (i || j) { var hh = how[i][j]; if (hh === 1) { at[i - 1] = pauses[j - 1]; i--; j--; } else if (hh === 2) i--; else j--; }
    return at;                                                              // pause start per mark (undefined = none)
  }
  function capTimeline() {
    if (!cap) return;
    var n = cap.pages.length, lens = cap.pages.map(spokenLen), tot = lens.reduce(function (a, b) { return a + b; }, 0), acc = 0, prev = 0, k, i;
    cap.bounds = [];
    if (!tts) {                                                             // no audio yet: the usual pace
      cap.dur = cap.text.length / CFG.speechCps * 1000;
      for (k = 0; k < n - 1; k++) { acc += lens[k]; cap.bounds.push(cap.dur * acc / tot); }
      return;
    }
    // The words are spread over the VOICED time, so each character's expected moment is where its share of the spoken
    // length falls on that clock. Pauses = 200ms+ under 8% of the level, between the first and last word.
    var F = tts.frames, voiced = new Float32Array(F), vc = 0, pauses = [], run = 0, first = -1, lastV = 0;
    for (i = 0; i < F; i++) { if (tts.env[i] >= 0.08) { vc++; if (first < 0) first = i; lastV = i; } voiced[i] = vc; }
    for (i = 0; i <= F; i++) {
      if (i < F && tts.env[i] < 0.08) run++;
      else { if (run >= 10 && i - run > first && i <= lastV) pauses.push((i - run) * 20); run = 0; }
    }
    cap.dur = tts.dur * 1000;
    var text = cap.pages.join(" "), all = spokenLen(text);
    function when(idx) {                                                    // expected end of the character at idx
      var want = vc * spokenLen(text.slice(0, idx + 1)) / all, f = 0;
      while (f < F - 1 && voiced[f] < want) f++;
      return f * 20;
    }
    var marks = [], expect = [], re = /[.,;:!?](?=\s)/g, m;
    while ((m = re.exec(text))) { marks.push(m.index); expect.push(when(m.index)); }
    var at = alignMarks(expect, pauses), end = -2;
    for (k = 0; k < n - 1; k++) {
      end += cap.pages[k].length + 1;                                       // index of the page's last character
      var mi = marks.indexOf(end), t = mi >= 0 && at[mi] != null ? at[mi] + 60 : when(end);
      t = Math.max(t, prev + 400);
      cap.bounds.push(t); prev = t;
    }
  }
  function capPage(now) {
    if (!cap) return "";
    var last = cap.pages.length - 1, t;
    if (OV.spokeEnd) return cap.pages[last];                                // finished: leave the last words up
    if (tts && ttsStartAt) t = now - ttsStartAt;
    else if (!ttsBusy && OV.turnAt) t = now - OV.turnAt - cap.dur * CFG.synthRtf - CFG.ttsLeadMs;   // no audio: pace from the reply's start
    else return cap.pages[0];
    for (var i = 0; i < cap.bounds.length; i++) if (t < cap.bounds[i]) return cap.pages[i];
    return cap.pages[last];
  }
  function ttsNow() {
    if (!tts) return ttsBusy ? { level: 0.15, pending: true } : null;       // synthesising: calm; failed: fall back
    var t = performance.now() - ttsStartAt, k;
    if (t < 0) return { level: 0.05, pending: true };                        // the speaker is about to start
    var idx = Math.floor(t / 20);
    if (idx >= tts.frames) return { level: 0, done: true };                  // finished
    var from = Math.min(Math.max(0, ttsLastIdx + 1), idx), m = 0;
    for (k = from; k <= idx; k++) if (tts.env[k] > m) m = tts.env[k];      // don't miss short syllables between frames
    ttsLastIdx = idx;
    for (k = 0; k < 32; k++) ttsBands[k] = tts.bands[idx * 32 + k];
    var c = Math.floor(t / 1000 * tts.dsr), n = Math.round(tts.dsr * 0.02), s0 = c - n, inv = 1 / tts.peak;
    for (k = 0; k < 256; k++) { var p = s0 + Math.floor(k * n / 256); ttsWave[k] = (p >= 0 && p < tts.mono.length) ? clamp(tts.mono[p] * inv, -1.2, 1.2) : 0; }
    return { level: m, bands: ttsBands, wave: ttsWave };
  }

  function inputs(time) {
    var st = OV.cur, o = { target: 0, voice: 0, crisp: false, bands: null, wave: null };
    if (st === "processing") { o.target = 0.42 + 0.14 * simTexture(time); return o; }
    if (st !== "listening" && st !== "responding") return o;
    if (st === "responding") {
      var e = ttsNow();
      if (e && e.done && OV.sawPlaying && !OV.spokeEnd) {                  // our clock ran out but the speaker is still talking
        o.target = Math.min(1, 0.48 + 0.34 * Math.abs(Math.sin(time * 5.2)) + 0.22 * simTexture(time)); o.voice = o.target * 0.7;
        return o;
      }
      if (e) {
        o.target = 0.12 + 0.88 * e.level;
        if (!e.pending && !e.done) { o.voice = e.level; o.crisp = true; o.bands = e.bands; o.wave = e.wave; }
        return o;
      }
    }
    var m = micRead();
    if (m) { o.target = m.level; o.voice = m.level; o.bands = m.bands; o.wave = m.wave; }
    else if (st === "listening") {
      var room = readRoom(), act = room == null ? 0.5 : clamp((0.92 - room) / 0.85, 0, 1);
      o.target = Math.min(1, 0.18 + 0.62 * act + 0.24 * simTexture(time)); o.voice = o.target * 0.7;
    } else {
      o.target = Math.min(1, 0.48 + 0.34 * Math.abs(Math.sin(time * 5.2)) + 0.22 * simTexture(time)); o.voice = o.target * 0.7;
    }
    if (st === "responding") o.target = Math.max(o.target, 0.3);           // stay bright while the reply plays
    return o;
  }

  function frame() {
    OV.raf = requestAnimationFrame(frame);
    var now = performance.now();
    if (now - OV.lastFrame < 1000 / OV.fpsCap - 2) return;
    OV.lastFrame = now;
    var time = now / 1000, dt = OV.lastT ? Math.min(0.1, time - OV.lastT) : 1 / 30; OV.lastT = time;
    if (OV.demo) {
      if (time > OV.demo.end) { stopDemo(); return; }
      var ds = OV.demo.d.sample(time); OV.stage.draw(ds.f); OV.stage.text(ds.status, ds.user, ds.reply); return;
    }
    var i = inputs(time);
    var f = OV.fb.build({ t: time, dt: dt, state: OV.cur, target: i.target, voice: i.voice, crisp: i.crisp, bands: i.bands, wave: i.wave, person: null });
    var t0 = performance.now(); OV.stage.draw(f); OV.frameMs = OV.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }
  function startLoop() { if (OV.raf == null) { OV.lastFrame = 0; OV.lastT = 0; OV.raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (OV.raf != null) { cancelAnimationFrame(OV.raf); OV.raf = null; } }

  function chooseSkin() {
    var want = stOf(getHass(), CFG.selectEnt) || lsGet("vvSkin") || CFG.skin, id;        // shared helper first, else this screen's pick
    if (want === SURPRISE) {
      var pool = SKINS.filter(function (s) { return s.id !== OV.lastSkin && !OV.stage.renderer.broken[s.id]; });
      id = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : SKINS[0].id;
    } else {
      var sk = want ? skinByName(want) : null;
      id = sk ? sk.id : SKINS[0].id;
    }
    OV.lastSkin = id; OV.stage.setSkin(id);
  }

  /* ---- demo on the real overlay (the gallery's "Full screen" button): one scripted conversation, tap to stop ---- */
  function playDemo(skinId) {
    if (!OV.stage || OV.lastActive || OV.dead) return false;                // never over a real conversation
    if (OV.hideTimer) { clearTimeout(OV.hideTimer); OV.hideTimer = null; }
    var now = performance.now() / 1000, d = new Demo(0);
    d.offset = -now; OV.demo = { d: d, end: now + d.timeline().L - 0.4 };
    OV.stage.setSkin(skinId === SURPRISE ? SKINS[Math.floor(Math.random() * SKINS.length)].id : (skinByName(skinId) || SKINS[0]).id);
    OV.stage.text("", "", ""); OV.stage.show(true);
    OV.stage.el.style.pointerEvents = "auto"; OV.stage.el.onclick = stopDemo;
    startLoop();
    return true;
  }
  function stopDemo() {
    if (!OV.demo) return;
    OV.demo = null; OV.stage.el.style.pointerEvents = ""; OV.stage.el.onclick = null;
    if (!OV.lastActive) { OV.stage.show(false); stopLoop(); }
  }

  function render(state, user, reply, speaker) {
    if (!CFG.heardEnt) user = OV.heardRun || "";              // no transcript sensor: the run's speech-to-text
    var now = performance.now(), allowed = overlayAllowed(), playing = speaker === "playing";
    if (OV.cur === "responding") {                                          // follow the speaker through the reply
      if (playing) { OV.sawPlaying = true; OV.spkIdleAt = 0; }
      else if (OV.sawPlaying && !OV.spokeEnd) {                             // stopped for 0.4s = finished
        if (!OV.spkIdleAt) OV.spkIdleAt = now;
        else if (now - OV.spkIdleAt >= 400) { OV.spokeEnd = OV.spkIdleAt; learnLead(OV.spkIdleAt); }
      }
    }
    // some satellites report idle before a long reply has finished playing: stay until the speaker stops
    if (state === "idle" && OV.cur === "responding" && allowed && OV.sawPlaying && !OV.spokeEnd && now < OV.holdUntil) state = "responding";
    var active = (state === "listening" || state === "processing" || state === "responding") && allowed;
    var S = OV.stage;
    if (OV.demo) { if (!active) return; stopDemo(); }                         // a real conversation beats the demo
    if (active && !OV.lastActive) {
      if (!CFG.heardEnt) { OV.heardRun = ""; user = ""; }
      OV.userSnap = user || ""; OV.replySnap = reply || ""; OV.turnWall = Date.now();
      S.text("", "", ""); tts = null; cap = null; ttsInfo = "none";
      chooseSkin(); ensureMic(); startLoop();
    }
    if (active && state === "responding" && OV.cur !== "responding") {     // the reply starts
      tts = null; cap = null; OV.turnAt = now; OV.sawPlaying = playing; OV.spkIdleAt = 0; OV.spokeEnd = 0; OV.holdUntil = now + 120000;
      fetchTts();
    }
    OV.cur = active ? state : "idle";
    if (active) {
      if (OV.hideTimer) { clearTimeout(OV.hideTimer); OV.hideTimer = null; }
      S.show(true);
      var said = reply && reply !== OV.replySnap ? reply : "";
      if (state === "responding" && said) capSet(said, false);             // the sensor's copy until the full text arrives
      S.text(state === "listening" ? "Listening" : state === "processing" ? "Thinking" : "",
             user && user !== OV.userSnap ? user : S.txt[1], cap ? capPage(now) : (said || S.txt[2]));
    } else {
      if (S.shown && !OV.hideTimer) {
        S.text("", S.txt[1], S.txt[2]);
        var fadeMs = CFG.idleFadeMs;
        OV.hideTimer = setTimeout(function () { S.show(false); OV.hideTimer = null; stopLoop(); }, fadeMs);
      } else if (!S.shown) stopLoop();
    }
    OV.lastActive = active;
  }
  function tick() {
    try {
      var hass = getHass();
      if (!hass || !hass.states) return;
      var sat = satEnt(hass); if (!sat) return;
      var s = stOf(hass, sat);
      if (s === undefined) return;
      if (s === "") s = "idle";
      render(s, stOf(hass, CFG.heardEnt) || "", stOf(hass, CFG.replyEnt) || "", stOf(hass, spkEnt(hass)) || "");
    } catch (e) {}
  }
  function startDebug() {
    OV.dbg = document.createElement("div");
    OV.dbg.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;font:13px monospace;color:#0f0;background:rgba(0,0,0,.75);padding:4px 8px;border-radius:5px;pointer-events:none;";
    document.body.appendChild(OV.dbg);
    (function loop() {
      if (OV.dead) return;
      var m = micState === "live" ? micRead() : null;
      OV.dbg.textContent = "vv " + VERSION + "  skin:" + (OV.stage.skin && OV.stage.skin.id) + "  mic:" + micState + (micErr ? "(" + micErr + ")" : "") +
        "  micLvl:" + (m ? m.level.toFixed(2) : "--") + "  reply:" + ttsInfo + "  energy:" + OV.fb.U.toFixed(2) + "  draw:" + OV.frameMs.toFixed(1) + "ms";
      OV.dbgRaf = requestAnimationFrame(loop);
    })();
  }
  function startOverlay() {
    if (OV.started || OV.dead) return;
    if (!document.body) { OV.timers.push(setTimeout(startOverlay, 150)); return; }
    OV.started = true;
    OV.fb = new FrameBuilder();
    OV.stage = new Stage(document.body, { overlay: true, skin: lsGet("vvSkin") || CFG.skin || SKINS[0].id });
    OV.fpsCap = clamp(+(lsGet("vvFps") || 30) || 30, 10, 120);
    OV.timers.push(setInterval(tick, CFG.pollMs));
    tick();
    if (overlayAllowed()) ensureMic();              // open the panel mic up front (the kiosk flag auto-grants it)
    if (lsGet("vvDebug") === "1") startDebug();
  }
  function destroyOverlay() {
    OV.dead = true; stopLoop();
    OV.timers.forEach(function (h) { clearInterval(h); clearTimeout(h); }); OV.timers = [];
    if (OV.hideTimer) clearTimeout(OV.hideTimer);
    if (OV.dbgRaf) cancelAnimationFrame(OV.dbgRaf);
    if (OV.dbg && OV.dbg.parentNode) OV.dbg.parentNode.removeChild(OV.dbg);
    if (OV.stage) OV.stage.destroy();
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    if (audioCtx && audioCtx.close) { try { audioCtx.close(); } catch (e) {} }
    var st = document.getElementById("vv-style"); if (st && st.parentNode) st.parentNode.removeChild(st);
  }

  /* ---------------- public API ---------------- */
  window.VoiceVisuals = {
    version: VERSION, skins: SKINS, skinByName: skinByName, SURPRISE: SURPRISE, CFG: CFG,
    Renderer: Renderer, FrameBuilder: FrameBuilder, Stage: Stage, Demo: Demo, DEMO_TEXT: DEMO_TEXT, analyzeBuffer: analyzeBuffer,
    isBusy: function () { return !!(OV.lastActive || OV.hideTimer || OV.demo); },
    destroy: destroyOverlay, playDemo: playDemo, stopDemo: stopDemo,
    overlay: OV,
    captions: function () { return cap && { pages: cap.pages, bounds: cap.bounds, dur: cap.dur, full: cap.full, startsIn: tts ? ttsStartAt - performance.now() : null, audio: ttsInfo, lead: leadModel() }; }
  };
  if (!window.__VV_NO_OVERLAY) startOverlay();
})();
