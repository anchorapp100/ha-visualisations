  /* ---------- Phosphor — a green P31 oscilloscope: your voice as a Y-T trace, the assistant's as X-Y Lissajous figures ----------
     Beam brightness is inverse to beam speed (slow parts burn bright), with phosphor persistence and a graticule. */
  register({
    id: "phosphor", name: "Phosphor", layout: "bottom", text: "terminal",
    blurb: "A vintage green-phosphor oscilloscope — your voice as a live trace, the assistant's as spinning Lissajous figures.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, i;
      var sh = Math.min(H * 0.55, W * 0.62 * 0.8), sw = sh * 1.25; S.sw = sw; S.sh = sh; S.sx = (W - sw) / 2; S.sy = H * 0.055; S.cr = 18 * u;
      S.ph = 0; S.mode = 0;
      var sx = S.sx, sy = S.sy;
      // housing
      var hs = mkCanvas(W, H), g = hs.getContext("2d");
      var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1b1d1f"); bg.addColorStop(1, "#0c0d0e"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      var R = rng(2); for (i = 0; i < 1800; i++) { g.fillStyle = "rgba(255,255,255," + (R() * 0.025).toFixed(3) + ")"; g.fillRect(R() * W, R() * H, u, u); }
      g.save(); g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 24 * u; roundRect(g, sx - 26 * u, sy - 26 * u, sw + 52 * u, sh + 52 * u, 30 * u);
      var bz = g.createLinearGradient(0, sy - 26 * u, 0, sy + sh + 26 * u); bz.addColorStop(0, "#2a2d30"); bz.addColorStop(1, "#131416"); g.fillStyle = bz; g.fill(); g.restore();
      roundRect(g, sx - 6 * u, sy - 6 * u, sw + 12 * u, sh + 12 * u, S.cr + 6 * u); g.fillStyle = "#050606"; g.fill();
      g.fillStyle = "#7d8a80"; g.font = "700 " + (11 * u).toFixed(1) + "px 'Courier New',monospace"; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(ASSIST_LABEL() + "·SCOPE  LS-1919", sx - 10 * u, sy + sh + 44 * u);
      g.textAlign = "right"; var ly = sy + sh + 44 * u, x2 = sx + sw + 10 * u, w2 = g.measureText("CH2 " + ASSIST_LABEL()).width;
      g.fillText("CH2 " + ASSIST_LABEL(), x2, ly); var l2 = x2 - w2 - 12 * u, x1 = l2 - 26 * u, w1 = g.measureText("CH1 MIC").width;
      g.fillText("CH1 MIC", x1, ly); S.lamps = [x1 - w1 - 12 * u, l2]; S.ly = ly;
      S.house = hs;
      // screen base
      var sc = mkCanvas(sw, sh), q = sc.getContext("2d"), vg = q.createRadialGradient(sw / 2, sh / 2, 0, sw / 2, sh / 2, sw * 0.62);
      vg.addColorStop(0, "#07130c"); vg.addColorStop(0.7, "#040b07"); vg.addColorStop(1, "#010302"); q.fillStyle = vg; q.fillRect(0, 0, sw, sh); S.scr = sc;
      // graticule + scanlines + glass
      var gr = mkCanvas(sw, sh), c = gr.getContext("2d"), dx = sw / 10, dy = sh / 8;
      c.strokeStyle = "rgba(120,200,150,0.22)"; c.lineWidth = Math.max(1, 0.9 * u);
      for (i = 1; i < 10; i++) { c.beginPath(); c.moveTo(i * dx, 0); c.lineTo(i * dx, sh); c.stroke(); }
      for (i = 1; i < 8; i++) { c.beginPath(); c.moveTo(0, i * dy); c.lineTo(sw, i * dy); c.stroke(); }
      c.strokeStyle = "rgba(120,200,150,0.3)";
      for (i = 1; i < 50; i++) { var tx = i * sw / 50; c.beginPath(); c.moveTo(tx, sh / 2 - 3 * u); c.lineTo(tx, sh / 2 + 3 * u); c.stroke(); }
      for (i = 1; i < 40; i++) { var ty = i * sh / 40; c.beginPath(); c.moveTo(sw / 2 - 3 * u, ty); c.lineTo(sw / 2 + 3 * u, ty); c.stroke(); }
      c.fillStyle = "rgba(0,0,0,0.16)"; for (var y = 0; y < sh; y += 3) c.fillRect(0, y, sw, 1);
      var gl = c.createLinearGradient(0, 0, sw * 0.6, sh); gl.addColorStop(0, "rgba(255,255,255,0.07)"); gl.addColorStop(0.4, "rgba(255,255,255,0.015)"); gl.addColorStop(0.41, "rgba(255,255,255,0)");
      c.fillStyle = gl; c.fillRect(0, 0, sw, sh);
      var ed = c.createRadialGradient(sw / 2, sh / 2, sh * 0.35, sw / 2, sh / 2, sw * 0.7); ed.addColorStop(0, "rgba(0,0,0,0)"); ed.addColorStop(1, "rgba(0,0,0,0.55)");
      c.fillStyle = ed; c.fillRect(0, 0, sw, sh);
      S.grat = gr;
      S.xs = new Float32Array(300); S.ys = new Float32Array(300);
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, n = 0;
      var sw = S.sw, sh = S.sh, P = r.buf("phos", sw, sh), p = P.getContext("2d");
      p.globalCompositeOperation = "destination-out"; p.fillStyle = "rgba(0,0,0," + (1 - Math.pow(0.7, dt * 30)).toFixed(3) + ")"; p.fillRect(0, 0, sw, sh);
      p.globalCompositeOperation = "lighter";
      var wv = f.wave, xs = S.xs, ys = S.ys, midY = sh / 2, midX = sw / 2;
      if (st === "listening") {                                   // Y-T, triggered on a rising zero crossing like a real scope
        var trig = 0, best = 0;
        for (i = 0; i < 90; i++) { var sl = wv[i + 1] - wv[i]; if (wv[i] <= 0 && wv[i + 1] > 0 && sl > best) { best = sl; trig = i; } }
        for (i = 0; i < 160; i++) { xs[n] = i / 159 * sw; ys[n] = midY - Math.tanh(wv[trig + i] * 2.2) * sh * 0.36; n++; }
      } else if (st === "responding") {                           // X-Y: sample vs quarter-window delay, slowly rotating
        var rot = t * 0.35, cr = Math.cos(rot), sr = Math.sin(rot), gn = 3.2;
        for (i = 0; i < 256; i++) {
          var a = Math.tanh(wv[i] * gn), b = Math.tanh(wv[(i + 37) & 255] * gn);
          xs[n] = midX + (a * cr - b * sr) * sh * 0.4; ys[n] = midY - (a * sr + b * cr) * sh * 0.4; n++;
        }
      } else if (st === "processing") {                           // 3:2 Lissajous knot turning over
        var ph = t * 1.6;
        for (i = 0; i < 300; i++) { var s = i / 299 * TAU; xs[n] = midX + Math.sin(3 * s + ph) * sh * 0.36; ys[n] = midY - Math.sin(2 * s) * sh * 0.3; n++; }
      } else {                                                    // idle: a resting baseline with a little noise
        for (i = 0; i < 128; i++) { xs[n] = i / 127 * sw; ys[n] = midY + (noise1(i * 0.9 + t * 20) - 0.5) * 2.4 * u; n++; }
      }
      var buckets = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()], k0 = 2.2 * u;
      for (i = 1; i < n; i++) {
        var dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1], len = Math.sqrt(dx * dx + dy * dy), inten = k0 / (len + 0.5);
        var bk = inten > 0.9 ? 4 : inten > 0.5 ? 3 : inten > 0.25 ? 2 : inten > 0.1 ? 1 : 0;
        buckets[bk].moveTo(xs[i - 1], ys[i - 1]); buckets[bk].lineTo(xs[i], ys[i]);
      }
      var al = [0.22, 0.4, 0.62, 0.85, 1], boost = 0.75 + 0.35 * lv;
      p.lineCap = "round"; p.lineJoin = "round";
      for (i = 0; i < 5; i++) {
        p.lineWidth = (1.8 + i * 0.25) * u; p.strokeStyle = rgba(i > 3 ? [190, 255, 215] : [90, 255, 150], Math.min(1, al[i] * boost)); p.stroke(buckets[i]);
      }
      var g = r.ctx, sx = S.sx, sy = S.sy;
      g.drawImage(S.house, 0, 0);
      g.save(); roundRect(g, sx, sy, sw, sh, S.cr); g.clip();
      g.drawImage(S.scr, sx, sy);
      g.globalCompositeOperation = "lighter"; g.drawImage(P, sx, sy);
      g.globalCompositeOperation = "source-over"; g.drawImage(S.grat, sx, sy);
      g.restore();
      var bl = r.buf("phb", W, H), bc = bl.getContext("2d");
      bc.clearRect(0, 0, W, H); bc.drawImage(P, sx, sy);
      r.bloom(bl, 1.0 + 0.5 * lv, 0.022, 2);
      var lamps = [[S.lamps[0], st === "listening"], [S.lamps[1], st === "responding"]];
      lamps.forEach(function (L) {
        var lx = L[0], ly = S.ly, on = L[1], rr = 4 * u, lg = g.createRadialGradient(lx, ly, 0, lx, ly, on ? rr * 4 : rr);
        lg.addColorStop(0, on ? "rgba(170,255,200,1)" : "rgba(40,70,50,1)"); lg.addColorStop(on ? 0.25 : 1, on ? "rgba(80,255,140,0.8)" : "rgba(20,40,28,1)"); if (on) lg.addColorStop(1, "rgba(80,255,140,0)");
        g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, on ? rr * 4 : rr, 0, TAU); g.fill();
      });
    }
  });
