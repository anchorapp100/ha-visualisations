  /* ---------- Mother — MU/TH/UR 6000 from Alien: a phosphor terminal ready for inquiry, beside a wall of lamps ----------
     The terminal types its ready line at the start of every conversation and traces the voice along its foot; the lamp wall
     chatters faster the louder someone speaks (each column follows its own slice of the spectrum), sweeps in a diagonal
     wave while it thinks, and throws a cluster of lamps on every syllable. The transcript is the HTML layer ("mother"
     text theme), sitting inside the screen. */
  register({
    id: "mother", name: "Mother", layout: "left", text: "mother", hiDpi: true,
    blurb: "MU/TH/UR 6000 from Alien. A green terminal, ready for your question, beside a wall of lamps that chatters as you talk.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(2037), i, j, a, b;
      S.C = [140, 255, 214]; S.R = rng(6000);
      // the terminal
      var cx0 = W * 0.03, cy0 = H * 0.05, cw = W * 0.555, ch = H * 0.9, pad = Math.min(cw, ch) * 0.045;
      S.sx = cx0 + pad; S.sy = cy0 + pad; S.sw = cw - 2 * pad; S.sh = ch - 2 * pad; S.cr = 16 * u;
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#050607"; g.fillRect(0, 0, W, H);
      var amb = g.createRadialGradient(W * 0.3, H * 0.5, 0, W * 0.3, H * 0.5, W * 0.7);
      amb.addColorStop(0, "rgba(30,60,52,0.35)"); amb.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = amb; g.fillRect(0, 0, W, H);
      g.save(); g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 22 * u;
      roundRect(g, cx0, cy0, cw, ch, 24 * u);
      var bz = g.createLinearGradient(0, cy0, 0, cy0 + ch); bz.addColorStop(0, "#2a2c2b"); bz.addColorStop(1, "#121313");
      g.fillStyle = bz; g.fill(); g.restore();
      roundRect(g, S.sx - 5 * u, S.sy - 5 * u, S.sw + 10 * u, S.sh + 10 * u, S.cr + 5 * u); g.fillStyle = "#020303"; g.fill();
      var scr = g.createRadialGradient(S.sx + S.sw / 2, S.sy + S.sh / 2, 0, S.sx + S.sw / 2, S.sy + S.sh / 2, S.sw * 0.65);
      scr.addColorStop(0, "#04120e"); scr.addColorStop(0.75, "#020a08"); scr.addColorStop(1, "#010403");
      roundRect(g, S.sx, S.sy, S.sw, S.sh, S.cr); g.fillStyle = scr; g.fill();
      g.fillStyle = "rgba(170,185,178,0.5)"; g.font = "700 " + (10 * u).toFixed(1) + "px 'Courier New',monospace";
      g.textBaseline = "middle"; g.textAlign = "left"; g.fillText("MU/TH/UR 6000", cx0 + 24 * u, cy0 + ch - pad * 0.45);
      g.textAlign = "right"; g.fillText("INTERFACE 2037", cx0 + cw - 24 * u, cy0 + ch - pad * 0.45);
      // the lamp wall: 3 x 5 panels of 5 x 4 lamps, dark sockets drawn once
      var lx0 = W * 0.615, ly0 = H * 0.05, lw = W * 0.355, lh = H * 0.9, PC = 3, PR = 5, LC = 5, LR = 4;
      var gap = Math.min(lw, lh) * 0.03, pw = (lw - gap * (PC - 1)) / PC, ph = (lh - gap * (PR - 1)) / PR;
      var lr = Math.min(pw / LC, ph / LR) * 0.2;
      S.lr = lr; S.lamps = []; S.wall = [lx0, ly0, lw, lh];
      for (a = 0; a < PC; a++) for (b = 0; b < PR; b++) {
        var px = lx0 + a * (pw + gap), py = ly0 + b * (ph + gap);
        g.save(); g.shadowColor = "rgba(0,0,0,0.8)"; g.shadowBlur = 8 * u;
        roundRect(g, px, py, pw, ph, 5 * u);
        var pg = g.createLinearGradient(px, py, px, py + ph); pg.addColorStop(0, "#1d1f20"); pg.addColorStop(1, "#111213");
        g.fillStyle = pg; g.fill(); g.restore();
        roundRect(g, px + 1.5 * u, py + 1.5 * u, pw - 3 * u, ph - 3 * u, 4 * u); g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = Math.max(1, u); g.stroke();
        g.fillStyle = "rgba(150,160,155,0.35)"; g.font = "600 " + (7.5 * u).toFixed(1) + "px 'Courier New',monospace"; g.textAlign = "left";
        g.fillText(String.fromCharCode(65 + b) + "-" + (a * PR + b + 11), px + 5 * u, py + ph - 6 * u);
        for (i = 0; i < LC; i++) for (j = 0; j < LR; j++) {
          var x = px + pw * (0.14 + 0.72 * i / (LC - 1)), y = py + ph * (0.16 + 0.58 * j / (LR - 1)), p = R();
          var type = p < 0.66 ? 0 : p < 0.9 ? 1 : 2;
          g.beginPath(); g.arc(x, y, lr * 1.35, 0, TAU); g.fillStyle = "#070808"; g.fill();
          g.beginPath(); g.arc(x, y, lr, 0, TAU); g.fillStyle = ["#2c2a26", "#2e2518", "#2e1a17"][type]; g.fill();
          S.lamps.push({ x: x, y: y, type: type, on: R() < 0.3, rate: 0.35 + R() * 1.5, band: Math.min(31, ((a * LC + i) / (PC * LC - 1) * 30) | 0),
                         diag: a * LC + i + (b * LR + j) * 0.7, flash: 0 });
        }
      }
      S.bg = bg;
      S.spr = [[255, 246, 226], [255, 178, 72], [255, 74, 44]].map(function (c) { return dotSprite(Math.ceil(lr * 7), c, [255, 255, 250]); });
      // the glass: scanlines, a curvature vignette and a faint reflection
      var gl = mkCanvas(S.sw, S.sh), q = gl.getContext("2d");
      q.fillStyle = "rgba(0,0,0,0.22)"; for (var yy = 0; yy < S.sh; yy += 3) q.fillRect(0, yy, S.sw, 1);
      var vg = q.createRadialGradient(S.sw / 2, S.sh / 2, S.sh * 0.3, S.sw / 2, S.sh / 2, S.sw * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.6)"); q.fillStyle = vg; q.fillRect(0, 0, S.sw, S.sh);
      var rf = q.createLinearGradient(0, 0, S.sw * 0.7, S.sh); rf.addColorStop(0, "rgba(255,255,255,0.05)"); rf.addColorStop(0.35, "rgba(255,255,255,0.012)"); rf.addColorStop(0.36, "rgba(255,255,255,0)");
      q.fillStyle = rf; q.fillRect(0, 0, S.sw, S.sh);
      S.glass = gl;
      S.typeT = null; S.lastSt = null; S.cool = 0; S.warm = 0; S.gold = 0;
      S.READY = "INTERFACE 2037 READY FOR INQUIRY";
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, R = S.R, i, L;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      if (S.typeT === null) S.typeT = t - 99;                     // first frame: the ready line is already typed
      if (st !== S.lastSt) { if (st === "listening" && S.lastSt !== null) S.typeT = t; S.lastSt = st; }
      S.cool = follow(S.cool, st === "listening" ? 1 : 0, 0.1, 0.06, dt);
      S.warm = follow(S.warm, st === "responding" ? 1 : 0, 0.1, 0.06, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.1, 0.05, dt);
      // the lamps
      var act = talk ? 0.7 + 5.5 * lv : 0.45, n = S.lamps.length;
      if (f.onset && talk) for (i = 0; i < 7; i++) { L = S.lamps[(R() * n) | 0]; L.on = true; L.flash = 1; }
      for (i = 0; i < n; i++) {
        L = S.lamps[i];
        if (proc) L.on = Math.sin(t * 6.5 - L.diag * 0.5) > 0.5 || (L.on && R() < 0.3);
        else if (R() < clamp(dt * L.rate * act * (talk ? 0.45 + 1.3 * f.bands[L.band] : 1), 0, 0.9)) L.on = !L.on;
        L.flash = Math.max(0, L.flash - dt * 3);
      }
      var g = r.ctx; g.drawImage(S.bg, 0, 0);
      var lb = r.buf("mulamps", W, H), c = lb.getContext("2d"), wl = S.wall, half = S.spr[0].width / 2;
      c.globalCompositeOperation = "source-over"; c.clearRect(wl[0] - half, wl[1] - half, wl[2] + 2 * half, wl[3] + 2 * half);
      for (i = 0; i < n; i++) {
        L = S.lamps[i]; if (!L.on && L.flash < 0.05) continue;
        c.globalAlpha = clamp((L.on ? 0.8 : 0) + 0.45 * L.flash, 0, 1); c.drawImage(S.spr[L.type], L.x - half, L.y - half);
      }
      c.globalAlpha = 1;
      var tint = S.cool > 0.02 ? [[150, 215, 255], 0.45 * S.cool] : S.warm > 0.02 ? [[255, 150, 205], 0.35 * S.warm] : [[255, 196, 90], 0.4 * S.gold];
      if (tint[1] > 0.02) {
        c.globalCompositeOperation = "source-atop"; c.fillStyle = rgba(tint[0], tint[1]);
        c.fillRect(wl[0] - half, wl[1] - half, wl[2] + 2 * half, wl[3] + 2 * half); c.globalCompositeOperation = "source-over";
      }
      g.save(); g.globalCompositeOperation = "lighter"; g.drawImage(lb, 0, 0); g.restore();
      // the terminal's phosphor, with a little persistence
      var sw = S.sw, sh = S.sh, P = r.buf("muphos", sw, sh), p = P.getContext("2d"), C = S.C;
      p.globalCompositeOperation = "destination-out"; p.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.55, dt * 30)).toFixed(3) + ")"; p.fillRect(0, 0, sw, sh);
      p.globalCompositeOperation = "lighter";
      var fs = Math.max(10, sh * 0.042), x0 = sw * 0.07, y0 = sh * 0.1, mono = "'Cascadia Mono','Consolas','Lucida Console','Courier New',monospace";
      p.textBaseline = "middle"; p.textAlign = "left"; p.fillStyle = rgba(C, 0.95);
      p.font = "700 " + fs.toFixed(1) + "px " + mono; p.fillText("MU/TH/UR 6000", x0, y0);
      p.font = "400 " + fs.toFixed(1) + "px " + mono;
      var typed = clamp(Math.floor((t - S.typeT) * 34), 0, S.READY.length), line = S.READY.slice(0, typed);
      p.fillStyle = rgba(C, 0.85); p.fillText(line, x0, y0 + fs * 1.6);
      if (typed < S.READY.length || (t * 1.6) % 1 < 0.55) {
        var cwid = p.measureText("M").width; p.fillStyle = rgba(C, 0.9);
        p.fillRect(x0 + p.measureText(line).width + cwid * 0.2, y0 + fs * 1.6 - fs * 0.5, cwid * 0.9, fs * 1.0);
      }
      p.fillStyle = rgba(C, 0.35); p.fillRect(x0, y0 + fs * 2.7, sw * 0.86, Math.max(1, u));
      // the foot: a live trace of the voice, or a progress row while it thinks
      var fy = sh * 0.9, fx0 = x0, fx1 = sw * 0.93, amp = sh * 0.05;
      p.fillStyle = rgba(C, 0.45); p.font = "600 " + (fs * 0.62).toFixed(1) + "px " + mono; p.fillText(proc ? "COMPUTING" : "AUDIO I/O", fx0, fy - amp * 1.9);
      if (proc) {
        var nb = 24, bw = (fx1 - fx0) / nb, lit = Math.floor((t * 12) % (nb + 6));
        for (i = 0; i < nb; i++) { p.fillStyle = rgba(C, i <= lit ? 0.85 : 0.14); p.fillRect(fx0 + i * bw + bw * 0.15, fy - amp * 0.35, bw * 0.7, amp * 0.7); }
      } else {
        var wv = f.wave, gn = talk ? 2.4 : 0.5;
        p.beginPath();
        for (i = 0; i < 200; i++) { var xx = fx0 + (fx1 - fx0) * i / 199, yv = fy - Math.tanh(wv[(i * 1.28) | 0] * gn) * amp; if (i) p.lineTo(xx, yv); else p.moveTo(xx, yv); }
        p.strokeStyle = rgba(C, 0.85); p.lineWidth = 1.6 * u; p.stroke();
      }
      var flick = 0.93 + 0.07 * noise1(t * 23);
      g.save(); roundRect(g, S.sx, S.sy, sw, sh, S.cr); g.clip();
      g.globalCompositeOperation = "lighter"; g.globalAlpha = flick; g.drawImage(P, S.sx, S.sy);
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.glass, S.sx, S.sy);
      g.restore();
      var bl = r.buf("mubloom", W, H), bc = bl.getContext("2d");
      bc.globalCompositeOperation = "source-over"; bc.clearRect(0, 0, W, H); bc.drawImage(P, S.sx, S.sy);
      bc.globalCompositeOperation = "lighter"; bc.globalAlpha = 0.7; bc.drawImage(lb, 0, 0); bc.globalAlpha = 1;
      r.bloom(bl, 0.75 + 0.5 * lv, 0.02, 2);
    }
  });
