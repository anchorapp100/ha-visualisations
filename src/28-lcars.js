  /* ---------- LCARS — the Starfleet computer console from Star Trek: The Next Generation ----------
     Elbows, sidebar blocks and bar segments in the LCARS palette frame the transcript ("lcars" layout + text theme); below
     it a row of rounded bars is the live spectrum: blue while you talk, lavender while the assistant does, a gold chase while it
     thinks. Syllables flash a sidebar block and roll the readouts. The frame is drawn once; highlights sit on top of it. */
  register({
    id: "lcars", name: "LCARS", layout: "lcars", text: "lcars", hiDpi: true,
    blurb: "The Starfleet computer's LCARS console. Its bars light blue for you and lavender for the assistant, and chase in gold while it thinks.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(1701), i;
      var C = S.C = { orange: [255, 153, 102], peach: [255, 204, 153], lav: [204, 153, 204], blue: [153, 153, 255], sky: [153, 204, 255],
                      gold: [255, 204, 102], pink: [255, 153, 204], tan: [204, 153, 102], red: [204, 102, 102] };
      var mx = W * 0.035, my = H * 0.05, sw = W * 0.14, th = H * 0.065, ro = Math.min(sw * 0.85, th * 2.6), ri = th * 0.9;
      var yA = my + th + H * 0.1, yB = H - my - th - H * 0.1, xE = mx + sw + W * 0.07, gapX = W * 0.006, gapY = H * 0.012;
      S.fam = "'Antonio','Bahnschrift Condensed','Bahnschrift','Arial Narrow','Roboto Condensed',sans-serif";
      function font(q, w, px) { q.font = w + " " + px.toFixed(1) + "px " + S.fam; try { q.fontStretch = "condensed"; } catch (e) {} }
      S.font = font;
      var bg = mkCanvas(W, H), g = bg.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      function elbow(top) {
        var y0 = top ? my : H - my, s = top ? 1 : -1, yEnd = top ? yA : yB;
        g.beginPath(); g.moveTo(mx, yEnd); g.lineTo(mx, y0 + s * ro); g.arcTo(mx, y0, mx + ro, y0, ro);
        g.lineTo(xE, y0); g.lineTo(xE, y0 + s * th); g.lineTo(mx + sw + ri, y0 + s * th);
        g.arcTo(mx + sw, y0 + s * th, mx + sw, y0 + s * (th + ri), ri); g.lineTo(mx + sw, yEnd); g.closePath();
      }
      elbow(true); g.fillStyle = rgba(C.orange, 1); g.fill();
      elbow(false); g.fillStyle = rgba(C.lav, 1); g.fill();
      // sidebar blocks between the elbows
      var props = [0.22, 0.12, 0.34, 0.14, 0.18], cols = [C.lav, C.peach, C.blue, C.orange, C.tan], y = yA + gapY, avail = yB - gapY - y - gapY * (props.length - 1);
      S.blocks = [];
      for (i = 0; i < props.length; i++) {
        var bh = avail * props[i]; S.blocks.push([mx, y, sw, bh, cols[i]]);
        g.fillStyle = rgba(cols[i], 1); g.fillRect(mx, y, sw, bh);
        g.fillStyle = "#000"; font(g, "600", Math.min(sw * 0.13, bh * 0.4)); g.textAlign = "right"; g.textBaseline = "bottom";
        g.fillText(("0" + ((R() * 90 + 10) | 0)).slice(-2) + "-" + (1000 + ((R() * 8999) | 0)), mx + sw - sw * 0.06, y + bh - bh * 0.08);
        y += bh + gapY;
      }
      // the top bar: segments, then the title
      font(g, "600", th * 1.18); g.textAlign = "right"; g.textBaseline = "middle"; g.fillStyle = rgba(C.orange, 1);
      var title = "VOICE INTERFACE", tw = g.measureText(title).width, tx = W - mx;
      g.fillText(title, tx, my + th * 0.54);
      function segs(x0, x1, yy, hh, parts, capRight) {
        var tot = x1 - x0 - gapX * (parts.length - 1), x = x0, out = [];
        parts.forEach(function (p, k) {
          var w = tot * p[0]; out.push([x, yy, w, hh, p[1]]);
          g.fillStyle = rgba(p[1], 1);
          if (capRight && k === parts.length - 1) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w - hh / 2, yy); g.arc(x + w - hh / 2, yy + hh / 2, hh / 2, -Math.PI / 2, Math.PI / 2); g.lineTo(x, yy + hh); g.closePath(); g.fill(); }
          else g.fillRect(x, yy, w, hh);
          x += w + gapX;
        });
        return out;
      }
      S.topSegs = segs(xE + gapX, tx - tw - W * 0.015, my, th, [[0.46, C.lav], [0.2, C.sky], [0.34, C.peach]], false);
      S.botSegs = segs(xE + gapX, W - mx, H - my - th, th, [[0.16, C.blue], [0.42, C.peach], [0.26, C.lav], [0.16, C.orange]], true);
      S.th = th; S.my = my; S.mx = mx;
      // the spectrum area
      S.vx0 = mx + sw + W * 0.045; S.vx1 = W - mx; S.vy0 = H * 0.565; S.vy1 = H - my - th - H * 0.05;
      S.N = 28; S.h = new Float32Array(S.N); S.flash = new Float32Array(props.length);
      var pitch = (S.vx1 - S.vx0) / S.N; S.pitch = pitch; S.pwid = pitch * 0.6;
      font(g, "600", H * 0.028); g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = rgba(C.orange, 1);
      g.fillText("VOICE ANALYSIS", S.vx0, S.vy0);
      g.fillStyle = rgba(C.peach, 0.9); g.fillRect(S.vx0, S.vy0 + H * 0.022, S.vx1 - S.vx0, Math.max(1, 1.5 * u));
      for (i = 0; i < S.N; i++) {                                 // dark tracks behind each bar
        var cx = S.vx0 + pitch * (i + 0.5), top = S.vy0 + H * 0.05;
        roundRect(g, cx - S.pwid / 2, top, S.pwid, S.vy1 - top, S.pwid / 2); g.fillStyle = "rgba(60,48,70,0.45)"; g.fill();
      }
      S.bg = bg; S.nums = []; S.numT = -9; S.mode = 0; S.R = rng(47);
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, C = S.C, R = S.R, i;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      var g = r.ctx; g.drawImage(S.bg, 0, 0);
      // syllables flash a sidebar block; the readouts roll with the voice
      if (f.onset && talk) S.flash[(R() * S.flash.length) | 0] = 1;
      for (i = 0; i < S.flash.length; i++) S.flash[i] = Math.max(0, S.flash[i] - dt * 3);
      if (t - S.numT > (talk ? 0.35 : proc ? 0.2 : 1.4)) {
        S.numT = t; S.nums = S.botSegs.map(function () { return ((R() * 90 + 10) | 0) + "-" + ((R() * 9000 + 1000) | 0); });
      }
      var hl = r.buf("lchl", W, H), q = hl.getContext("2d");
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, W, H);
      S.blocks.forEach(function (b, k) {
        var a = S.flash[k] * 0.55 + (proc && ((t * 5) | 0) % S.blocks.length === k ? 0.4 : 0);
        if (a > 0.01) { q.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")"; q.fillRect(b[0], b[1], b[2], b[3]); }
      });
      if (proc) S.topSegs.forEach(function (b, k) { if (((t * 4) | 0) % S.topSegs.length === k) { q.fillStyle = "rgba(255,255,255,0.35)"; q.fillRect(b[0], b[1], b[2], b[3]); } });
      g.drawImage(hl, 0, 0);
      S.font(g, "600", S.th * 0.46); g.textAlign = "right"; g.textBaseline = "bottom"; g.fillStyle = "#000";
      S.botSegs.forEach(function (b, k) { if (b[2] > S.th * 2.2 && S.nums[k]) g.fillText(S.nums[k], b[0] + b[2] - S.th * (k === S.botSegs.length - 1 ? 0.7 : 0.25), b[1] + b[3] - S.th * 0.1); });
      S.font(g, "600", H * 0.028); g.textAlign = "right"; g.textBaseline = "middle";
      g.fillStyle = rgba(proc ? C.gold : st === "responding" ? C.lav : st === "listening" ? C.sky : C.tan, 1);
      g.fillText(proc ? "COMPUTING" : st === "responding" ? "TRANSMITTING" : st === "listening" ? "RECEIVING" : "STANDBY", S.vx1, S.vy0);
      // the spectrum bars
      var top = S.vy0 + H * 0.05, span = S.vy1 - top, pw = S.pwid, bars = r.buf("lcbars", W, H), b2 = bars.getContext("2d");
      b2.globalCompositeOperation = "source-over"; b2.clearRect(S.vx0 - 4, top - 4, S.vx1 - S.vx0 + 8, span + 8);
      for (i = 0; i < S.N; i++) {
        var target;
        if (talk) {
          var bi = i / (S.N - 1) * 30, b0 = bi | 0, bv = f.bands[b0] * (1 - (bi - b0)) + f.bands[Math.min(31, b0 + 1)] * (bi - b0);
          target = clamp((bv - 0.28) / 0.72 * (0.9 + 0.3 * i / (S.N - 1)) * (0.55 + 0.6 * lv), 0, 1);
        } else if (proc) target = 0.12 + 0.72 * Math.pow(0.5 + 0.5 * Math.sin(t * 5 - i * 0.45), 4);
        else target = 0.05 + 0.05 * noise1(i * 0.8 + t * 1.2);
        S.h[i] = target > S.h[i] ? S.h[i] + (target - S.h[i]) * (1 - Math.pow(0.25, dt * 30)) : Math.max(target, S.h[i] - dt * 1.1);
        var hh = pw + (span - pw) * S.h[i], cx = S.vx0 + S.pitch * (i + 0.5);
        var col = proc ? C.gold : st === "responding" ? (i % 2 ? C.pink : C.lav) : st === "listening" ? (i % 2 ? C.blue : C.sky) : C.tan;
        roundRect(b2, cx - pw / 2, S.vy1 - hh, pw, hh, pw / 2); b2.fillStyle = rgba(col, talk || proc ? 1 : 0.55); b2.fill();
      }
      g.drawImage(bars, 0, 0);
      r.bloom(bars, 0.12 + 0.2 * lv, 0.012, 1);
    }
  });
