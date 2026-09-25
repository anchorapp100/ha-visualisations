  /* ---------- Fireworks — every syllable launches a shell; loud words burst bigger; the sky and the skyline flash with them ----------
     Rockets rise to a height set by the syllable's strength and burst as peony, ring or willow shells. Sparks fly with drag and a
     little gravity into a fading trail buffer (long streaks), glitter as they die, and the whole buffer blooms. */
  register({
    id: "fireworks", name: "Fireworks", layout: "bottom", text: "default",
    blurb: "A night-sky fireworks show — every syllable launches a shell, loud words burst bigger, and the whole sky blooms.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(404), i;
      S.R = R; S.rockets = []; S.sparks = []; S.flashes = []; S.nextAuto = 0; S.mix = 0; S.gold = 0; S.max = r.thumb ? 700 : 1800;
      S.ground = H * 0.86;
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, "#010208"); gr.addColorStop(0.55, "#050a1a"); gr.addColorStop(0.86, "#0d1430"); gr.addColorStop(1, "#070a16");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (i = 0; i < (r.thumb ? 120 : 260); i++) { var b = 0.15 + R() * R() * 0.7, s = (0.5 + R()) * u; g.fillStyle = "rgba(220,230,255," + b.toFixed(3) + ")"; g.fillRect(R() * W, R() * H * 0.7, s, s); }
      S.bg = bg;
      var sk = mkCanvas(W, H), q = sk.getContext("2d"), x = 0;
      q.fillStyle = "#03040a";
      var wins = [];
      while (x < W) {                                                  // a city skyline, windows dimly lit
        var bw = (26 + R() * 70) * u, bh = H * (0.05 + R() * R() * 0.13), top = S.ground - bh;
        q.fillRect(x, top, bw + 1, H - top);
        if (R() < 0.25) q.fillRect(x + bw * 0.4, top - bh * 0.25, bw * 0.12, bh * 0.25);
        for (var wy = top + 6 * u; wy < S.ground - 4 * u; wy += 9 * u) for (var wx = x + 5 * u; wx < x + bw - 6 * u; wx += 8 * u) if (R() < 0.16) wins.push([wx, wy]);
        x += bw + (R() < 0.3 ? R() * 16 * u : 0);
      }
      q.fillRect(0, S.ground, W, H - S.ground);
      q.fillStyle = "rgba(255,200,110,0.55)"; for (i = 0; i < wins.length; i++) q.fillRect(wins[i][0], wins[i][1], 3 * u, 3.4 * u);
      S.sky = sk;
      S.PA = [[120, 210, 255], [70, 130, 255], [140, 255, 220], [235, 245, 255]];
      S.PB = [[255, 95, 205], [255, 70, 120], [255, 205, 100], [200, 130, 255]];
      S.PG = [[255, 205, 95], [255, 165, 60], [255, 235, 170], [255, 190, 110]];
    },
    launch: function (S, W, H, str, t) {
      var R = S.R, y0 = S.ground, yb = H * (0.44 - 0.26 * str) + (R() - 0.5) * H * 0.06, gy = 0.55 * H;
      var vy = -Math.sqrt(2 * gy * Math.max(10, y0 - yb)), x = W * (0.2 + 0.6 * R());
      var r = R(), type = str > 0.7 && r < 0.3 ? "ring" : r < 0.22 ? "willow" : "peony";
      S.rockets.push({ x: x, y: y0, vx: (R() - 0.5) * W * 0.05, vy: vy, str: str, type: type, ci: (R() * 4) | 0, t0: t });
    },
    burst: function (S, H, rk, cols, t) {
      var R = S.R, n = Math.round((60 + 120 * rk.str) * (S.max < 1000 ? 0.5 : 1)), sp = H * (0.2 + 0.24 * rk.str), c = cols[rk.ci], c2 = cols[(rk.ci + 1) % cols.length], i;
      for (i = 0; i < n && S.sparks.length < S.max; i++) {
        var a = R() * TAU, v = rk.type === "ring" ? sp : sp * (0.35 + 0.65 * Math.sqrt(R())), willow = rk.type === "willow";
        S.sparks.push({ x: rk.x, y: rk.y, vx: Math.cos(a) * v * (willow ? 0.7 : 1), vy: Math.sin(a) * v * (willow ? 0.7 : 1),
          c: willow ? S.PG[(R() * 2) | 0] : (R() < 0.8 ? c : c2), t0: t, life: willow ? 2.4 + R() * 0.8 : 1.1 + R() * 0.8,
          drag: willow ? 2.4 : 1.35, grav: willow ? 0.5 : 0.28, tw: R() < 0.45, s: willow ? 1 : 1.4 });
      }
      S.flashes.push({ x: rk.x, y: rk.y, t0: t, a: 0.1 + 0.2 * rk.str, c: c });
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      var talk = st === "listening" || st === "responding", proc = st === "processing", R = S.R;
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      var cols = []; for (k = 0; k < 4; k++) cols.push(mixc(mixc(S.PA[k], S.PB[k], S.mix), S.PG[k], S.gold));
      if (talk && f.onset && S.rockets.length < 8) this.launch(S, W, H, 0.4 + 0.6 * f.voice, t);
      if (t > S.nextAuto) {
        if (talk) { S.nextAuto = t + 0.9 - 0.55 * lv; if (lv > 0.2) this.launch(S, W, H, 0.3 + 0.5 * lv, t); }
        else if (proc) { S.nextAuto = t + 0.45; this.launch(S, W, H, 0.22, t); }
        else { S.nextAuto = t + 2.6 + 2 * R(); this.launch(S, W, H, 0.3, t); }
      }
      var acc = r.buf("fwacc", W, H), a = acc.getContext("2d");
      a.globalCompositeOperation = "source-over"; a.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.84, dt * 30)).toFixed(3) + ")"; a.fillRect(0, 0, W, H);
      a.globalCompositeOperation = "lighter";
      var gy = 0.55 * H, trail = new Path2D();
      for (i = S.rockets.length - 1; i >= 0; i--) {
        var rk = S.rockets[i];
        var px = rk.x, py = rk.y;                                      // a continuous streak, not dots, at any frame rate
        rk.vy += gy * dt; rk.x += rk.vx * dt; rk.y += rk.vy * dt;
        trail.moveTo(px, py); trail.lineTo(rk.x, rk.y);
        if (R() < 0.8) S.sparks.push({ x: rk.x, y: rk.y, vx: (R() - 0.5) * 30 * u, vy: 40 * u, c: [255, 220, 170], t0: t, life: 0.35, drag: 3, grav: 0.2, tw: false, s: 0.8 });
        if (rk.vy > -0.06 * H) { this.burst(S, H, rk, cols, t); S.rockets.splice(i, 1); }
      }
      a.lineWidth = 1.6 * u; a.lineCap = "round"; a.strokeStyle = "rgba(255,205,140,0.6)"; a.stroke(trail);
      var buckets = {}, keys = [];
      for (i = S.sparks.length - 1; i >= 0; i--) {
        var p = S.sparks[i], age = t - p.t0;
        if (age > p.life) { S.sparks.splice(i, 1); continue; }
        var d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vy += gy * p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        var fade = 1 - age / p.life, al = fade * fade;
        if (p.tw && fade < 0.45 && R() < 0.5) al *= 0.2;               // glitter as they die
        var lvl = al > 0.66 ? 2 : al > 0.3 ? 1 : 0, key = p.c.join(",") + "|" + lvl;
        if (!buckets[key]) { buckets[key] = { path: new Path2D(), c: p.c, lvl: lvl }; keys.push(key); }
        var sz = p.s * (1.2 + 1.2 * fade) * u;
        buckets[key].path.rect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      var alv = [0.3, 0.62, 1];
      for (k = 0; k < keys.length; k++) { var bk = buckets[keys[k]]; a.fillStyle = rgba(mixc(bk.c, [255, 255, 255], bk.lvl * 0.18), alv[bk.lvl]); a.fill(bk.path); }
      a.globalCompositeOperation = "source-over";
      var g = r.ctx;
      g.drawImage(S.bg, 0, 0);
      g.globalCompositeOperation = "lighter";
      var sky = 0;
      for (i = S.flashes.length - 1; i >= 0; i--) {
        var fl = S.flashes[i], fa = 1 - (t - fl.t0) / 0.45;
        if (fa <= 0) { S.flashes.splice(i, 1); continue; }
        sky = Math.max(sky, fa * fl.a);
        var rad = H * 0.55, fg = g.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rad);
        fg.addColorStop(0, rgba(fl.c, fl.a * fa)); fg.addColorStop(1, rgba(fl.c, 0));
        g.fillStyle = fg; g.fillRect(fl.x - rad, fl.y - rad, rad * 2, rad * 2);
      }
      g.drawImage(acc, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.drawImage(S.sky, 0, 0);
      g.save(); g.beginPath(); g.rect(0, S.ground, W, H - S.ground); g.clip();   // the harbour mirrors the show
      g.translate(0, S.ground); g.scale(1, -0.26); g.translate(0, -S.ground); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.34;
      g.drawImage(acc, 0, 0); g.restore();
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      var wf = g.createLinearGradient(0, S.ground, 0, H); wf.addColorStop(0, "rgba(2,3,9,0)"); wf.addColorStop(1, "rgba(2,3,9,0.85)");
      g.fillStyle = wf; g.fillRect(0, S.ground, W, H - S.ground);
      if (sky > 0.01) {                                                // the skyline catches the light of each burst
        g.globalCompositeOperation = "lighter";
        var hz = g.createLinearGradient(0, S.ground - H * 0.2, 0, S.ground);
        hz.addColorStop(0, "rgba(0,0,0,0)"); hz.addColorStop(1, rgba(cols[0], sky * 0.6));
        g.fillStyle = hz; g.fillRect(0, S.ground - H * 0.2, W, H * 0.2);
        g.globalCompositeOperation = "source-over";
      }
      r.bloom(acc, 0.85 + 0.5 * lv, 0.022, 2);
    }
  });
