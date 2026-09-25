  /* ---------- Light Cycles — the Grid from Tron: two cycles race an arena and write your voices as walls of light ----------
     Cyan is you, orange is the assistant. Whoever is speaking rides fast and turns 90 degrees on their syllables, and the wall behind
     each cycle is as tall as that voice was loud, so the trails are the conversation's waveform in 3-D. Walls fade after six
     seconds. While it thinks, both slow down and gold rings pulse out across the floor. The grid itself is static, so it
     is drawn once; only the walls, the cycles and their glow are drawn per frame. */
  register({
    id: "light-cycles", name: "Light Cycles", layout: "top", text: "tron", hiDpi: true,
    blurb: "Tron's Grid. Two light cycles, cyan for you and orange for the assistant, turn on every syllable and leave walls shaped like your voices.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, i, k;
      S.hy = H * 0.38; S.hc = 14; S.cx = W / 2; S.fp = (H - S.hy) * 10 / S.hc;     // the floor at z = 10 meets the bottom edge
      S.A = 19; S.z0 = 10.6; S.z1 = 46; S.LIFE = 6; S.R = rng(1982); S.rings = 0;   // the arena fills the floor in front of you
      var D = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      S.D = D;
      function cyc(x, z, dir, col) { return { x: x, z: z, dir: dir, col: col, trail: [], lastTurn: -9, next: 0, sampled: -9, flash: 0 }; }
      S.cyc = [cyc(-7, 15, 0, [90, 225, 255]), cyc(7, 34, 2, [255, 150, 40])];
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), hy = S.hy;
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      var sky = g.createLinearGradient(0, hy - H * 0.25, 0, hy);
      sky.addColorStop(0, "rgba(0,40,70,0)"); sky.addColorStop(1, "rgba(0,70,110,0.35)");
      g.fillStyle = sky; g.fillRect(0, hy - H * 0.25, W, H * 0.25);
      var fl = g.createLinearGradient(0, hy, 0, H); fl.addColorStop(0, "#001426"); fl.addColorStop(0.3, "#000a14"); fl.addColorStop(1, "#000308");
      g.fillStyle = fl; g.fillRect(0, hy, W, H - hy);
      function P(x, z) { return [S.cx + S.fp * x / z, hy + S.fp * S.hc / z]; }
      // grid: lines across (constant z) fade with distance; lines along (constant x) fade toward the horizon
      var step = 2;
      for (k = 10; k < 170; k += step) {
        var y = P(0, k)[1], a = clamp(0.5 * Math.pow(10 / k, 0.9), 0.03, 0.5);
        g.fillStyle = "rgba(40,150,255," + a.toFixed(3) + ")"; g.fillRect(0, y - 0.6 * u, W, Math.max(1, 1.2 * u));
      }
      var along = g.createLinearGradient(0, hy, 0, H); along.addColorStop(0, "rgba(40,150,255,0)"); along.addColorStop(0.2, "rgba(40,150,255,0.14)"); along.addColorStop(1, "rgba(40,150,255,0.5)");
      g.strokeStyle = along; g.lineWidth = Math.max(1, 1.2 * u); g.beginPath();
      for (i = -40; i <= 40; i++) { var x = i * step, n = P(x, 10), fz = P(x, 170); g.moveTo(n[0], n[1]); g.lineTo(fz[0], fz[1]); }
      g.stroke();
      // the arena's edge
      var c = [P(-S.A, S.z0), P(S.A, S.z0), P(S.A, S.z1), P(-S.A, S.z1)];
      g.save(); g.shadowColor = "rgba(80,200,255,0.9)"; g.shadowBlur = 10 * u;
      g.beginPath(); g.moveTo(c[0][0], c[0][1]); for (i = 1; i < 4; i++) g.lineTo(c[i][0], c[i][1]); g.closePath();
      g.strokeStyle = "rgba(120,220,255,0.85)"; g.lineWidth = 2 * u; g.stroke(); g.restore();
      g.fillStyle = "rgba(160,235,255,0.9)"; g.fillRect(0, hy - 0.7 * u, W, Math.max(1, 1.4 * u));
      S.bg = bg;
      S.spr = S.cyc.map(function (cy) { return dotSprite(Math.ceil(130 * u), cy.col, [255, 255, 255]); });
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, D = S.D, i, j;
      var proc = st === "processing", hy = S.hy, cx = S.cx, fp = S.fp, hc = S.hc;
      function PX(x, z) { return cx + fp * x / z; }
      function PY(y, z) { return hy + fp * (hc - y) / z; }
      function free(cy, dir, ahead) {
        var nx = cy.x + D[dir][0] * ahead, nz = cy.z + D[dir][1] * ahead;
        return nx > -S.A + 0.5 && nx < S.A - 0.5 && nz > S.z0 + 0.5 && nz < S.z1 - 0.5;
      }
      function turn(cy) {
        var l = (cy.dir + 3) % 4, rt = (cy.dir + 1) % 4, fl = free(cy, l, 2.5), fr = free(cy, rt, 2.5);
        cy.dir = fl && fr ? (R() < 0.5 ? l : rt) : fl ? l : fr ? rt : (cy.dir + 2) % 4;
        cy.lastTurn = t; cy.trail.push({ x: cy.x, z: cy.z, h: cy.trail.length ? cy.trail[cy.trail.length - 1].h : 0.4, t: t });
      }
      for (i = 0; i < 2; i++) {
        var cy = S.cyc[i], active = (st === "listening" && i === 0) || (st === "responding" && i === 1);
        var spd = active ? 6 + 14 * lv : proc ? 4 : 3.4, h = active ? 0.5 + 6 * lv : proc ? 0.7 : 0.55;
        if (!cy.next) cy.next = t + 1 + R() * 2;
        if (active && f.onset && t - cy.lastTurn > 0.32) { turn(cy); cy.flash = 1; }
        else if (!active && t > cy.next) { turn(cy); cy.next = t + (proc ? 0.8 : 1.2) + R() * 1.6; }
        if (!free(cy, cy.dir, 0.6)) turn(cy);
        cy.x += D[cy.dir][0] * spd * dt; cy.z += D[cy.dir][1] * spd * dt;
        cy.x = clamp(cy.x, -S.A + 0.3, S.A - 0.3); cy.z = clamp(cy.z, S.z0 + 0.3, S.z1 - 0.3);
        cy.h = follow(cy.h || 0.4, h, 0.5, 0.2, dt);
        if (t - cy.sampled > 1 / 30) { cy.trail.push({ x: cy.x, z: cy.z, h: cy.h, t: t }); cy.sampled = t; }
        while (cy.trail.length > 2 && t - cy.trail[1].t > S.LIFE) cy.trail.shift();
        cy.flash = Math.max(0, cy.flash - dt * 4);
      }
      var g = r.ctx; g.drawImage(S.bg, 0, 0);
      var sc = r.buf("lcglow", W, H), q = sc.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, W, H); q.globalCompositeOperation = "lighter";
      // gold rings rolling out across the floor while it thinks
      S.rings = follow(S.rings, proc ? 1 : 0, 0.08, 0.05, dt);
      if (S.rings > 0.02) {
        for (j = 0; j < 2; j++) {
          var ph = ((t * 0.55 + j * 0.5) % 1), rad = 2 + ph * 30, zc = (S.z0 + S.z1) / 2;
          q.beginPath();
          for (i = 0; i <= 72; i++) { var an = i / 72 * TAU, wx = Math.cos(an) * rad, wz = zc + Math.sin(an) * rad * 0.6; if (wz < 10.5) wz = 10.5; if (i) q.lineTo(PX(wx, wz), PY(0, wz)); else q.moveTo(PX(wx, wz), PY(0, wz)); }
          q.strokeStyle = rgba([255, 200, 90], 0.55 * (1 - ph) * S.rings); q.lineWidth = 2.2 * u; q.stroke();
        }
      }
      // walls of light: bucketed by age so each bucket is one fill + one stroke
      for (i = 0; i < 2; i++) {
        var cyc = S.cyc[i], tr = cyc.trail.concat([{ x: cyc.x, z: cyc.z, h: cyc.h, t: t }]), B = 5, fills = [], tops = [], k;
        for (k = 0; k < B; k++) { fills.push(new Path2D()); tops.push(new Path2D()); }
        for (j = 1; j < tr.length; j++) {
          var p0 = tr[j - 1], p1 = tr[j], life = 1 - (t - p1.t) / S.LIFE;
          if (life <= 0) continue;
          var bk = Math.min(B - 1, (life * B) | 0);
          var ax = PX(p0.x, p0.z), ay = PY(0, p0.z), bx = PX(p1.x, p1.z), by = PY(0, p1.z), ty0 = PY(p0.h, p0.z), ty1 = PY(p1.h, p1.z);
          fills[bk].moveTo(ax, ay); fills[bk].lineTo(bx, by); fills[bk].lineTo(bx, ty1); fills[bk].lineTo(ax, ty0); fills[bk].closePath();
          tops[bk].moveTo(ax, ty0); tops[bk].lineTo(bx, ty1); tops[bk].moveTo(ax, ay); tops[bk].lineTo(bx, by);
        }
        var col = cyc.col, hot = mixc(col, [255, 255, 255], 0.55);
        q.lineCap = "round"; q.lineJoin = "round";
        for (k = 0; k < B; k++) {
          var a = (k + 0.5) / B;
          q.fillStyle = rgba(col, 0.3 * a); q.fill(fills[k]);
          q.strokeStyle = rgba(hot, 0.95 * a); q.lineWidth = 2.2 * u; q.stroke(tops[k]);
        }
        // the cycle: a hot streak, its glow, and a pool of light on the floor
        var d = D[cyc.dir], zz = cyc.z, sx = PX(cyc.x, zz), sy = PY(0.45, zz), bxk = PX(cyc.x - d[0] * 1.3, cyc.z - d[1] * 1.3), byk = PY(0.45, cyc.z - d[1] * 1.3);
        var sz = 10 / zz, pool = q.createRadialGradient(sx, PY(0, zz), 0, sx, PY(0, zz), 110 * u * sz);
        pool.addColorStop(0, rgba(col, 0.32 + 0.3 * cyc.flash)); pool.addColorStop(1, rgba(col, 0));
        q.save(); q.translate(sx, PY(0, zz)); q.scale(1, 0.32); q.translate(-sx, -PY(0, zz));
        q.fillStyle = pool; q.beginPath(); q.arc(sx, PY(0, zz), 110 * u * sz, 0, TAU); q.fill(); q.restore();
        q.beginPath(); q.moveTo(bxk, byk); q.lineTo(sx, sy); q.strokeStyle = rgba(hot, 1); q.lineWidth = 10 * u * sz + 1.5; q.stroke();
        var spr = S.spr[i], ss = spr.width * sz * (1 + 0.6 * cyc.flash);
        q.drawImage(spr, sx - ss / 2, sy - ss / 2, ss, ss);
      }
      g.save(); g.globalCompositeOperation = "lighter"; g.drawImage(sc, 0, 0); g.restore();
      r.bloom(sc, 0.7 + 0.5 * lv, 0.02, 2);
    }
  });
