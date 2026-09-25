  /* ---------- Mercury — liquid-chrome metaballs: loud syllables fling droplets that flow back and merge ----------
     Field = sum of (1 - d^2/R^2)^3 kernels on a low-res grid; height = sqrt(field - 0.5) scaled by the local radius, which
     is within a few % of a true sphere for a lone drop and bulges smoothly where drops merge. Shaded by a studio environment map. */
  register({
    id: "mercury", name: "Mercury", layout: "bottom", text: "default",
    blurb: "Liquid chrome that throws off droplets on every syllable — and pulls them back in.",
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
