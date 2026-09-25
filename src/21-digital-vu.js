  /* ---------- Digital VU — an LED spectrum analyser: 32 segmented columns, red peak-hold caps, mirrored in a black floor ----------
     LED-meter ballistics: near-instant attack, linear release; peaks hold 0.6 s then fall slowly. Highs get a tilt so every
     column moves with speech (voice energy sits low). */
  register({
    id: "digital-vu", name: "Digital VU", layout: "bottom", text: "default", hiDpi: true,
    blurb: "A glowing LED spectrum analyser — 32 segmented columns with falling red peak caps, mirrored in a black glass floor.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, k;
      S.N = 32; S.SEG = 22;
      S.h = new Float32Array(S.N); S.pk = new Float32Array(S.N); S.pkT = new Float32Array(S.N);
      var areaW = Math.min(W * 0.86, H * 1.95);
      S.x0 = (W - areaW) / 2; S.colW = areaW / S.N;
      S.top = H * 0.1; S.base = H * 0.58; S.segH = (S.base - S.top) / S.SEG;
      function colAt(p) {                                   // bottom -> top: green, lime, yellow, orange, red
        var stops = [[0, [34, 190, 40]], [0.45, [120, 222, 30]], [0.62, [250, 226, 30]], [0.8, [255, 150, 22]], [0.9, [255, 72, 20]], [1, [255, 30, 20]]];
        for (var i = 1; i < stops.length; i++) if (p <= stops[i][0]) return mixc(stops[i - 1][1], stops[i][1], (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
        return stops[stops.length - 1][1];
      }
      S.lit = []; S.dark = [];
      for (k = 0; k < S.SEG; k++) { var c = colAt(k / (S.SEG - 1)); S.lit.push(rgba(c, 1)); S.dark.push(rgba(mixc([0, 0, 0], c, 0.15), 1)); }
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, dt = f.dt, t = f.t, st = f.state, i, k;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      for (i = 0; i < S.N; i++) {
        var target;
        if (talk) {                                         // bands are a 55 dB scale: show the top ~40 dB so speech sits mid-meter
          var bi = i / (S.N - 1) * 30, b0 = bi | 0, bv = f.bands[b0] * (1 - (bi - b0)) + f.bands[Math.min(31, b0 + 1)] * (bi - b0);
          target = clamp((bv - 0.28) / 0.72 * (0.9 + 0.35 * i / (S.N - 1)) * (0.55 + 0.55 * f.level), 0, 1);
        } else if (proc) target = 0.1 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(t * 3.4 - i * 0.33), 3);   // a scanner sweep while it thinks
        else target = 0.03 + 0.06 * noise1(i * 0.9 + t * 1.4);
        if (target > S.h[i]) S.h[i] += (target - S.h[i]) * (1 - Math.pow(0.2, dt * 30));
        else S.h[i] = Math.max(target, S.h[i] - dt * 1.3);
        if (S.h[i] >= S.pk[i]) { S.pk[i] = S.h[i]; S.pkT[i] = t; }
        else if (t - S.pkT[i] > 0.6) S.pk[i] = Math.max(S.h[i], S.pk[i] - dt * 0.5);
      }
      var bb = r.buf("dvbars", W, H), g = bb.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, W, H);
      var gap = S.colW * 0.2, cw = S.colW - gap, sg = Math.max(1, S.segH * 0.26), shh = S.segH - sg;
      var caps = new Path2D(), n = [], pki = [];
      for (i = 0; i < S.N; i++) { n.push(Math.round(S.h[i] * S.SEG)); pki.push(Math.min(S.SEG - 1, Math.max(0, Math.ceil(S.pk[i] * S.SEG) - 1))); }
      for (k = 0; k < S.SEG; k++) {
        var on = new Path2D(), off = new Path2D(), y = S.base - (k + 1) * S.segH + sg / 2;
        for (i = 0; i < S.N; i++) {
          var x = S.x0 + i * S.colW + gap / 2;
          if (k < n[i]) on.rect(x, y, cw, shh);
          else if (k === pki[i] && S.pk[i] > 0.05) caps.rect(x, y, cw, shh);
          else off.rect(x, y, cw, shh);
        }
        g.fillStyle = S.dark[k]; g.fill(off);
        g.fillStyle = S.lit[k]; g.fill(on);
      }
      g.fillStyle = "#ff2618"; g.fill(caps);
      var sc = r.scene(), s = sc.getContext("2d"), gapY = Math.max(4 * u, S.segH * 0.9), fl = S.base + gapY / 2;
      s.globalCompositeOperation = "source-over"; s.globalAlpha = 1; s.fillStyle = "#000"; s.fillRect(0, 0, W, H);
      // the black-glass floor: a clear mirror image just under the meter that dies away quickly
      s.save(); s.translate(0, 2 * S.base + gapY); s.scale(1, -1); s.globalAlpha = 0.5; s.drawImage(bb, 0, 0); s.restore();
      var fade = s.createLinearGradient(0, fl, 0, fl + (S.base - S.top) * 0.55);
      fade.addColorStop(0, "rgba(0,0,0,0.3)"); fade.addColorStop(1, "rgba(0,0,0,1)");
      s.fillStyle = fade; s.fillRect(0, fl, W, H - fl);
      var edge = s.createLinearGradient(S.x0, 0, S.x0 + S.colW * S.N, 0);  // the glass edge catching the light
      edge.addColorStop(0, "rgba(160,255,170,0)"); edge.addColorStop(0.5, "rgba(160,255,170,0.16)"); edge.addColorStop(1, "rgba(160,255,170,0)");
      s.fillStyle = edge; s.fillRect(S.x0, fl - 0.5 * u, S.colW * S.N, Math.max(1, u));
      s.drawImage(bb, 0, 0);
      r.present(sc, 0.32 + 0.3 * f.level, 0.012, 2);
    }
  });
