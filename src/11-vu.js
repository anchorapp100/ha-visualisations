  /* ---------- Classic VU — twin backlit analogue meters (MIC = you, the other = the assistant's reply) ----------
     Deflection is linear in amplitude (as a real VU): dB marks sit at 10^(dB/20)/1.413 of full scale.
     Needle = 2nd-order spring (zeta 0.81, wn 18.9 rad/s) -> ~300ms rise, ~1.3% overshoot, per the VU spec. */
  register({
    id: "classic-vu", name: "Classic VU", layout: "bottom", text: "warm", hiDpi: true,
    blurb: "Twin backlit analogue VU meters with real needle ballistics — MIC for you, the other for the assistant.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u;
      var gap = W * 0.04, mw = Math.min((W * 0.84 - gap) / 2, H * 0.52 * 1.62), mh = mw / 1.62;
      S.mw = mw; S.mh = mh; S.my = H * 0.1; S.mx = [W / 2 - gap / 2 - mw, W / 2 + gap / 2];
      var fu = mw / 400; S.fu = fu;
      S.fx = 12 * fu; S.fy = 12 * fu; S.fw = mw - 24 * fu; S.fh = mh - 24 * fu;
      S.px = mw / 2; S.py = S.fy + S.fh * 1.08; S.Rs = S.fh * 0.83;
      S.m = [{ pos: 0, vel: 0, peakT: -9, lamp: .6 }, { pos: 0, vel: 0, peakT: -9, lamp: .6 }];
      var th = function (a) { return (-138 + 96 * a) * Math.PI / 180; };
      var amp = function (db) { return Math.pow(10, db / 20) / 1.413; };
      S.th = th;
      // ---- face ----
      var face = mkCanvas(mw, mh), g = face.getContext("2d");
      var bz = g.createLinearGradient(0, 0, 0, mh); bz.addColorStop(0, "#34373c"); bz.addColorStop(1, "#0b0c0e");
      roundRect(g, 0, 0, mw, mh, 16 * fu); g.fillStyle = bz; g.fill();
      roundRect(g, S.fx, S.fy, S.fw, S.fh, 8 * fu); g.save(); g.clip();
      var fg = g.createRadialGradient(S.px, S.fy + S.fh * 1.15, 0, S.px, S.fy + S.fh * 1.15, S.fw * 0.95);
      fg.addColorStop(0, "#fff7e0"); fg.addColorStop(0.5, "#f7e4b3"); fg.addColorStop(0.85, "#e6c889"); fg.addColorStop(1, "#c9a45f");
      g.fillStyle = fg; g.fillRect(S.fx, S.fy, S.fw, S.fh);
      var R = rng(5); for (var k = 0; k < 900; k++) { g.fillStyle = "rgba(90,60,20," + (0.015 + R() * 0.03).toFixed(3) + ")"; g.fillRect(S.fx + R() * S.fw, S.fy + R() * S.fh, fu, fu); }
      var px = S.px, py = S.py, Rs = S.Rs;
      function P(rad, a) { var t = th(a); return [px + rad * Math.cos(t), py + rad * Math.sin(t)]; }
      g.lineCap = "butt";
      g.strokeStyle = "#1c1a16"; g.lineWidth = 1.6 * fu; g.beginPath(); g.arc(px, py, Rs, th(amp(-20)), th(amp(0))); g.stroke();
      g.strokeStyle = "#c8102e"; g.lineWidth = 6 * fu; g.beginPath(); g.arc(px, py, Rs + 3 * fu, th(amp(0)), th(1)); g.stroke();
      var majors = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3], minors = [-15, -8.5, -6, -4, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
      majors.forEach(function (db) {
        var a = amp(db), p0 = P(Rs, a), p1 = P(Rs + 11 * fu, a);
        g.strokeStyle = db > 0 ? "#b30d28" : "#1c1a16"; g.lineWidth = 1.7 * fu; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        var t = P(Rs + 25 * fu, a); g.fillStyle = db > 0 ? "#b30d28" : "#1c1a16";
        g.font = "700 " + (15 * fu).toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(Math.abs(db)), t[0], t[1]);
      });
      minors.forEach(function (db) {
        var a = amp(db), p0 = P(Rs, a), p1 = P(Rs + 6 * fu, a);
        g.strokeStyle = db > 0 ? "#b30d28" : "#1c1a16"; g.lineWidth = 1.1 * fu; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      });
      // percentage scale
      g.globalAlpha = 0.62; g.strokeStyle = "#1c1a16"; g.lineWidth = 1 * fu; g.beginPath(); g.arc(px, py, Rs - 26 * fu, th(0.0001), th(0.708)); g.stroke();
      [0, 20, 40, 60, 80, 100].forEach(function (pc) {
        var a = pc / 100 * 0.708, p0 = P(Rs - 26 * fu, a), p1 = P(Rs - 31 * fu, a), t = P(Rs - 40 * fu, a);
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        g.fillStyle = "#1c1a16"; g.font = "600 " + (8.5 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif"; g.fillText(String(pc), t[0], t[1]);
      });
      g.globalAlpha = 1;
      var m1 = P(Rs - 14 * fu, 0.02), p2 = P(Rs - 14 * fu, 0.985);
      g.font = "700 " + (20 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif"; g.fillStyle = "#1c1a16"; g.fillText("−", m1[0], m1[1]);
      g.fillStyle = "#b30d28"; g.fillText("+", p2[0], p2[1]);
      g.fillStyle = "#15130f"; g.font = "800 " + (34 * fu).toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; g.fillText("VU", px, S.fy + S.fh * 0.66);
      g.globalAlpha = 0.5; g.font = "600 " + (8 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif";
      g.fillText("D  A  V  I  S    ·    L  U  N  A", px, S.fy + S.fh * 0.77); g.globalAlpha = 1;
      g.fillStyle = "rgba(40,20,0,0.55)"; g.font = "600 " + (7 * fu).toFixed(1) + "px Helvetica,Arial,sans-serif";
      g.fillText("PEAK", S.fx + S.fw - 22 * fu, S.fy + 34 * fu);
      g.restore();
      // bezel inner edge
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 2 * fu; roundRect(g, S.fx, S.fy, S.fw, S.fh, 8 * fu); g.stroke();
      S.face = face;
      // ---- cover strip (hides the pivot; drawn over the needle) ----
      var cov = mkCanvas(mw, mh), c = cov.getContext("2d"), cy0 = S.fy + S.fh * 0.855;
      roundRect(c, S.fx, S.fy, S.fw, S.fh, 8 * fu); c.save(); c.clip();
      var cg = c.createLinearGradient(0, cy0, 0, S.fy + S.fh); cg.addColorStop(0, "#1b1c1f"); cg.addColorStop(1, "#050506");
      c.fillStyle = cg; c.fillRect(S.fx, cy0, S.fw, S.fh); c.fillStyle = "rgba(255,255,255,0.10)"; c.fillRect(S.fx, cy0, S.fw, 1.2 * fu);
      var sx = px, sy = S.fy + S.fh * 0.93, sr = 5 * fu, sg = c.createRadialGradient(sx - sr * .3, sy - sr * .3, 0, sx, sy, sr);
      sg.addColorStop(0, "#8b8f95"); sg.addColorStop(1, "#2a2c2f"); c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
      c.strokeStyle = "#111"; c.lineWidth = 1.3 * fu; c.beginPath(); c.moveTo(sx - sr * .75, sy + sr * .25); c.lineTo(sx + sr * .75, sy - sr * .25); c.stroke();
      c.restore(); S.cover = cov;
      // ---- glass ----
      var gl = mkCanvas(mw, mh), q = gl.getContext("2d");
      roundRect(q, S.fx, S.fy, S.fw, S.fh, 8 * fu); q.save(); q.clip();
      var gg = q.createLinearGradient(S.fx, S.fy, S.fx + S.fw * 0.55, S.fy + S.fh);
      gg.addColorStop(0, "rgba(255,255,255,0.20)"); gg.addColorStop(0.36, "rgba(255,255,255,0.05)"); gg.addColorStop(0.37, "rgba(255,255,255,0)"); gg.addColorStop(1, "rgba(255,255,255,0)");
      q.fillStyle = gg; q.fillRect(S.fx, S.fy, S.fw, S.fh);
      var ig = q.createLinearGradient(0, S.fy, 0, S.fy + 14 * fu); ig.addColorStop(0, "rgba(0,0,0,0.28)"); ig.addColorStop(1, "rgba(0,0,0,0)");
      q.fillStyle = ig; q.fillRect(S.fx, S.fy, S.fw, 14 * fu); q.restore(); S.glass = gl;
      // ---- brushed panel ----
      var pn = mkCanvas(W, H), p = pn.getContext("2d"), R2 = rng(11);
      p.fillStyle = "#121417"; p.fillRect(0, 0, W, H);
      for (var y = 0; y < H; y += 2) { var a2 = R2(); p.fillStyle = a2 < .15 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255," + (0.008 + a2 * 0.028).toFixed(3) + ")"; p.fillRect(0, y, W, 1); }
      var sh = p.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, "rgba(255,255,255,0.035)"); sh.addColorStop(0.45, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.3)");
      p.fillStyle = sh; p.fillRect(0, 0, W, H);
      var vg = p.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.62)");
      p.fillStyle = vg; p.fillRect(0, 0, W, H);
      p.save(); p.shadowColor = "rgba(0,0,0,0.85)"; p.shadowBlur = 34 * u; p.shadowOffsetY = 8 * u; p.fillStyle = "#000";
      S.mx.forEach(function (x) { roundRect(p, x, S.my, mw, mh, 16 * fu); p.fill(); }); p.restore();
      [[0.035, 0.06], [0.965, 0.06], [0.035, 0.94], [0.965, 0.94]].forEach(function (s, i) {
        var X = s[0] * W, Y = s[1] * H, rr = 8 * u, gg2 = p.createRadialGradient(X - rr * .3, Y - rr * .3, 0, X, Y, rr);
        gg2.addColorStop(0, "#71757b"); gg2.addColorStop(1, "#1f2124"); p.fillStyle = gg2; p.beginPath(); p.arc(X, Y, rr, 0, TAU); p.fill();
        p.strokeStyle = "rgba(0,0,0,0.8)"; p.lineWidth = 1.4 * u; var ang = 0.4 + i * 0.9;
        p.beginPath(); p.moveTo(X - Math.cos(ang) * rr * .7, Y - Math.sin(ang) * rr * .7); p.lineTo(X + Math.cos(ang) * rr * .7, Y + Math.sin(ang) * rr * .7); p.stroke();
      });
      function engrave(txt, x, y, size, ls) {
        p.font = "700 " + size.toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; p.textAlign = "center"; p.textBaseline = "middle";
        var s = txt.split("").join(ls);
        p.fillStyle = "rgba(0,0,0,0.75)"; p.fillText(s, x, y - 1); p.fillStyle = "rgba(255,255,255,0.12)"; p.fillText(s, x, y + 1);
        p.fillStyle = "#80868e"; p.fillText(s, x, y);
      }
      engrave(ASSIST_LABEL() + " · STUDIO MONITOR", W / 2, S.my * 0.5, 13 * u, " ");
      var ly = S.my + mh + 34 * u;
      engrave("MIC", S.mx[0] + mw / 2, ly, 17 * u, " "); engrave(ASSIST_LABEL(), S.mx[1] + mw / 2, ly, 17 * u, " ");
      engrave("THINKING", W / 2, ly + 18 * u, 8.5 * u, " ");
      S.ly = ly; S.panel = pn;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, fu = S.fu, scene = r.scene(), g = scene.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.panel, 0, 0);
      var tgt = [f.state === "listening" ? f.voice : 0, f.state === "responding" ? f.voice : 0];
      for (var i = 0; i < 2; i++) {
        var m = S.m[i], target = clamp(tgt[i] * 0.95, 0, 1.06), h = f.dt / 4;
        for (var k = 0; k < 4; k++) { m.vel += (357 * (target - m.pos) - 30.6 * m.vel) * h; m.pos += m.vel * h; }
        if (m.pos < 0) { m.pos = 0; if (m.vel < 0) m.vel = 0; }
        if (m.pos > 1.07) { m.pos = 1.07; m.vel = -m.vel * 0.25; }
        if (m.pos > 0.73) m.peakT = f.t;
        m.lamp = follow(m.lamp, 0.55 + 0.45 * Math.min(1, m.pos), .2, .08, f.dt);
        var X = S.mx[i], Y = S.my;
        g.drawImage(S.face, X, Y);
        g.save(); roundRect(g, X + S.fx, Y + S.fy, S.fw, S.fh, 8 * fu); g.clip();
        g.globalCompositeOperation = "lighter";
        var lg = g.createRadialGradient(X + S.px, Y + S.fy + S.fh * 1.05, 0, X + S.px, Y + S.fy + S.fh * 1.05, S.fw * 0.8);
        lg.addColorStop(0, "rgba(255,186,90," + (0.10 + 0.20 * m.lamp).toFixed(3) + ")"); lg.addColorStop(1, "rgba(255,186,90,0)");
        g.fillStyle = lg; g.fillRect(X + S.fx, Y + S.fy, S.fw, S.fh);
        g.globalCompositeOperation = "source-over";
        var t = S.th(m.pos), c = Math.cos(t), s = Math.sin(t), nx = -s, ny = c, cx = X + S.px, cy = Y + S.py;
        var r0 = S.Rs * 0.25, r1 = S.Rs * 1.02, w0 = 1.3 * fu, w1 = 0.45 * fu;
        function needle(ox, oy) {
          g.beginPath();
          g.moveTo(cx + c * r0 + nx * w0 + ox, cy + s * r0 + ny * w0 + oy); g.lineTo(cx + c * r1 + nx * w1 + ox, cy + s * r1 + ny * w1 + oy);
          g.lineTo(cx + c * r1 - nx * w1 + ox, cy + s * r1 - ny * w1 + oy); g.lineTo(cx + c * r0 - nx * w0 + ox, cy + s * r0 - ny * w0 + oy); g.closePath(); g.fill();
        }
        g.filter = "blur(" + (1.6 * fu).toFixed(1) + "px)"; g.fillStyle = "rgba(0,0,0,0.24)"; needle(2.6 * fu, 3.6 * fu); g.filter = "none";
        g.fillStyle = "#121212"; needle(0, 0);
        g.restore();
        g.drawImage(S.cover, X, Y);
        var on = f.t - m.peakT < 0.18, lx = X + S.fx + S.fw - 22 * fu, lyy = Y + S.fy + 22 * fu, lr = 5 * fu;
        var led = g.createRadialGradient(lx - lr * .3, lyy - lr * .3, 0, lx, lyy, lr);
        if (on) { led.addColorStop(0, "#fff"); led.addColorStop(0.35, "#ff4a4a"); led.addColorStop(1, "#a00000"); }
        else { led.addColorStop(0, "#6a2a2a"); led.addColorStop(1, "#2a0909"); }
        g.fillStyle = led; g.beginPath(); g.arc(lx, lyy, lr, 0, TAU); g.fill();
        if (on) { g.globalCompositeOperation = "lighter"; var hg = g.createRadialGradient(lx, lyy, 0, lx, lyy, lr * 4);
          hg.addColorStop(0, "rgba(255,60,60,0.6)"); hg.addColorStop(1, "rgba(255,60,60,0)"); g.fillStyle = hg; g.fillRect(lx - lr * 4, lyy - lr * 4, lr * 8, lr * 8); g.globalCompositeOperation = "source-over"; }
        g.drawImage(S.glass, X, Y);
      }
      var thinking = f.state === "processing", bl = thinking ? 0.5 + 0.5 * Math.sin(f.t * TAU * 1.6) : 0;
      var tx = W / 2, ty = S.ly - 4 * u, tr = 5.5 * u, tg = g.createRadialGradient(tx, ty, 0, tx, ty, tr);
      tg.addColorStop(0, bl > 0.05 ? "rgba(255,245,210,1)" : "#4a3b16"); tg.addColorStop(1, bl > 0.05 ? "rgba(255,160,30," + (0.5 + bl * 0.5).toFixed(2) + ")" : "#1e1606");
      g.fillStyle = tg; g.beginPath(); g.arc(tx, ty, tr, 0, TAU); g.fill();
      if (bl > 0.05) { g.globalCompositeOperation = "lighter"; var bg2 = g.createRadialGradient(tx, ty, 0, tx, ty, tr * 5);
        bg2.addColorStop(0, "rgba(255,170,40," + (0.45 * bl).toFixed(2) + ")"); bg2.addColorStop(1, "rgba(255,170,40,0)"); g.fillStyle = bg2; g.fillRect(tx - tr * 5, ty - tr * 5, tr * 10, tr * 10); g.globalCompositeOperation = "source-over"; }
      r.present(scene, 0.1, 0.014, 1);
    }
  });
