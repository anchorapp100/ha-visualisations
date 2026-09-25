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
    text.replace(/([.!?]+["')\]]*)\s+(?=["'(\[]?[A-Z0-9£])/g, "$1\u0001").split("\u0001").forEach(function (s) {
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
