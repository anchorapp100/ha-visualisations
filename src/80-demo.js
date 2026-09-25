  /* ---------------- demo conversation (gallery + previews): analysed speech clips on a loop ---------------- */
  function simTexture(t) {
    var v = 0.30 + 0.38 * Math.abs(Math.sin(t * 3.3)) + 0.26 * Math.abs(Math.sin(t * 7.9 + 1.7)) * (0.5 + 0.5 * Math.sin(t * 1.3));
    return Math.min(1, v);
  }
  var DEMO_TEXT = {
    user: "Okay Nabu, can you show me something beautiful?",
    reply: "Of course. Here's a little light show: eighteen different looks, all dancing to my voice. Pick your favourite, and I'll wear it every time we talk."
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
