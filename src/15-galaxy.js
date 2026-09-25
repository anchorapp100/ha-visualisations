  /* ---------- Galaxy — a tilted spiral that spins up with your voice; syllables send shockwaves through the arms ---------- */
  register({
    id: "galaxy", name: "Galaxy", layout: "left", text: "default",
    blurb: "A spiral galaxy that spins up as you talk — every syllable sends a shockwave rippling through its arms.",
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
