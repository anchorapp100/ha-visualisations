  /* ---------- Pulsar — the "Unknown Pleasures" plot, live: a new ridge of your voice rolls in every 55 ms ----------
     Lines are drawn back-to-front; each fills black beneath its own curve (hidden-line removal), then strokes. */
  register({
    id: "pulsar", name: "Pulsar", layout: "bottom", text: "default", hiDpi: true,
    blurb: "The famous pulsar plot, alive — a fresh ridge of your voice rolls in every 55 milliseconds.",
    init: function (r) {
      var S = r.S, i, k; S.N = 54; S.P = 80; S.lines = []; S.seed = []; S.acc = 0; S.iv = 0.055; S.R = rng(3); S.n = 0;
      for (i = 0; i < S.N; i++) { S.lines.push(new Float32Array(S.P)); S.seed.push(i * 7.13); }
      S.live = new Float32Array(S.P);
      for (i = 0; i < S.N; i++) this.fill(S, S.lines[i], null, i * 7.13, 0, 0, i * 0.055);
    },
    fill: function (S, arr, f, seed, voice, lv, t) {
      for (var k = 0; k < S.P; k++) {
        var xn = k / (S.P - 1), w = Math.exp(-Math.pow((xn - 0.5) / 0.2, 4)), bi = clamp((xn - 0.24) / 0.52, 0, 1) * 26;
        var b0 = bi | 0, bf = bi - b0, bv = f ? f.bands[b0] * (1 - bf) + f.bands[Math.min(31, b0 + 1)] * bf : 0;
        var tex = noise2(k * 0.55, seed) - 0.5, hill = noise2(k * 0.13 + 3, seed * 0.37);
        arr[k] = Math.max(0, w * (0.12 + 0.22 * hill + 0.08 * tex + (bv * 1.25 + 0.22 * tex * voice) * (0.25 + 1.05 * lv)) + 0.018 * tex + 0.01);
      }
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, u = r.u, dt = f.dt, st = f.state, lv = f.level, i, k;
      S.acc += dt;
      var talk = st === "listening" || st === "responding", proc = st === "processing";
      var vl = talk ? f.voice : proc ? 0.18 + 0.12 * Math.sin(f.t * 6) : 0.02, ll = talk ? lv : proc ? 0.35 : 0.05;
      while (S.acc >= S.iv) {
        S.acc -= S.iv; S.n++;
        var old = S.lines.shift(); this.fill(S, old, talk ? f : null, S.n * 7.13, vl, ll, f.t); S.lines.push(old);
      }
      this.fill(S, S.live, talk ? f : null, (S.n + 1) * 7.13, vl, ll, f.t);
      var fr = S.acc / S.iv, sc = r.scene(), g = sc.getContext("2d");
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      var pw = Math.min(W * 0.5, H * 0.95), x0 = (W - pw) / 2, top = H * 0.13, gap = (H * 0.6) / S.N, A = gap * 7.5 * (proc ? 0.8 : 1);
      var tint = st === "responding" ? [255, 150, 200] : st === "listening" ? [140, 220, 255] : proc ? [255, 205, 130] : [235, 235, 235];
      g.lineJoin = "round"; g.lineWidth = Math.max(1, 1.25 * u);
      for (i = 0; i <= S.N; i++) {
        var arr = i < S.N ? S.lines[i] : S.live, y = top + (i + 1 - fr) * gap, alpha = 1;
        if (i === 0) alpha = 1 - fr;
        if (i === S.N) alpha = Math.min(1, fr * 3 + 0.25);
        g.beginPath(); g.moveTo(x0, y);
        for (k = 0; k < S.P; k++) g.lineTo(x0 + k / (S.P - 1) * pw, y - arr[k] * A);
        g.lineTo(x0 + pw, y);
        g.fillStyle = "#000"; g.globalAlpha = 1; g.fill();
        var near = i / S.N, c = mixc([236, 236, 236], tint, Math.pow(near, 5));
        g.strokeStyle = rgba(c, alpha * (0.8 + 0.2 * near)); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = "rgba(200,200,200,0.34)"; g.font = "600 " + (10 * u).toFixed(1) + "px 'Helvetica Neue',Helvetica,Arial,sans-serif"; g.textAlign = "right"; g.textBaseline = "top";
      g.fillText("PSR B1919+21  ·  " + ASSIST_LABEL(), x0 + pw, top - 34 * u + gap);
      r.present(sc, 0.22 + 0.25 * lv, 0.012, 2);
    }
  });
