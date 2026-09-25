  /* ---------- Paint Splash — liquid paint thrown on every syllable: glossy colour blobs that splash, merge and settle ----------
     Same bounded-kernel metaball field as Mercury, but each blob carries a paint colour: colours blend by squared field weight
     (distinct paint with soft seams), shaded as glossy wet paint (diffuse + Blinn highlight + darker creases). Dead blobs leave a
     fading stain behind. Cool paint for your voice, hot paint for the assistant's, a slow swirl while it thinks. */
  register({
    id: "paint-splash", name: "Paint Splash", layout: "left", text: "default",
    blurb: "Liquid paint thrown on every syllable — glossy splashes that fly, merge and settle: cool colours for you, hot for the assistant.",
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
