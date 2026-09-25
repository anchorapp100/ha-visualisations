  /* ---------- Synthwave — an 80s neon sunset: the striped sun pulses with the voice, the mountains ARE its spectrum,
     and the perspective grid rushes toward you faster as someone speaks; each syllable sends a bright wave down the grid. ---------- */
  register({
    id: "synthwave", name: "Synthwave", layout: "top", text: "default",
    blurb: "An 80s neon sunset — the striped sun pulses with the voice, the mountains are its spectrum, and the grid rushes at you.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, u = r.u, R = rng(88), i;
      S.hz = H * 0.6; S.scroll = 0; S.mix = 0; S.gold = 0; S.waves = []; S.P = 72;
      S.front = new Float32Array(S.P); S.back = new Float32Array(S.P);
      S.base = new Float32Array(S.P);
      for (i = 0; i < S.P; i++) { var xn = i / (S.P - 1); S.base[i] = 0.25 + 0.5 * noise1(xn * 7 + 3) + 0.25 * noise1(xn * 19 + 1); }
      var bg = mkCanvas(W, H), g = bg.getContext("2d"), sky = g.createLinearGradient(0, 0, 0, S.hz);
      sky.addColorStop(0, "#060217"); sky.addColorStop(0.5, "#1a0736"); sky.addColorStop(0.82, "#46104e"); sky.addColorStop(1, "#8c1f5c");
      g.fillStyle = sky; g.fillRect(0, 0, W, S.hz);
      for (i = 0; i < 190; i++) { var b = 0.2 + R() * R() * 0.8, s = (0.5 + R() * 1.1) * u; g.fillStyle = "rgba(255,230,255," + b.toFixed(3) + ")"; g.fillRect(R() * W, Math.pow(R(), 1.6) * S.hz * 0.7, s, s); }
      var fl = g.createLinearGradient(0, S.hz, 0, H); fl.addColorStop(0, "#1a0530"); fl.addColorStop(1, "#050109");
      g.fillStyle = fl; g.fillRect(0, S.hz, W, H - S.hz);
      S.bg = bg;
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, t = f.t, dt = f.dt, st = f.state, lv = f.level, i, k;
      var talk = st === "listening" || st === "responding", proc = st === "processing", hz = S.hz;
      S.mix = follow(S.mix, st === "responding" ? 1 : st === "listening" ? 0 : S.mix, 0.08, 0.08, dt);
      S.gold = follow(S.gold, proc ? 1 : 0, 0.08, 0.05, dt);
      var neon = mixc(mixc([60, 235, 255], [255, 60, 200], S.mix), [255, 190, 60], S.gold);
      var neon2 = mixc(mixc([255, 60, 200], [80, 220, 255], S.mix), [255, 120, 60], S.gold);
      S.scroll += dt * (0.9 + 3.6 * lv + (proc ? 1.2 : 0));
      if (f.onset && talk && S.waves.length < 6) S.waves.push({ z: 14, a: 0.5 + 0.5 * f.voice });
      // mountains: the spectrum mirrored from the middle, low notes nearest the sun
      for (i = 0; i < S.P; i++) {
        var xn = i / (S.P - 1), d = Math.abs(xn - 0.5) * 2, bi = d * 26, b0 = bi | 0, bv = f.bands[b0] + (f.bands[Math.min(31, b0 + 1)] - f.bands[b0]) * (bi - b0);
        var gapC = smoothstep(0.1, 0.34, d), tgt = (S.base[i] * 0.35 + (talk ? bv * (0.6 + 0.8 * lv) : proc ? 0.25 + 0.2 * Math.sin(t * 3 + d * 9) : 0.08)) * gapC;
        S.front[i] = follow(S.front[i], tgt, 0.45, 0.12, dt);
        S.back[i] = follow(S.back[i], S.base[i] * 0.55 * gapC + tgt * 0.35, 0.05, 0.03, dt);
      }
      var sc = r.scene(), g = sc.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.drawImage(S.bg, 0, 0);
      // the sun: gradient disc with widening cut stripes, pulsing with the low bands
      var bass = (f.bands[1] + f.bands[3] + f.bands[5]) / 3, Rs = H * (0.155 + 0.012 * f.slow + (talk ? 0.012 * lv : 0)), cx = W / 2, cy = hz - H * 0.075;
      var ssz = Math.ceil(H * 0.37 + 6), sun = r.buf("swsun", ssz, ssz), q = sun.getContext("2d"), o = ssz / 2;   // fixed size: no realloc as it pulses
      q.globalCompositeOperation = "source-over"; q.clearRect(0, 0, sun.width, sun.height);
      var sg = q.createLinearGradient(0, o - Rs, 0, o + Rs);
      sg.addColorStop(0, "#fff27a"); sg.addColorStop(0.45, "#ffb03a"); sg.addColorStop(0.75, "#ff4f7a"); sg.addColorStop(1, "#d61e8f");
      q.fillStyle = sg; q.beginPath(); q.arc(o, o, Rs, 0, TAU); q.fill();
      q.globalCompositeOperation = "destination-out";
      for (k = 0; k < 7; k++) {
        var sy = o + Rs * (0.02 + k * 0.155), th = Rs * (0.018 + 0.028 * k / 6) * (0.8 + 1.4 * (talk ? bass : 0.15) + (proc ? 0.3 * (0.5 + 0.5 * Math.sin(t * 5 - k)) : 0));
        q.fillRect(0, sy, sun.width, th);
      }
      q.globalCompositeOperation = "source-over";
      g.save(); g.beginPath(); g.rect(0, 0, W, hz); g.clip();
      g.globalCompositeOperation = "lighter";
      var glow = g.createRadialGradient(cx, cy, Rs * 0.6, cx, cy, Rs * 2.4);
      glow.addColorStop(0, "rgba(255,90,160," + (0.22 + 0.25 * lv).toFixed(3) + ")"); glow.addColorStop(1, "rgba(255,90,160,0)");
      g.fillStyle = glow; g.fillRect(cx - Rs * 2.4, cy - Rs * 2.4, Rs * 4.8, Rs * 4.8);
      g.globalCompositeOperation = "source-over";
      g.drawImage(sun, cx - o, cy - o);
      g.restore();
      // mountains (back ridge, then the live front ridge)
      function ridge(arr, hmax, fill, edge, lw) {
        g.beginPath(); g.moveTo(0, hz);
        for (var j = 0; j < S.P; j++) g.lineTo(j / (S.P - 1) * W, hz - arr[j] * hmax);
        g.lineTo(W, hz); g.closePath(); g.fillStyle = fill; g.fill();
        g.beginPath(); for (j = 0; j < S.P; j++) { var px = j / (S.P - 1) * W, py = hz - arr[j] * hmax; if (j) g.lineTo(px, py); else g.moveTo(px, py); }
        g.lineWidth = lw; g.strokeStyle = edge; g.stroke();
      }
      ridge(S.back, H * 0.2, "#12042a", rgba(neon2, 0.55), 1.2 * u);
      var mf = g.createLinearGradient(0, hz - H * 0.18, 0, hz); mf.addColorStop(0, "#1d0636"); mf.addColorStop(1, "#0b0218");
      ridge(S.front, H * 0.16, mf, rgba(neon, 0.95), 1.8 * u);
      // the horizon line
      g.globalCompositeOperation = "lighter";
      g.fillStyle = rgba(mixc(neon, [255, 255, 255], 0.4), 0.9); g.fillRect(0, hz - 0.8 * u, W, 1.6 * u);
      // the perspective grid
      var camH = H - hz, spacing = 1, zmax = 16, offset = S.scroll % spacing;
      g.lineWidth = 1.4 * u; g.strokeStyle = rgba(neon, 0.8);
      g.beginPath();
      for (var z = spacing - offset; z < zmax; z += spacing) {
        var zz = Math.max(0.05, z * 0.55), y = hz + camH * (1 / zz) * 0.55;
        if (y > H + 2 || y < hz) continue;
        g.moveTo(0, y); g.lineTo(W, y);
      }
      var nV = 26;
      for (k = -nV; k <= nV; k++) { var xb = cx + k * (W * 0.16); g.moveTo(cx + (xb - cx) * 0.02, hz); g.lineTo(cx + (xb - cx) * 2.2, H * 1.35); }
      g.stroke();
      // syllable waves rolling toward you
      for (i = S.waves.length - 1; i >= 0; i--) {
        var wv = S.waves[i]; wv.z -= dt * (5 + 6 * lv);
        if (wv.z < 0.9) { S.waves.splice(i, 1); continue; }
        var wy = hz + camH * (1 / Math.max(0.05, wv.z * 0.55)) * 0.55, wa = wv.a * Math.min(1, (14 - wv.z) / 3);
        var wg = g.createLinearGradient(0, wy - 10 * u, 0, wy + 10 * u);
        wg.addColorStop(0, rgba(neon2, 0)); wg.addColorStop(0.5, rgba(mixc(neon2, [255, 255, 255], 0.35), wa)); wg.addColorStop(1, rgba(neon2, 0));
        g.fillStyle = wg; g.fillRect(0, wy - 10 * u, W, 20 * u);
      }
      // fade the far grid into the haze
      g.globalCompositeOperation = "source-over";
      var haze = g.createLinearGradient(0, hz, 0, hz + (H - hz) * 0.35);
      haze.addColorStop(0, "rgba(26,5,48,0.9)"); haze.addColorStop(1, "rgba(26,5,48,0)");
      g.fillStyle = haze; g.fillRect(0, hz + 0.8 * u, W, (H - hz) * 0.35);
      r.present(sc, 0.55 + 0.45 * lv, 0.018, 2);
    }
  });
