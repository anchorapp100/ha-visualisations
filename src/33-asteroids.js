  /* ---------- Asteroids: a vector-monitor rock field where your syllables are the ship's shots ----------
     Everything is drawn as glowing white vector lines with bright vertex dots and phosphor afterglow. Your syllables turn the
     ship onto the nearest rock and fire; rocks split large, medium, small. When the assistant answers, the beam throbs,
     every rock's outline ripples with its slice of the spectrum, the ship returns fire on some of its syllables and a
     saucer turns up to shoot back on others. While it thinks, the ship
     drifts and hops through hyperspace. The play area wraps like the original; the rock outlines are generated. */
  var AST_HI = 20000;
  register({
    id: "asteroids", name: "Asteroids", layout: "bottom", text: "vector", hiDpi: true,
    blurb: "A glowing vector rock field. Your syllables aim and fire; while the assistant answers, the beam throbs, the rocks ripple with its voice and a saucer joins the fight.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, i, k;
      S.AW = W; S.AH = H * 0.7; S.s = Math.min(W, S.AH * 1.6) / 1000; S.R = rng(1979);
      var R = S.R;
      S.tpl = [];                                                           // four jagged rock outlines, radius ~1
      for (k = 0; k < 4; k++) { var pts = []; for (i = 0; i < 11; i++) { var a = i / 11 * TAU + (R() - 0.5) * 0.35, rr = 0.72 + 0.28 * R(); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } S.tpl.push(pts); }
      S.rocks = []; S.shots = []; S.eshots = []; S.parts = []; S.debris = []; S.wave = 0; S.waveAt = 0.01;
      S.ship = { x: W / 2, y: S.AH / 2, a: -Math.PI / 2, vx: 0, vy: 0, dead: 0, hyper: 0, thrust: 0 };
      S.saucer = null; S.lastSaucer = -99; S.nextHyper = 0; S.score = 0; S.lives = 3; S.n = 0;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, AW = S.AW, AH = S.AH, s = S.s, i, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing", sh = S.ship;
      function wrap(o) { o.x = (o.x % AW + AW) % AW; o.y = (o.y % AH + AH) % AH; }
      function wd(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; dx -= Math.round(dx / AW) * AW; dy -= Math.round(dy / AH) * AH; return [dx, dy]; }
      function rock(x, y, size, vx, vy) { S.rocks.push({ x: x, y: y, size: size, rad: [70, 35, 17][size] * s, vx: vx, vy: vy, tpl: (R() * 4) | 0, id: S.n++ }); }
      // ---- waves of big rocks, arriving from the edges
      if (S.waveAt && t >= S.waveAt) {
        S.waveAt = 0; S.wave++;
        for (i = 0; i < Math.min(8, 4 + S.wave); i++) {
          var edge = R() < 0.5, x = edge ? R() * AW : 0, y = edge ? 0 : R() * AH, an = R() * TAU, v = (40 + 35 * R()) * s;
          rock(x, y, 0, Math.cos(an) * v, Math.sin(an) * v);
        }
      }
      if (!S.rocks.length && !S.waveAt) S.waveAt = t + 1.5;
      var spdMul = 1 + (reply ? 0.6 * lv : 0);
      S.rocks.forEach(function (o) { o.x += o.vx * dt * spdMul; o.y += o.vy * dt * spdMul; wrap(o); });
      // ---- the ship: aim at the nearest rock (leading it), fire on your syllables; drift and hyperspace while thinking
      var alive = !sh.dead && !sh.hyper;
      if (sh.dead && t - sh.dead > 2) {
        var clear = S.rocks.every(function (o) { var d = wd(AW / 2, AH / 2, o.x, o.y); return Math.hypot(d[0], d[1]) > o.rad + 90 * s; });
        if (clear) { sh.dead = 0; sh.x = AW / 2; sh.y = AH / 2; sh.vx = sh.vy = 0; sh.a = -Math.PI / 2; }
      }
      if (think && alive && t > S.nextHyper) { sh.hyper = t; S.nextHyper = t + 4 + 3 * R(); sparkle(sh.x, sh.y); }
      if (sh.hyper && t - sh.hyper > 0.8) { sh.hyper = 0; sh.x = AW * (0.2 + 0.6 * R()); sh.y = AH * (0.2 + 0.6 * R()); sparkle(sh.x, sh.y); }
      if (alive) {
        var tgt = null, td = 1e9;
        S.rocks.forEach(function (o) { var d = wd(sh.x, sh.y, o.x, o.y), dd = Math.hypot(d[0], d[1]); if (dd < td) { td = dd; tgt = o; } });
        var want = sh.a;
        if (tgt && (listen || st === "idle" || reply)) {
          var d0 = wd(sh.x, sh.y, tgt.x, tgt.y), tt = Math.hypot(d0[0], d0[1]) / (520 * s);
          want = Math.atan2(d0[1] + tgt.vy * tt, d0[0] + tgt.vx * tt);
        } else if (think) want = sh.a + 1.2 * dt * 4;
        var da = ((want - sh.a + Math.PI) % TAU + TAU) % TAU - Math.PI, turn = (listen ? 7 : 3.5) * dt;
        sh.a += clamp(da, -turn, turn);
        sh.thrust = listen ? clamp(lv * 1.4 - 0.2, 0, 1) : 0;
        sh.vx += Math.cos(sh.a) * sh.thrust * 160 * s * dt; sh.vy += Math.sin(sh.a) * sh.thrust * 160 * s * dt;
        sh.vx *= Math.pow(0.55, dt); sh.vy *= Math.pow(0.55, dt);
        sh.x += sh.vx * dt; sh.y += sh.vy * dt; wrap(sh);
        var fire = (listen && f.onset) || (reply && f.onset && R() < 0.45) || (st === "idle" && R() < dt * 0.9);   // it fights back while the assistant talks
        if (fire && S.shots.length < 6) S.shots.push({ x: sh.x + Math.cos(sh.a) * 14 * s, y: sh.y + Math.sin(sh.a) * 14 * s, vx: Math.cos(sh.a) * 520 * s + sh.vx, vy: Math.sin(sh.a) * 520 * s + sh.vy, t: t });
      }
      // ---- the saucer: shows up on the assistant's voice and shoots on its syllables
      if (!S.saucer && ((reply && f.onset && t - S.lastSaucer > 6) || t - S.lastSaucer > 28)) {
        var fl = R() < 0.5; S.saucer = { x: fl ? 0 : AW, y: AH * (0.15 + 0.7 * R()), vx: (fl ? 1 : -1) * 110 * s, vy: 0, turnAt: t + 1 }; S.lastSaucer = t;
      }
      if (S.saucer) {
        var sc0 = S.saucer; sc0.x += sc0.vx * dt; sc0.y += sc0.vy * dt;
        if (t > sc0.turnAt) { sc0.vy = (R() - 0.5) * 140 * s; sc0.turnAt = t + 0.8 + R(); }
        sc0.y = (sc0.y % AH + AH) % AH;
        if (sc0.x < -30 * s || sc0.x > AW + 30 * s) S.saucer = null;
        else if ((reply && f.onset) || R() < dt * 0.5) {
          var d1 = wd(sc0.x, sc0.y, sh.x, sh.y), ea = Math.atan2(d1[1], d1[0]) + (R() - 0.5) * 0.5;
          S.eshots.push({ x: sc0.x, y: sc0.y, vx: Math.cos(ea) * 330 * s, vy: Math.sin(ea) * 330 * s, t: t });
        }
      }
      // ---- shots, hits, splits
      function sparkle(x, y) { for (var j = 0; j < 10; j++) { var an = R() * TAU, v = (30 + 90 * R()) * s; S.parts.push({ x: x, y: y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, t: t, life: 0.5 }); } }
      function burst(x, y, n, v) { for (var j = 0; j < n; j++) { var an = R() * TAU, vv = (0.3 + R()) * v * s; S.parts.push({ x: x, y: y, vx: Math.cos(an) * vv, vy: Math.sin(an) * vv, t: t, life: 0.7 + 0.4 * R() }); } }
      function hitRock(o) {
        S.score += [20, 50, 100][o.size]; burst(o.x, o.y, 10 - o.size * 2, 140);
        if (o.size < 2) for (var j = 0; j < 2; j++) { var an = Math.atan2(o.vy, o.vx) + (j ? 0.7 : -0.7) + (R() - 0.5) * 0.6, v = Math.hypot(o.vx, o.vy) * (1.3 + 0.4 * R()); rock(o.x, o.y, o.size + 1, Math.cos(an) * v, Math.sin(an) * v); }
        o.gone = true;
      }
      S.shots = S.shots.filter(function (b) {
        b.x += b.vx * dt; b.y += b.vy * dt; wrap(b);
        if (t - b.t > 1.0) return false;
        for (var j = 0; j < S.rocks.length; j++) { var o = S.rocks[j]; if (o.gone) continue; var d = wd(b.x, b.y, o.x, o.y); if (Math.hypot(d[0], d[1]) < o.rad) { hitRock(o); return false; } }
        if (S.saucer) { var d2 = wd(b.x, b.y, S.saucer.x, S.saucer.y); if (Math.abs(d2[0]) < 18 * s && Math.abs(d2[1]) < 9 * s) { S.score += 200; burst(S.saucer.x, S.saucer.y, 12, 160); S.saucer = null; return false; } }
        return true;
      });
      S.rocks = S.rocks.filter(function (o) { return !o.gone; });
      S.eshots = S.eshots.filter(function (b) {
        b.x += b.vx * dt; b.y += b.vy * dt; wrap(b);
        if (t - b.t > 1.2) return false;
        if (alive) { var d = wd(b.x, b.y, sh.x, sh.y); if (Math.hypot(d[0], d[1]) < 9 * s) { crash(); return false; } }
        return true;
      });
      if (alive) S.rocks.forEach(function (o) { if (sh.dead) return; var d = wd(sh.x, sh.y, o.x, o.y); if (Math.hypot(d[0], d[1]) < o.rad * 0.85 + 7 * s) { hitRock(o); crash(); } });
      S.rocks = S.rocks.filter(function (o) { return !o.gone; });
      function crash() {
        if (sh.dead) return;
        sh.dead = t; S.lives = S.lives > 1 ? S.lives - 1 : 3;
        var P = shipPts(sh.x, sh.y, sh.a);
        for (var j = 0; j < 5; j++) { var a0 = P[j], b0 = P[(j + 1) % 5], an = R() * TAU; S.debris.push({ x0: a0[0], y0: a0[1], x1: b0[0], y1: b0[1], vx: Math.cos(an) * 40 * s, vy: Math.sin(an) * 40 * s, rot: (R() - 0.5) * 4, t: t }); }
      }
      AST_HI = Math.max(AST_HI, S.score);
      alive = !sh.dead && !sh.hyper;
      S.beat = Math.max(0, (S.beat || 0) - dt * 3.2);                           // the beam throbs on the assistant's syllables
      if (reply && f.onset) S.beat = 1;
      // ---- draw on a phosphor layer that fades a little each frame (afterglow)
      var ph = r.buf("astPhos", W, H), q = ph.getContext("2d");
      q.globalCompositeOperation = "destination-out"; q.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.5, dt * 30)).toFixed(3) + ")"; q.fillRect(0, 0, W, H);
      q.globalCompositeOperation = "source-over";
      var beam = "rgba(236,244,255," + (0.72 + 0.28 * Math.max(S.beat, reply ? lv : 0.6)).toFixed(3) + ")", lw = Math.max(1.2, (1.6 + 0.6 * S.beat) * s), dots = [], bands = f.bands;
      q.strokeStyle = beam; q.lineWidth = lw; q.lineJoin = "round"; q.lineCap = "round";
      q.beginPath();
      S.rocks.forEach(function (o, n) {
        var tp = S.tpl[o.tpl], amp = reply ? 0.3 * lv : 0.04 * lv;
        for (var j = 0; j <= tp.length; j++) {
          var pv = tp[j % tp.length], bi = (o.id * 5 + (j % tp.length) * 3) % 32, rip = 1 + amp * clamp((bands[bi] - 0.25) / 0.75, 0, 1) * (j % 2 ? 1 : -0.6);
          var x = o.x + pv[0] * o.rad * rip, y = o.y + pv[1] * o.rad * rip;
          if (j) q.lineTo(x, y); else q.moveTo(x, y);
          if (j < tp.length) dots.push(x, y);
        }
      });
      q.stroke();
      function shipPts(x, y, a) {
        var sz = 14 * s, c = Math.cos(a), sn = Math.sin(a);
        return [[1, 0], [-0.75, 0.62], [-0.45, 0.3], [-0.45, -0.3], [-0.75, -0.62]].map(function (pp) { return [x + (pp[0] * c - pp[1] * sn) * sz, y + (pp[0] * sn + pp[1] * c) * sz]; });
      }
      if (alive) {
        var P = shipPts(sh.x, sh.y, sh.a);
        q.beginPath(); q.moveTo(P[0][0], P[0][1]); q.lineTo(P[1][0], P[1][1]); q.moveTo(P[0][0], P[0][1]); q.lineTo(P[4][0], P[4][1]);
        q.moveTo(P[2][0], P[2][1]); q.lineTo(P[3][0], P[3][1]); q.stroke();
        if (sh.thrust > 0.05 && Math.floor(t * 20) % 2) {
          var c = Math.cos(sh.a), sn = Math.sin(sh.a), fx = sh.x - c * (14 * s) * (0.45 + 0.6 * sh.thrust), fy = sh.y - sn * (14 * s) * (0.45 + 0.6 * sh.thrust);
          q.beginPath(); q.moveTo(P[2][0] + (P[3][0] - P[2][0]) * 0.2, P[2][1] + (P[3][1] - P[2][1]) * 0.2); q.lineTo(fx, fy); q.lineTo(P[3][0] + (P[2][0] - P[3][0]) * 0.2, P[3][1] + (P[2][1] - P[3][1]) * 0.2); q.stroke();
        }
        dots.push(P[0][0], P[0][1]);
      }
      S.debris = S.debris.filter(function (d) {
        var age = t - d.t; if (age > 1.6) return false;
        var mx = (d.x0 + d.x1) / 2 + d.vx * age, my = (d.y0 + d.y1) / 2 + d.vy * age, hx = (d.x1 - d.x0) / 2, hy = (d.y1 - d.y0) / 2, ra = d.rot * age, c = Math.cos(ra), sn = Math.sin(ra);
        q.globalAlpha = 1 - age / 1.6; q.beginPath(); q.moveTo(mx - (hx * c - hy * sn), my - (hx * sn + hy * c)); q.lineTo(mx + (hx * c - hy * sn), my + (hx * sn + hy * c)); q.stroke(); q.globalAlpha = 1;
        return true;
      });
      if (S.saucer) {                                                        // the classic saucer: a hull, a band, a dome
        var ux = S.saucer.x, uy = S.saucer.y, a1 = 18 * s, b1 = 6 * s;
        q.beginPath(); q.moveTo(ux - a1, uy); q.lineTo(ux + a1, uy); q.lineTo(ux + a1 * 0.55, uy + b1); q.lineTo(ux - a1 * 0.55, uy + b1); q.closePath();
        q.moveTo(ux - a1, uy); q.lineTo(ux - a1 * 0.5, uy - b1); q.lineTo(ux + a1 * 0.5, uy - b1); q.lineTo(ux + a1, uy);
        q.moveTo(ux - a1 * 0.4, uy - b1); q.lineTo(ux - a1 * 0.25, uy - b1 * 2); q.lineTo(ux + a1 * 0.25, uy - b1 * 2); q.lineTo(ux + a1 * 0.4, uy - b1); q.stroke();
      }
      q.fillStyle = "#fff";
      var ds = Math.max(1.5, 2.2 * s);
      for (i = 0; i < dots.length; i += 2) q.fillRect(dots[i] - ds / 2, dots[i + 1] - ds / 2, ds, ds);   // the beam dwells at the corners
      S.shots.concat(S.eshots).forEach(function (b) { q.fillRect(b.x - ds, b.y - ds, ds * 2, ds * 2); });
      S.parts = S.parts.filter(function (pt) {
        var age = t - pt.t; if (age > pt.life) return false;
        q.globalAlpha = 1 - age / pt.life; q.fillRect(pt.x + pt.vx * age - ds / 2, pt.y + pt.vy * age - ds / 2, ds, ds); q.globalAlpha = 1;
        return true;
      });
      // score, high score and ships in vector digits
      q.beginPath(); vecText(q, String(S.score).padStart(2, "0"), W * 0.06, H * 0.03, 5 * s); vecText(q, String(AST_HI), W * 0.47, H * 0.03, 3.2 * s); q.stroke();
      for (k = 0; k < S.lives; k++) {
        var LP = [[0, -1], [0.62, 0.75], [0.3, 0.45], [-0.3, 0.45], [-0.62, 0.75]], lx = W * 0.06 + k * 22 * s + 8 * s, ly = H * 0.03 + 50 * s, z = 10 * s;
        q.beginPath(); q.moveTo(lx + LP[0][0] * z, ly + LP[0][1] * z); q.lineTo(lx + LP[1][0] * z, ly + LP[1][1] * z); q.moveTo(lx + LP[0][0] * z, ly + LP[0][1] * z); q.lineTo(lx + LP[4][0] * z, ly + LP[4][1] * z); q.moveTo(lx + LP[2][0] * z, ly + LP[2][1] * z); q.lineTo(lx + LP[3][0] * z, ly + LP[3][1] * z); q.stroke();
      }
      var g0 = r.ctx; g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1; g0.fillStyle = "#000"; g0.fillRect(0, 0, W, H);
      g0.drawImage(ph, 0, 0);
      r.bloom(ph, 0.6 + 0.45 * lv + 0.35 * S.beat, 0.005, 2);
      scanlines(r, 0.06);
    }
  });
