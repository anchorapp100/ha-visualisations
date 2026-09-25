  /* ---------- Defender: a side-scrolling planet where the mountains are your voices ----------
     The ship flies right over a jagged planet surface generated from whoever is speaking, so the conversation scrolls past as
     a mountain range. Your syllables thrust the ship on and fire its rainbow laser at landers, mutants and baiters, which burst
     into rings of pixels. When the assistant answers, its syllables send landers down to snatch humanoids (one that reaches the
     top becomes a mutant), and its loudest moments set off a smart bomb. The top panel carries the scanner (a radar of the
     neighbourhood), the score, ships and smart bombs. Sprites are original designs in the style of the era. */
  register({
    id: "defender", name: "Defender", layout: "bottom", text: "arcade", hiDpi: true,
    blurb: "A scrolling planet whose mountains are your voices. Your syllables fire the laser; the assistant's voice sends landers after the humanoids.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, i;
      var p = S.p = Math.max(2, Math.round(3 * u));
      S.top = H * 0.17; S.base = H * 0.68; S.R = rng(1981);
      var PAL = { w: "#ffffff", p: "#b060ff", y: "#ffe040", r: "#ff4040", g: "#40ff60", m: "#ff40ff", b: "#c050ff", h: "#ffffff", c: "#60e0ff" };
      S.ship = pixSprite(["...ww...........", "..wwwp..........", "pwwwwwwwwwwyy...", "wwwwwwwwwwwwwwww", "pwwwwwwwwww.....", ".pp............."], PAL, p);
      S.kinds = {
        lander: { spr: pixSprite(["...ggg...", "..ggggg..", ".gg.g.gg.", "ggggggggg", ".gyyyyyg.", "..y.y.y..", ".y..y..y.", "y...y...y"], PAL, p), col: [64, 255, 96], pts: 150 },
        mutant: { spr: pixSprite(["..mmmmm..", ".mgmgmgm.", "mmmmmmmmm", "m.m.m.m.m", ".mmmmmmm.", "..g...g..", ".g.g.g.g.", "g...g...g"], PAL, p), col: [255, 64, 255], pts: 150 },
        baiter: { spr: pixSprite(["..ggggggggg..", "ggggggggggggg", ".g.g.g.g.g.g.", "..ggggggggg.."], PAL, p), col: [96, 255, 96], pts: 200 }
      };
      S.human = pixSprite([".h.", "hhh", ".b.", "bbb", ".b.", ".b.", "b.b", "b.b"], PAL, p);
      S.cam = 0; S.shipY = 0.45; S.terr = []; S.stepW = 7 * p; S.enemies = []; S.humans = []; S.parts = []; S.lasers = [];
      S.score = 0; S.lives = 3; S.bombs = 3; S.flash = 0; S.lastBomb = -99; S.nextHuman = 0;
      S.stars = []; for (i = 0; i < 110; i++) S.stars.push({ x: S.R() * W, y: S.top + S.R() * (S.base - S.top) * 0.95, d: 0.15 + S.R() * 0.5, c: [[255, 255, 255], [255, 120, 120], [120, 200, 255], [255, 240, 120]][(S.R() * 4) | 0], ph: S.R() * TAU });
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, p = S.p, i, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing";
      var top = S.top, base = S.base, span = base - top;
      // ---- flight: your voice is thrust; the camera follows the ship, which sits a third of the way across
      var speed = W * (listen ? 0.25 + 1.1 * lv : reply ? 0.3 : think ? 0.16 : 0.22);
      S.cam += speed * dt;
      var shipX = S.cam + W * 0.3;
      // ---- terrain: new ground appears ahead, its height taken from whoever is speaking right now
      var sw = S.stepW;
      if (!S.terr.length) for (var x0 = S.cam - W * 1.6; x0 < S.cam + W * 2.6; x0 += sw) S.terr.push({ x: x0, h: 0.06 + 0.05 * noise1(x0 * 0.004) + 0.03 * R() });
      while (S.terr[S.terr.length - 1].x < S.cam + W * 2.6) {                // plain ground far ahead (the scanner shows it)...
        var lx = S.terr[S.terr.length - 1].x + sw;
        S.terr.push({ x: lx, h: clamp(0.06 + 0.05 * noise1(lx * 0.004) + 0.035 * (R() - 0.3), 0.02, 0.2) });
      }
      var voiced = (listen || reply) ? f.voice * (0.18 + 0.22 * lv) + 0.12 * f.level : 0;
      for (i = S.terr.length - 1; i >= 0 && S.terr[i].x > S.cam + W * 0.98; i--) {   // ...raised by the voice as it comes on screen
        var s0 = S.terr[i];
        if (!s0.v && s0.x < S.cam + W * 1.04) { s0.v = true; s0.h = clamp(s0.h + voiced, 0.02, 0.42); }
      }
      while (S.terr.length && S.terr[0].x < S.cam - W * 1.7) S.terr.shift();
      function groundAt(wx) {
        var i0 = Math.floor((wx - S.terr[0].x) / sw); i0 = clamp(i0, 0, S.terr.length - 2);
        var a = S.terr[i0], b = S.terr[i0 + 1], fr = clamp((wx - a.x) / sw, 0, 1);
        return a.h + (b.h - a.h) * fr;
      }
      // ---- humanoids stand on the ground every so often; enemies are topped up ahead of the ship
      if (!S.nextHuman) S.nextHuman = S.cam;
      while (S.nextHuman < S.cam + W * 2.4) { S.humans.push({ x: S.nextHuman + R() * W * 0.3, y: 0, held: null, fall: 0 }); S.nextHuman += W * (0.45 + 0.4 * R()); }
      S.humans = S.humans.filter(function (h) { return h.x > S.cam - W * 1.7; });
      S.humans.forEach(function (h) { if (!h.held) { var gy = 1 - groundAt(h.x); if (h.fall) { h.y += h.fall * dt; h.fall += 1.2 * dt; if (h.y >= gy) { h.y = gy; h.fall = 0; } } else h.y = gy; } });
      var ahead = S.enemies.filter(function (e) { return e.x > S.cam - W * 0.2 && e.x < S.cam + W * 2.4; }).length;
      while (ahead < 9) {
        var kind = R() < 0.62 ? "lander" : R() < 0.6 ? "mutant" : "baiter";
        S.enemies.push({ kind: kind, x: S.cam + W * (1.05 + 1.3 * R()), y: 0.1 + 0.5 * R(), vx: (R() - 0.5) * 0.08, ph: R() * TAU, grab: null, target: null }); ahead++;
      }
      S.enemies = S.enemies.filter(function (e) { return e.x > S.cam - W * 1.7; });
      // ---- the assistant's syllables send a lander after a humanoid; its loudest moment is a smart bomb
      if (reply && f.onset) {
        var cands = S.enemies.filter(function (e) { return e.kind === "lander" && !e.grab && !e.target && e.x > S.cam && e.x < S.cam + W; });
        if (cands.length) {
          var en = cands[(R() * cands.length) | 0], best = null, bd = 1e9;
          S.humans.forEach(function (h) { if (!h.held && !h.fall) { var d = Math.abs(h.x - en.x); if (d < bd) { bd = d; best = h; } } });
          if (best && bd < W * 0.6) en.target = best;
        }
        if (lv > 0.62 && t - S.lastBomb > 7 && S.bombs > 0) {
          S.lastBomb = t; S.flash = 1; S.bombs--; if (!S.bombs) S.bombs = 3;
          S.enemies.forEach(function (e) { if (e.x > S.cam && e.x < S.cam + W) kill(e); });
        }
      }
      var bands = f.bands;
      S.enemies.forEach(function (e, n) {
        if (e.dead) return;
        var wob = reply ? clamp((bands[(n * 5) % 32] - 0.3) / 0.7, 0, 1) * lv : 0;
        if (e.target) {                                                      // swoop down, grab, climb
          var h = e.target;
          if (!e.grab) {
            e.x += clamp(h.x - e.x, -W * 0.25 * dt, W * 0.25 * dt); e.y += clamp(h.y - 0.07 - e.y, -0.35 * dt, 0.35 * dt);
            if (Math.abs(h.x - e.x) < 4 * p && Math.abs(h.y - 0.07 - e.y) < 0.02) { e.grab = h; h.held = e; }
          } else {
            e.y -= 0.12 * dt; h.x = e.x; h.y = e.y + 0.075;
            if (e.y < 0.02) { e.kind = "mutant"; e.target = null; e.grab = null; h.dead = true; }
          }
        } else if (e.kind === "mutant") {
          e.y += clamp(S.shipY - e.y, -0.2 * dt, 0.2 * dt) + (R() - 0.5) * 0.02; e.x += (R() - 0.5) * W * 0.02;
        } else if (e.kind === "baiter") {
          e.x += W * (0.06 + 0.25 * wob) * dt * (e.ph > Math.PI ? 1 : -1); e.y = clamp(e.y + Math.sin(t * 2 + e.ph) * 0.1 * dt, 0.05, 0.7);
        } else {
          e.x += e.vx * W * dt; e.y = clamp(e.y + Math.sin(t * 1.5 + e.ph) * (0.03 + 0.2 * wob) * dt, 0.04, 0.72);
        }
        e.bob = wob;
      });
      S.humans = S.humans.filter(function (h) { return !h.dead; });
      // ---- the ship steers toward the nearest enemy ahead; your syllables fire the laser
      var aim = null, ad = 1e9;
      S.enemies.forEach(function (e) { if (!e.dead && e.x > shipX && e.x < S.cam + W) { var d = e.x - shipX; if (d < ad) { ad = d; aim = e; } } });
      S.shipY = follow(S.shipY, aim ? aim.y : 0.4 + 0.1 * Math.sin(t * 0.7), 0.06 + 0.1 * lv, 0.06 + 0.1 * lv, dt);
      if ((listen && f.onset) || (st === "idle" && R() < dt * 0.6)) {
        var hit = null, hd = 1e9, tol = 0.07;
        S.enemies.forEach(function (e) { if (!e.dead && e.x > shipX && e.x < S.cam + W && Math.abs(e.y - S.shipY) < tol) { var d = e.x - shipX; if (d < hd) { hd = d; hit = e; } } });
        S.lasers.push({ x: shipX + 16 * p, y: S.shipY, t: t, to: hit ? hit.x : S.cam + W * 1.05 });
        if (hit) kill(hit);
      }
      function kill(e) {
        if (e.dead) return;
        e.dead = true; S.score += S.kinds[e.kind].pts;
        if (e.grab) { e.grab.held = null; e.grab.fall = 0.05; }
        if (e.target) e.target = null;
        var c = S.kinds[e.kind].col;
        for (var j = 0; j < 20; j++) { var an = j / 20 * TAU; S.parts.push({ x: e.x, y: e.y, vx: Math.cos(an) * (0.9 + 0.3 * (j % 2)), vy: Math.sin(an) * (0.9 + 0.3 * (j % 2)), t: t, c: j % 3 ? c : [255, 255, 255] }); }
      }
      S.enemies = S.enemies.filter(function (e) { return !e.dead; });
      // ---- draw
      var g0 = r.ctx; g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1; g0.fillStyle = "#000"; g0.fillRect(0, 0, W, H);
      var sc = r.buf("defScene", W, H), q = sc.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, W, H); q.imageSmoothingEnabled = false;
      function SX(wx) { return wx - S.cam; }
      function SY(y) { return top + y * span; }
      S.stars.forEach(function (s) {                                         // parallax stars
        var x = ((s.x - S.cam * s.d) % W + W) % W, a = 0.35 + 0.35 * Math.sin(t * 2 + s.ph);
        q.fillStyle = rgba(s.c, a); q.fillRect(x, s.y, p * 0.8, p * 0.8);
      });
      q.beginPath();                                                        // the planet surface
      var first = true;
      S.terr.forEach(function (s) { var x = SX(s.x); if (x < -sw || x > W + sw) return; var y = base - s.h * span; if (first) { q.moveTo(x, y); first = false; } else q.lineTo(x, y); });
      q.strokeStyle = "#d8722a"; q.lineWidth = Math.max(1.5, 0.7 * p); q.lineJoin = "miter"; q.stroke();
      S.humans.forEach(function (h) { var x = SX(h.x); if (x > -10 && x < W + 10) q.drawImage(S.human, Math.round(x - 1.5 * p), Math.round(SY(h.y) - 8 * p)); });
      S.enemies.forEach(function (e) {
        var x = SX(e.x); if (x < -20 * p || x > W + 20 * p) return;
        var spr = S.kinds[e.kind].spr, s2 = 1 + 0.35 * (e.bob || 0);
        q.drawImage(spr, Math.round(x - spr.width * s2 / 2), Math.round(SY(e.y) - spr.height * s2 / 2), spr.width * s2, spr.height * s2);
      });
      // lasers: a white head racing out with a rainbow tail behind it
      var RB = [[255, 60, 60], [255, 200, 40], [80, 255, 90], [60, 220, 255], [110, 110, 255], [255, 80, 255]];
      S.lasers = S.lasers.filter(function (L) {
        var age = t - L.t; if (age > 0.3) return false;
        var x0 = SX(L.x), x1 = SX(L.to), reach = Math.min(1, age / 0.08), head = x0 + (x1 - x0) * reach, y = Math.round(SY(L.y)), seg = 10 * p, fade = 1 - Math.max(0, age - 0.12) / 0.18;
        for (var xx = x0, n = 0; xx < head; xx += seg, n++) { q.fillStyle = rgba(RB[(n + Math.floor(t * 30)) % RB.length], 0.9 * fade); q.fillRect(xx, y, Math.min(seg, head - xx), Math.max(1, 0.6 * p)); }
        q.fillStyle = rgba([255, 255, 255], fade); q.fillRect(head - 3 * p, y - 0.2 * p, 3 * p, Math.max(1, p));
        return true;
      });
      S.parts = S.parts.filter(function (pt) {                               // rings of pixels flying apart
        var age = t - pt.t; if (age > 0.9) return false;
        var x = SX(pt.x) + pt.vx * age * W * 0.12, y = SY(pt.y) + pt.vy * age * W * 0.12;
        q.fillStyle = rgba(pt.c, 1 - age / 0.9); q.fillRect(x, y, p * 1.2, p * 1.2);
        return true;
      });
      // the ship, with a flickering exhaust while it thrusts
      var sx = SX(shipX), sy = Math.round(SY(S.shipY) - S.ship.height / 2), thr = listen ? 0.3 + lv : 0.25;
      for (k = 0; k < 4; k++) { var fl = (2 + 6 * thr * (0.6 + 0.4 * R())) * p; q.fillStyle = rgba(RB[(k + Math.floor(t * 20)) % 4], 0.85); q.fillRect(sx - fl - k * 0.5 * p, sy + 2 * p + (k % 2) * p, fl, p); }
      q.drawImage(S.ship, Math.round(sx), sy);
      // ---- the top panel: scanner, score, ships, smart bombs
      var px0 = W * 0.28, pw = W * 0.44, py0 = H * 0.02, ph = H * 0.115, win0 = S.cam - W * 1.5, winW = W * 4;
      function MX(wx) { return px0 + (wx - win0) / winW * pw; }
      q.fillStyle = "rgba(216,114,42,0.8)";
      S.terr.forEach(function (s, n) { if (n % 3) return; var x = MX(s.x); if (x >= px0 && x <= px0 + pw) q.fillRect(x, py0 + ph - 2 - s.h * ph * 0.8, 1.5, 1.5); });
      S.enemies.forEach(function (e) { var x = MX(e.x); if (x >= px0 && x <= px0 + pw) { q.fillStyle = rgba(S.kinds[e.kind].col, 1); q.fillRect(x - 1.5, py0 + 3 + e.y * (ph - 8), 3, 3); } });
      S.humans.forEach(function (h) { var x = MX(h.x); if (x >= px0 && x <= px0 + pw) { q.fillStyle = "#c050ff"; q.fillRect(x - 1, py0 + 3 + h.y * (ph - 8), 2, 3); } });
      q.fillStyle = "#fff"; q.fillRect(MX(shipX) - 2.5, py0 + 3 + S.shipY * (ph - 8), 5, 3);
      if (think) { var sweep = px0 + ((t * 0.5) % 1) * pw; q.fillStyle = "rgba(120,160,255,0.35)"; q.fillRect(sweep, py0, 2, ph); }
      pixText(q, String(S.score).padStart(6, "0"), W * 0.235, H * 0.035, Math.max(2, 0.55 * p), "#fff", "right");
      for (k = 0; k < S.lives; k++) q.drawImage(S.ship, W * 0.1 + k * 7 * p, H * 0.085, S.ship.width * 0.4, S.ship.height * 0.4);
      for (k = 0; k < S.bombs; k++) { q.fillStyle = "#ffe040"; q.fillRect(W * 0.235 - 2 * p, H * 0.085 + k * 1.6 * p, 2 * p, p); }
      g0.drawImage(sc, 0, 0);
      r.bloom(sc, 0.5 + 0.5 * lv, 0.006, 2);
      // panel frame, crisp over the glow
      g0.strokeStyle = "#3a54ff"; g0.lineWidth = Math.max(1.5, 0.5 * p);
      g0.beginPath(); g0.moveTo(0, top - 3 * p); g0.lineTo(W, top - 3 * p); g0.stroke();
      g0.strokeRect(px0 - 2, py0 - 2, pw + 4, ph + 4);
      var vx0 = MX(S.cam), vx1 = MX(S.cam + W), bl = 5 * p;               // brackets: the part of the scanner on screen
      g0.strokeStyle = "#fff"; g0.beginPath();
      g0.moveTo(vx0, py0 + bl); g0.lineTo(vx0, py0); g0.lineTo(vx0 + bl, py0); g0.moveTo(vx1 - bl, py0); g0.lineTo(vx1, py0); g0.lineTo(vx1, py0 + bl);
      g0.moveTo(vx0, py0 + ph - bl); g0.lineTo(vx0, py0 + ph); g0.lineTo(vx0 + bl, py0 + ph); g0.moveTo(vx1 - bl, py0 + ph); g0.lineTo(vx1, py0 + ph); g0.lineTo(vx1, py0 + ph - bl);
      g0.stroke();
      if (S.flash > 0) { g0.fillStyle = "rgba(255,255,255," + (0.85 * S.flash).toFixed(3) + ")"; g0.fillRect(0, 0, W, H); S.flash = Math.max(0, S.flash - dt * 5); }
      scanlines(r, 0.12);
    }
  });
