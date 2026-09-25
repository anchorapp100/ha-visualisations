  /* ---------- Halo — 72 mirrored spectrum bars round a ring, with a zoom-feedback tunnel; syllables flash the ring ---------- */
  register({
    id: "halo", name: "Halo", layout: "bottom", text: "default",
    blurb: "A ring of mirrored spectrum bars that tunnels into light — each syllable flashes a shockwave outward.",
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
