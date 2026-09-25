  /* ---------- Space Invaders: you are the cannon; the assistant's voice makes the invaders dance ----------
     Your syllables make the cannon line up under the formation and fire. When the assistant answers, each column of invaders
     bobs with its slice of the spectrum, the march speeds up with its voice and its syllables rain bombs on the bunkers
     (which erode pixel by pixel); a UFO crosses on its loudest moments. The field is drawn at a low resolution, tinted by
     the coloured strips of the old cabinet screens (red UFO lane, green bunkers and cannon), then scaled up crisp with a glow.
     The invader, UFO and cannon sprites are original designs in the style of the era. */
  var INV_HI = 5000;
  register({
    id: "space-invaders", name: "Space Invaders", layout: "top", text: "arcade", hiDpi: true,
    blurb: "The cannon fires on your syllables; when the assistant answers, the invaders bob to its voice, march faster and drop bombs.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, i, j;
      S.VW = 340; S.VH = 200;
      S.s = Math.min(W * 0.94 / S.VW, H * 0.6 / S.VH);
      S.fx = Math.round((W - S.VW * S.s) / 2); S.fy = Math.round(H - S.VH * S.s - H * 0.015);
      var WH = { "#": "#fff" };
      S.types = [
        { w: 8, pts: 30, f: [pixSprite(["..####..", ".######.", "##.##.##", "########", ".#.##.#.", "#.#..#.#", ".#....#.", "........"], WH, 1),
                             pixSprite(["..####..", ".######.", "##.##.##", "########", ".##..##.", "#..##..#", "##....##", "........"], WH, 1)] },
        { w: 11, pts: 20, f: [pixSprite(["...#...#...", "....#.#....", "..#######..", ".##.#.#.##.", "###########", ".#########.", ".#.#...#.#.", "#.#.....#.#"], WH, 1),
                              pixSprite(["...#...#...", "#...#.#...#", "#.#######.#", "###.#.#.###", "###########", "..#######..", "..#.....#..", ".#.......#."], WH, 1)] },
        { w: 12, pts: 10, f: [pixSprite(["....####....", "..########..", ".##########.", "##..####..##", "############", "..#.#..#.#..", ".#..#..#..#.", "#..#....#..#"], WH, 1),
                              pixSprite(["....####....", "..########..", ".##########.", "##..####..##", "############", ".#..#..#..#.", "#..#....#..#", ".#........#."], WH, 1)] }
      ];
      S.rowType = [0, 1, 1, 2, 2];
      S.cannonSpr = pixSprite(["......#......", ".....###.....", ".....###.....", ".###########.", "#############", "#############", "#############", "#############"], WH, 1);
      S.ufoSpr = pixSprite([".....######.....", "...##########...", "..############..", ".##.##.##.##.##.", "################", "..###..##..###..", "...#........#..."], WH, 1);
      S.boomSpr = pixSprite(["....#...#....", ".#...#.#...#.", "..#.......#..", "...#.....#...", "##.........##", "...#.....#...", "..#.#...#.#..", ".#...#.#...#."], WH, 1);
      S.bombSpr = [pixSprite([".#.", "#..", ".#.", "..#", ".#.", "#..", ".#."], WH, 1), pixSprite([".#.", "..#", ".#.", "#..", ".#.", "..#", ".#."], WH, 1)];
      S.R = rng(1978);
      var R = S.R;
      S.deadSpr = [0, 1].map(function () { var rows = []; for (var y = 0; y < 8; y++) { var s = ""; for (var x = 0; x < 15; x++) s += (y > 2 && R() < 0.2 + 0.1 * y) || (y > 5 && R() < 0.5) ? "#" : "."; rows.push(s); } return pixSprite(rows, WH, 1); });
      // bunkers: an arch, kept as a pixel mask so hits can bite pieces out of it
      var BK = ["....##############....", "...################...", "..##################..", ".####################.",
                "######################", "######################", "######################", "######################",
                "######################", "######################", "######################", "######################",
                "######..........######", "######..........######", "#####............#####", "#####............#####"];
      S.makeBunkers = function () {
        S.bunkers = [];
        for (i = 0; i < 4; i++) {
          var bx = Math.round(S.VW * (0.2 + 0.2 * i) - 11), m = new Uint8Array(22 * 16), c = mkCanvas(22, 16);
          for (j = 0; j < 16; j++) for (var x = 0; x < 22; x++) m[j * 22 + x] = BK[j][x] === "#" ? 1 : 0;
          S.bunkers.push({ x: bx, y: 146, m: m, c: c, dirty: true });
        }
      };
      S.newWave = function () {
        S.alive = []; for (i = 0; i < 5; i++) { S.alive.push([]); for (j = 0; j < 11; j++) S.alive[i].push(true); }
        S.ox = Math.round((S.VW - 176) / 2); S.oy = 44; S.dir = 1; S.frame = 0; S.stepAt = 0; S.waveAt = 0;
        S.makeBunkers();
      };
      S.newWave();
      S.score = 0; S.lives = 3; S.cx = S.VW / 2; S.deadUntil = 0; S.shots = []; S.bombs = []; S.boom = []; S.ufo = null; S.nextUfo = 12; S.lastUfo = -99; S.thump = 0;
      // the backdrop: stars over a dim moonscape, drawn once
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      var vg = g.createRadialGradient(W / 2, H * 0.7, 0, W / 2, H * 0.7, W * 0.7);
      vg.addColorStop(0, "rgba(20,30,70,0.35)"); vg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
      for (i = 0; i < 170; i++) { var a = 0.15 + 0.6 * R() * R(); g.fillStyle = "rgba(210,220,255," + a.toFixed(2) + ")"; var sz = R() < 0.1 ? 2 : 1; g.fillRect(R() * W, R() * H * 0.85, sz * r.u * 1.4, sz * r.u * 1.4); }
      g.fillStyle = "rgba(40,48,78,0.55)"; g.beginPath(); g.moveTo(0, H);
      for (i = 0; i <= 40; i++) { var x = i / 40 * W, y = H * (0.9 + 0.03 * Math.sin(i * 0.9) + 0.02 * Math.sin(i * 2.3 + 1) + 0.015 * R()); g.lineTo(x, y); }
      g.lineTo(W, H); g.closePath(); g.fill();
      for (i = 0; i < 9; i++) { var cxr = R() * W, cyr = H * (0.94 + 0.04 * R()), rr = (8 + 26 * R()) * r.u; g.strokeStyle = "rgba(70,80,120,0.4)"; g.lineWidth = 1.2 * r.u; g.beginPath(); g.ellipse(cxr, cyr, rr, rr * 0.28, 0, 0, TAU); g.stroke(); }
      S.bg = bg;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, VW = S.VW, i, j, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing";
      if (!S.stepAt) { S.stepAt = t; S.nextUfo = t + 10; }
      // ---- the formation: where each invader is (the columns bob with the assistant's voice)
      var bands = f.bands, bob = [], count = 0;
      for (j = 0; j < 11; j++) bob.push(reply ? -Math.round(clamp((bands[3 + j * 2] - 0.3) / 0.7, 0, 1) * (3 + 7 * lv)) : 0);
      function ax(row, col) { var ty = S.types[S.rowType[row]]; return S.ox + col * 16 + Math.floor((16 - ty.w) / 2); }
      function ay(row, col) { return S.oy + row * 14 + bob[col]; }
      var minX = 1e9, maxX = -1e9, maxY = -1e9;
      for (i = 0; i < 5; i++) for (j = 0; j < 11; j++) if (S.alive[i][j]) {
        count++; var x = ax(i, j), w = S.types[S.rowType[i]].w;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, S.oy + i * 14 + 8);
      }
      // ---- the march: faster as the formation thins, and faster still with the assistant's voice
      var interval = (0.03 + 0.55 * count / 55) * (reply ? 1 / (1 + 1.8 * lv) : think ? 0.8 : listen ? 1 : 1.25);
      if (count && t >= S.stepAt) {
        S.stepAt = t + interval; S.frame ^= 1; S.thump = 1;
        if ((S.dir > 0 && maxX + 3 > VW - 4) || (S.dir < 0 && minX - 3 < 4)) { S.oy += 6; S.dir = -S.dir; }
        else S.ox += 3 * S.dir;
      }
      S.thump = Math.max(0, S.thump - dt * 6);
      if ((!count && !S.waveAt) || maxY > 140) S.waveAt = t + (count ? 0.2 : 1.2);
      if (S.waveAt && t >= S.waveAt) S.newWave();
      // ---- the cannon: you
      var alive = t >= S.deadUntil;
      if (alive) {
        var target = VW / 2;
        if (listen || st === "idle") {
          var bestD = 1e9;
          for (j = 0; j < 11; j++) for (i = 4; i >= 0; i--) if (S.alive[i][j]) { var cxj = ax(i, j) + S.types[S.rowType[i]].w / 2, d = Math.abs(cxj - S.cx); if (d < bestD) { bestD = d; target = cxj; } break; }
        }
        var sp = (listen ? 60 + 140 * lv : 35) * dt;
        S.cx += clamp(target - S.cx, -sp, sp);
        var fire = (listen && f.onset) || (st === "idle" && R() < dt * 0.8);
        if (fire && S.shots.length < 2) S.shots.push({ x: Math.round(S.cx), y: 170 });
      }
      // ---- the invaders' bombs: on the assistant's syllables, from the loudest column; now and then otherwise
      var bombChance = reply ? (f.onset ? 1 : 0) : think || st === "idle" ? dt * 0.7 : dt * 0.35;
      if (count && S.bombs.length < 5 && R() < bombChance) {
        var col = 0, bv = -1;
        for (j = 0; j < 11; j++) { var hasAny = false; for (i = 0; i < 5; i++) if (S.alive[i][j]) hasAny = true; var v = hasAny ? bands[3 + j * 2] + R() * 0.2 : -1; if (v > bv) { bv = v; col = j; } }
        for (i = 4; i >= 0; i--) if (S.alive[i][col]) { S.bombs.push({ x: ax(i, col) + (S.types[S.rowType[i]].w >> 1) - 1, y: ay(i, col) + 8, ph: 0 }); break; }
      }
      // ---- the UFO: now and then, and on the assistant's loudest moments
      if (!S.ufo && (t > S.nextUfo || (reply && f.onset && lv > 0.55 && t - S.lastUfo > 8))) {
        var fromLeft = R() < 0.5; S.ufo = { x: fromLeft ? -16 : VW, dir: fromLeft ? 1 : -1 }; S.lastUfo = t; S.nextUfo = t + 16 + R() * 12;
      }
      if (S.ufo) { S.ufo.x += S.ufo.dir * 42 * dt; if (S.ufo.x < -20 || S.ufo.x > VW + 4) S.ufo = null; }
      // ---- shots and bombs
      function bunkerHit(x, y, up) {
        for (var b = 0; b < S.bunkers.length; b++) {
          var bk = S.bunkers[b], lx = Math.round(x - bk.x), ly = Math.round(y - bk.y);
          if (lx < 0 || lx >= 22 || ly < 0 || ly >= 16 || !bk.m[ly * 22 + lx]) continue;
          for (var e = 0; e < 14; e++) {                                   // bite a ragged chunk out of it
            var ex = lx + Math.round((R() - 0.5) * 5), ey = ly + Math.round((R() - 0.5) * 5) + (up ? -1 : 1);
            if (ex >= 0 && ex < 22 && ey >= 0 && ey < 16) bk.m[ey * 22 + ex] = 0;
          }
          bk.m[ly * 22 + lx] = 0; bk.dirty = true; return true;
        }
        return false;
      }
      S.shots = S.shots.filter(function (s) {
        for (var n = 0; n < 4; n++) {                                        // sub-steps so nothing is skipped
          s.y -= 230 * dt / 4;
          if (s.y < 22) { S.boom.push({ x: s.x - 4, y: 22, t: t, spr: null }); return false; }
          if (bunkerHit(s.x, s.y, true)) return false;
          if (S.ufo && s.y < 34 && s.x >= S.ufo.x && s.x < S.ufo.x + 16) {
            var pts = [50, 100, 150, 300][(R() * 4) | 0]; S.score += pts; S.boom.push({ x: S.ufo.x, y: 26, t: t, txt: String(pts), red: true }); S.ufo = null; return false;
          }
          for (var a = 0; a < 5; a++) for (var c = 0; c < 11; c++) {
            if (!S.alive[a][c]) continue;
            var ix = ax(a, c), iy = ay(a, c), tw = S.types[S.rowType[a]].w;
            if (s.x >= ix && s.x < ix + tw && s.y >= iy && s.y < iy + 8) {
              S.alive[a][c] = false; S.score += S.types[S.rowType[a]].pts; S.boom.push({ x: ix + tw / 2 - 6, y: iy, t: t, spr: S.boomSpr }); return false;
            }
          }
        }
        return true;
      });
      S.bombs = S.bombs.filter(function (b) {
        for (var n = 0; n < 3; n++) {
          b.y += 75 * dt / 3; b.ph += dt * 12 / 3;
          if (bunkerHit(b.x + 1, b.y + 7, false)) return false;
          if (alive && b.y + 7 >= 172 && b.y < 180 && b.x + 2 >= S.cx - 7 && b.x <= S.cx + 6) {
            S.deadUntil = t + 1.2; S.lives = S.lives > 1 ? S.lives - 1 : 3; S.boom.push({ x: S.cx - 7, y: 172, t: t, dead: true }); return false;
          }
          if (b.y > 176) { S.boom.push({ x: b.x - 2, y: 178, t: t, small: true }); return false; }
        }
        return true;
      });
      INV_HI = Math.max(INV_HI, S.score);
      // ---- draw the field at 1 px per unit
      var fb = r.buf("invField", VW, S.VH), q = fb.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, VW, S.VH); q.imageSmoothingEnabled = false;
      pixText(q, "SCORE<1>", 12, 2, 1, "#fff", "left"); pixText(q, "HI-SCORE", VW / 2, 2, 1, "#fff", "center"); pixText(q, "SCORE<2>", VW - 12, 2, 1, "#fff", "right");
      pixText(q, String(S.score).padStart(4, "0"), 24, 12, 1, "#fff", "left"); pixText(q, String(INV_HI).padStart(4, "0"), VW / 2, 12, 1, "#fff", "center");
      if (S.ufo) q.drawImage(S.ufoSpr, Math.round(S.ufo.x), 27);
      for (i = 0; i < 5; i++) for (j = 0; j < 11; j++) if (S.alive[i][j]) q.drawImage(S.types[S.rowType[i]].f[S.frame], ax(i, j), ay(i, j));
      S.bunkers.forEach(function (bk) {
        if (bk.dirty) { var bc = bk.c.getContext("2d"), im = bc.createImageData(22, 16); for (var p = 0; p < 22 * 16; p++) if (bk.m[p]) { im.data[p * 4] = im.data[p * 4 + 1] = im.data[p * 4 + 2] = 255; im.data[p * 4 + 3] = 255; } bc.putImageData(im, 0, 0); bk.dirty = false; }
        q.drawImage(bk.c, bk.x, bk.y);
      });
      q.fillStyle = "#fff";
      S.shots.forEach(function (s) { q.fillRect(Math.round(s.x), Math.round(s.y), 1, 4); });
      S.bombs.forEach(function (b) { q.drawImage(S.bombSpr[Math.floor(b.ph) % 2], Math.round(b.x), Math.round(b.y)); });
      if (alive) q.drawImage(S.cannonSpr, Math.round(S.cx - 6), 172);
      S.boom = S.boom.filter(function (e) {
        var age = t - e.t;
        if (e.dead) { if (age > 1.2) return false; q.drawImage(S.deadSpr[Math.floor(age * 10) % 2], Math.round(e.x), 172); return true; }
        if (e.txt) { if (age > 1) return false; pixText(q, e.txt, e.x + 8, 27, 1, "#fff", "center"); return true; }
        if (age > (e.small ? 0.15 : 0.28)) return false;
        if (e.spr) q.drawImage(e.spr, Math.round(e.x), Math.round(e.y));
        else { q.fillRect(Math.round(e.x) + 2, Math.round(e.y), 1, 1); q.fillRect(Math.round(e.x) + 4, Math.round(e.y) + 1, 1, 1); q.fillRect(Math.round(e.x) + 1, Math.round(e.y) + 2, 1, 1); q.fillRect(Math.round(e.x) + 5, Math.round(e.y) + 3, 1, 1); q.fillRect(Math.round(e.x) + 3, Math.round(e.y) + 2, 1, 1); }
        return true;
      });
      q.globalAlpha = 0.75 + 0.25 * S.thump; q.fillRect(0, 183, VW, 1); q.globalAlpha = 1;   // the ground thumps with the march
      pixText(q, String(S.lives), 12, 188, 1, "#fff", "left");
      for (k = 0; k < S.lives - 1; k++) q.drawImage(S.cannonSpr, 26 + k * 16, 188);
      pixText(q, "CREDIT 00", VW - 12, 188, 1, "#fff", "right");
      // the cabinet's coloured strips
      q.globalCompositeOperation = "source-atop";
      q.fillStyle = "#ff3d3d"; q.fillRect(0, 22, VW, 16);
      q.fillStyle = "#3dff6a"; q.fillRect(0, 138, VW, 48); q.fillRect(0, 186, 90, 14);
      q.globalCompositeOperation = "source-over";
      // ---- to the screen: backdrop, the field scaled up crisp, glow, scanlines
      var g0 = r.ctx, s = S.s;
      g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1; g0.drawImage(S.bg, 0, 0);
      var sc = r.buf("invScaled", W, H), qq = sc.getContext("2d");
      qq.clearRect(0, 0, W, H); qq.imageSmoothingEnabled = false; qq.drawImage(fb, S.fx, S.fy, VW * s, S.VH * s);
      g0.drawImage(sc, 0, 0);
      r.bloom(sc, 0.55 + 0.5 * lv, 0.006, 2);
      scanlines(r, 0.14);
    }
  });
