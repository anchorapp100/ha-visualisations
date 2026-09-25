  /* ---------- Orb — a living sphere of 1,500 points: the spectrum sculpts it, syllables ripple across it ---------- */
  register({
    id: "orb", name: "Orb", layout: "bottom", text: "default",
    blurb: "A living sphere of light points — your voice sculpts its surface and every syllable ripples across it.",
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
