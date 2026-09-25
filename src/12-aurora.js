  /* ---------- Aurora — northern-lights curtains: green = you, violet = the assistant; syllables send ripples ---------- */
  register({
    id: "aurora", name: "Aurora", layout: "bottom", text: "default",
    blurb: "Northern lights over the pines — green curtains for you, violet for the assistant, rippling on every syllable.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(21), i;
      var sky = mkCanvas(W, H), g = sky.getContext("2d"), sg = g.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, "#010208"); sg.addColorStop(0.45, "#030b1c"); sg.addColorStop(0.8, "#08193a"); sg.addColorStop(1, "#0c2144");
      g.fillStyle = sg; g.fillRect(0, 0, W, H);
      var mw = g.createRadialGradient(W * 0.5, H * 1.1, 0, W * 0.5, H * 1.1, H * 0.9); mw.addColorStop(0, "rgba(40,90,140,0.18)"); mw.addColorStop(1, "rgba(40,90,140,0)");
      g.fillStyle = mw; g.fillRect(0, 0, W, H); S.sky = sky;
      S.stars = [];
      var ns = Math.round(240 * (r.thumb ? 0.5 : 1));
      for (i = 0; i < ns; i++) S.stars.push({ x: R() * W, y: Math.pow(R(), 1.4) * H * 0.78, s: (0.4 + R() * R() * 1.6) * u, b: 0.25 + R() * 0.75, rate: 0.6 + R() * 2.4, ph: R() * TAU });
      // treeline
      var tl = mkCanvas(W, H), t = tl.getContext("2d");
      t.fillStyle = "#01030a"; t.beginPath(); t.moveTo(0, H);
      for (var x = 0; x <= W; x += 6 * u) t.lineTo(x, H * (0.905 + 0.035 * noise1(x / W * 4.3 + 2) - 0.02 * noise1(x / W * 13)));
      t.lineTo(W, H); t.closePath(); t.fill();
      var np = Math.round(W / (9 * u));
      for (i = 0; i < np; i++) {
        var px = R() * W, base = H * (0.905 + 0.035 * noise1(px / W * 4.3 + 2) - 0.02 * noise1(px / W * 13)) + 2 * u, ph = H * (0.03 + R() * R() * 0.085), pw = ph * (0.28 + R() * 0.12);
        t.beginPath();
        for (var lv = 0; lv < 4; lv++) {
          var ty = base - ph * (lv / 4), tw = pw * (1 - lv / 5);
          t.moveTo(px - tw / 2, ty); t.lineTo(px, ty - ph * 0.42); t.lineTo(px + tw / 2, ty);
        }
        t.moveTo(px - pw * .05, base); t.lineTo(px, base - ph); t.lineTo(px + pw * .05, base); t.fill();
      }
      S.tree = tl;
      function sprite(stops) {
        var c = mkCanvas(1, 128), q = c.getContext("2d"), gr = q.createLinearGradient(0, 128, 0, 0);
        stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); q.fillStyle = gr; q.fillRect(0, 0, 1, 128); return c;
      }
      S.spG = sprite([[0, "rgba(200,255,225,0)"], [0.035, "rgba(200,255,225,0.9)"], [0.09, "rgba(70,255,155,0.95)"], [0.33, "rgba(40,220,165,0.55)"], [0.62, "rgba(60,160,210,0.25)"], [0.85, "rgba(120,90,220,0.1)"], [1, "rgba(120,90,220,0)"]]);
      S.spV = sprite([[0, "rgba(255,215,245,0)"], [0.035, "rgba(255,215,245,0.9)"], [0.09, "rgba(255,95,205,0.95)"], [0.33, "rgba(190,75,255,0.55)"], [0.62, "rgba(110,85,255,0.25)"], [0.85, "rgba(60,60,200,0.1)"], [1, "rgba(60,60,200,0)"]]);
      S.rib = [
        { own: 0, y: 0.52, a1: 0.05, k1: 0.9, s1: 0.18, a2: 0.03, k2: 2.3, s2: 0.27, hr: 0.4, seed: 1 },
        { own: 0, y: 0.6, a1: 0.04, k1: 1.4, s1: -0.13, a2: 0.025, k2: 3.1, s2: 0.35, hr: 0.3, seed: 7 },
        { own: 1, y: 0.45, a1: 0.06, k1: 0.7, s1: 0.11, a2: 0.035, k2: 1.9, s2: -0.22, hr: 0.38, seed: 13 },
        { own: 1, y: 0.56, a1: 0.04, k1: 1.7, s1: -0.2, a2: 0.02, k2: 2.7, s2: 0.3, hr: 0.28, seed: 21 }];
      S.ph = 0; S.rip = []; S.e = [0.35, 0.35]; S.shoot = null; S.nextShoot = 6 + R() * 8; S.R = R;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, i;
      S.ph += f.dt * (0.55 + 1.5 * f.slow);
      var st = f.state, lv = f.level;
      var eY = st === "listening" ? 0.4 + 1.25 * lv : st === "processing" ? 0.42 + 0.12 * Math.sin(t * 2.2) : 0.3 + 0.1 * f.slow;
      var eL = st === "responding" ? 0.4 + 1.25 * lv : st === "processing" ? 0.42 + 0.12 * Math.sin(t * 2.2 + 1.3) : 0.28 + 0.1 * f.slow;
      S.e[0] = follow(S.e[0], eY, .3, .08, f.dt); S.e[1] = follow(S.e[1], eL, .3, .08, f.dt);
      if (f.onset) S.rip.push({ x0: 0.2 + S.R() * 0.6, t0: t, amp: 0.035 + 0.08 * f.voice, own: st === "responding" ? 1 : 0 });
      S.rip = S.rip.filter(function (q) { return t - q.t0 < 3; });
      var bw = Math.round(W / 2), bh = Math.round(H / 2), ab = r.buf("aur", bw, bh), a = ab.getContext("2d");
      a.globalCompositeOperation = "source-over"; a.clearRect(0, 0, bw, bh); a.globalCompositeOperation = "lighter";
      var step = 3, ph = S.ph;
      for (var k = 0; k < S.rib.length; k++) {
        var R = S.rib[k], e = S.e[R.own], sp = R.own ? S.spV : S.spG;
        for (var x = 0; x < bw; x += step) {
          var xn = x / bw, y = R.y * bh + R.a1 * bh * Math.sin(R.k1 * xn * TAU + R.s1 * ph * 3 + R.seed) + R.a2 * bh * Math.sin(R.k2 * xn * TAU - R.s2 * ph * 3 + R.seed * 2)
            + 0.022 * bh * (noise1(xn * 11 + ph * 0.8 + R.seed) - 0.5) * 2;                          // small folds along the hem
          for (i = 0; i < S.rip.length; i++) {
            var q = S.rip[i]; if (q.own !== R.own) continue;
            var age = t - q.t0, d1 = xn - (q.x0 + 0.33 * age), d2 = xn - (q.x0 - 0.33 * age);
            y -= q.amp * bh * (Math.exp(-d1 * d1 / 0.004) + Math.exp(-d2 * d2 / 0.004)) * Math.exp(-age * 1.1);
          }
          var fold = noise1(xn * 5 + ph * 0.35 + R.seed), rays = 0.55 + 0.45 * noise1(xn * 38 + ph * 1.6 + R.seed * 3);
          var I = e * (0.25 + 0.75 * fold * fold) * rays * smoothstep(0, 0.07, xn) * smoothstep(1, 0.93, xn);
          if (I < 0.01) continue;
          var h = R.hr * bh * (0.55 + 0.45 * noise1(xn * 3 - ph * 0.25 + R.seed)) * (0.75 + 0.45 * Math.min(e, 1.2));
          a.globalAlpha = clamp(I, 0, 1); a.drawImage(sp, 0, 0, 1, 128, x, y - h, step + 0.7, h);
        }
      }
      a.globalAlpha = 1;
      var g = r.ctx;
      g.drawImage(S.sky, 0, 0);
      for (i = 0; i < S.stars.length; i++) {
        var s = S.stars[i], b = s.b * (0.55 + 0.45 * Math.sin(t * s.rate + s.ph));
        g.fillStyle = "rgba(220,235,255," + b.toFixed(3) + ")"; g.fillRect(s.x, s.y, s.s, s.s);
      }
      if (!S.shoot && t > S.nextShoot) S.shoot = { t0: t, x: W * (0.15 + S.R() * 0.5), y: H * (0.05 + S.R() * 0.25), dx: W * (0.25 + S.R() * 0.2), dy: H * (0.12 + S.R() * 0.1) };
      if (S.shoot) {
        var sa = (t - S.shoot.t0) / 0.9;
        if (sa >= 1) { S.shoot = null; S.nextShoot = t + 12 + S.R() * 14; }
        else {
          var hx = S.shoot.x + S.shoot.dx * sa, hy = S.shoot.y + S.shoot.dy * sa, tx = hx - S.shoot.dx * 0.18, ty = hy - S.shoot.dy * 0.18;
          var sg = g.createLinearGradient(tx, ty, hx, hy); sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(1, "rgba(255,255,255," + (0.9 * Math.sin(sa * Math.PI)).toFixed(3) + ")");
          g.strokeStyle = sg; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
        }
      }
      g.globalCompositeOperation = "lighter"; g.imageSmoothingEnabled = true; g.drawImage(ab, 0, 0, W, H); g.globalCompositeOperation = "source-over";
      r.bloom(ab, 0.9, 0.035, 2);
      var hz = g.createLinearGradient(0, H * 0.78, 0, H * 0.93), em = clamp((S.e[0] + S.e[1]) * 0.18, 0, 0.5);
      hz.addColorStop(0, "rgba(80,200,170,0)"); hz.addColorStop(1, "rgba(" + (S.e[1] > S.e[0] ? "200,90,220" : "80,220,160") + "," + em.toFixed(3) + ")");
      g.globalCompositeOperation = "lighter"; g.fillStyle = hz; g.fillRect(0, H * 0.78, W, H * 0.15); g.globalCompositeOperation = "source-over";
      g.drawImage(S.tree, 0, 0);
    }
  });
