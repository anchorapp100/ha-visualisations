  /* ---------- Tesla — a plasma globe: filaments crawl to the glass, multiply with your voice and crackle on syllables ---------- */
  register({
    id: "tesla", name: "Tesla", layout: "bottom", text: "default",
    blurb: "A plasma globe — lightning filaments multiply with your voice and crackle on every syllable.",
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
