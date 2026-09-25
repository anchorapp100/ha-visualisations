  /* ---------- HAL 9000 — the red eye from 2001: A Space Odyssey, set in its brushed-aluminium panel ----------
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
