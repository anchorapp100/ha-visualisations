  /* ---------- Ribbons — silk-light ribbons that twist and cross; additive colours merge to white ---------- */
  register({
    id: "ribbons", name: "Ribbons", layout: "top", text: "default",
    blurb: "Silky ribbons of light that twist and cross — colours melt into white where they overlap.",
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
