  /* ---------- Pac-Man: a neon maze where you drive Pac-Man and the assistant's voice turns the ghosts blue ----------
     Your syllables make Pac-Man chomp and dash through the maze eating dots, and the dots light up across the maze with the
     spectrum of whoever is speaking. When the assistant answers, Pac-Man gets a power pellet: the ghosts turn blue, flash on
     its syllables and get eaten (200, 400, 800, 1600). While it thinks, the ghosts scatter to their corners.
     The maze is an original layout in the classic style (a corridor graph, mirrored), drawn once as double-line neon walls;
     the characters are drawn as vectors every frame. */
  var PAC_HI = 10000;
  register({
    id: "pac-man", name: "Pac-Man", layout: "left", text: "arcade", hiDpi: true,
    blurb: "A neon maze. Your syllables make Pac-Man chomp and dash; when the assistant answers, the ghosts turn blue and flash with its voice.",
    init: function (r) {
      var S = r.S, W = r.w, H = r.h, i, k;
      // ---- the maze: corridor rows [y, x1, x2] and columns [x, y1, y2] for the left half (x2 = 13.5 crosses the middle)
      var HR = [[1, 1, 12], [5, 1, 13.5], [8, 1, 6], [8, 9, 12], [11, 9, 13.5], [14, 0, 9], [17, 9, 13.5], [20, 1, 12], [23, 1, 3],
                [23, 6, 13.5], [26, 1, 6], [26, 9, 12], [29, 1, 13.5]];
      var VC = [[1, 1, 8], [1, 20, 23], [1, 26, 29], [3, 23, 26], [6, 1, 26], [9, 5, 8], [9, 11, 20], [9, 23, 26], [12, 1, 5],
                [12, 8, 11], [12, 20, 23], [12, 26, 29]];
      var Hs = [], Vs = [];
      HR.forEach(function (s) { if (s[2] === 13.5) Hs.push([s[0], s[1], 27 - s[1]]); else { Hs.push(s); Hs.push([s[0], 27 - s[2], 27 - s[1]]); } });
      VC.forEach(function (s) { Vs.push(s); Vs.push([27 - s[0], s[1], s[2]]); });
      var N = {}, nodes = [];
      function node(x, y) { var key = x + "," + y; if (!N[key]) { N[key] = { id: nodes.length, x: x, y: y, e: [] }; nodes.push(N[key]); } return N[key]; }
      Hs.forEach(function (s) { node(s[1], s[0]); node(s[2], s[0]); });
      Vs.forEach(function (s) { node(s[0], s[1]); node(s[0], s[2]); });
      Hs.forEach(function (h) { Vs.forEach(function (v) { if (v[0] >= h[1] && v[0] <= h[2] && h[0] >= v[1] && h[0] <= v[2]) node(v[0], h[0]); }); });
      var edges = [];
      function link(a, b, wrap) { var e = { a: a, b: b, len: wrap ? 3 : Math.abs(a.x - b.x) + Math.abs(a.y - b.y), wrap: !!wrap }; edges.push(e); a.e.push(e); b.e.push(e); }
      Hs.forEach(function (h) {
        var row = nodes.filter(function (n) { return n.y === h[0] && n.x >= h[1] && n.x <= h[2]; }).sort(function (a, b) { return a.x - b.x; });
        for (i = 1; i < row.length; i++) link(row[i - 1], row[i]);
      });
      Vs.forEach(function (v) {
        var col = nodes.filter(function (n) { return n.x === v[0] && n.y >= v[1] && n.y <= v[2]; }).sort(function (a, b) { return a.y - b.y; });
        for (i = 1; i < col.length; i++) link(col[i - 1], col[i]);
      });
      link(N["0,14"], N["27,14"], true);                                      // the tunnel
      S.N = N; S.edges = edges; S.R = rng(1980);
      // ---- geometry: the maze fills the right of the screen; the transcript takes the left
      var rx = W * 0.545, rw = W * 0.43, T = Math.min(rw / 28, H * 0.9 / 34);
      S.T = T; S.ox = rx + (rw - 28 * T) / 2; S.oy = (H - 34 * T) / 2 + 2.3 * T;
      function X(x) { return S.ox + (x + 0.5) * T; }
      function Y(y) { return S.oy + (y + 0.5) * T; }
      S.X = X; S.Y = Y;
      // ---- walls: stroke every corridor wide in blue, then narrower in black -> double-line walls with round corners
      function wallLayer(col) {
        var c = mkCanvas(W, H), g = c.getContext("2d"), p = new Path2D(), lw = Math.max(1.4, 0.13 * T), cw = 1.72 * T;
        g.fillStyle = "#000"; g.fillRect(0, 0, W, H);                         // opaque: this layer repaints the whole frame
        Hs.forEach(function (h) { var x1 = h[1] === 0 ? -1.6 : h[1], x2 = h[2] === 27 ? 28.6 : h[2]; p.moveTo(X(x1), Y(h[0])); p.lineTo(X(x2), Y(h[0])); });
        Vs.forEach(function (v) { p.moveTo(X(v[0]), Y(v[1])); p.lineTo(X(v[0]), Y(v[2])); });
        g.lineCap = "round"; g.lineJoin = "round";
        g.strokeStyle = col; g.lineWidth = lw;                                // the outer wall
        roundRect(g, X(-0.85), Y(-0.85), 28.7 * T, 31.7 * T, 0.9 * T); g.stroke();
        g.lineWidth = cw + 2 * lw; g.stroke(p);
        g.strokeStyle = "#000"; g.lineWidth = cw; g.stroke(p);
        g.fillStyle = "#000"; g.fillRect(X(-3), Y(14) - cw / 2, 3.2 * T, cw); g.fillRect(X(27.8), Y(14) - cw / 2, 3.2 * T, cw);   // tunnel mouths
        g.strokeStyle = col; g.lineWidth = lw;                                // the ghost house, with its door
        roundRect(g, X(10.1), Y(12.2), 6.8 * T, 3.6 * T, 0.35 * T); g.stroke();
        roundRect(g, X(10.1) + 2 * lw, Y(12.2) + 2 * lw, 6.8 * T - 4 * lw, 3.6 * T - 4 * lw, 0.25 * T); g.stroke();
        g.fillStyle = "#000"; g.fillRect(X(12.6), Y(12.2) - lw, 1.8 * T, 4 * lw);
        g.fillStyle = "#ffb8de"; g.fillRect(X(12.6), Y(12.2) + 0.2 * lw, 1.8 * T, 1.6 * lw);
        return c;
      }
      function glowOf(src) { var c = mkCanvas(W, H), g = c.getContext("2d"); g.filter = "blur(" + Math.max(1.5, 0.28 * T).toFixed(1) + "px)"; g.drawImage(src, 0, 0); g.filter = "none"; return c; }
      S.bg = wallLayer("#2d3cff"); S.bgFlash = wallLayer("#e8ecff");
      S.glow = glowOf(S.bg); S.glowFlash = glowOf(S.bgFlash);             // the neon glow is blurred once, not every frame
      // ---- dots (none around the ghost house or in the tunnel) and the four power pellets
      S.dots = []; S.dotAt = {};
      function dot(x, y) {
        var key = x + "," + y;
        if (S.dotAt[key] || x < 1 || x > 26 || (y >= 10 && y <= 18 && x !== 6 && x !== 21)) return;
        var d = { x: x, y: y, alive: true, big: (x === 1 || x === 26) && (y === 3 || y === 23) };
        S.dotAt[key] = d; S.dots.push(d);
      }
      Hs.forEach(function (h) { for (k = Math.ceil(h[1]); k <= h[2]; k++) dot(k, h[0]); });
      Vs.forEach(function (v) { for (k = v[1]; k <= v[2]; k++) dot(v[0], k); });
      S.left = S.dots.length; S.score = 0; S.popups = []; S.flashUntil = 0; S.flashDone = 0; S.dying = 0; S.readyUntil = 0; S.power = false;
      S.eatMul = 200; S.lastState = "";
      // ---- characters
      function onEdge(ax, ay, bx, by, d, fwd) {
        var A = N[ax + "," + ay], B = N[bx + "," + by];
        // d = distance from A; fwd = heading for B. An actor's d counts from the node it set out from.
        for (var j = 0; j < A.e.length; j++) { var e = A.e[j]; if ((e.a === A && e.b === B) || (e.b === A && e.a === B)) return { e: e, fwd: (e.a === A) === fwd, d: fwd ? d : e.len - d }; }
        return null;
      }
      S.onEdge = onEdge;
      S.reset = function () {
        var p = onEdge(12, 23, 15, 23, 1.5, true);
        S.pac = { e: p.e, fwd: true, d: p.d, x: 13.5, y: 23, dx: 1, dy: 0, chomp: 0, dash: 0 };
        var cols = [[255, 32, 32], [255, 184, 255], [40, 255, 255], [255, 184, 82]];
        S.ghosts = cols.map(function (c, j) {
          var gh = { col: c, i: j, mode: j === 0 ? "out" : "house", hx: [13.5, 11.5, 13.5, 15.5][j], hy: j === 0 ? 11 : 14, x: 0, y: 0, dx: -1, dy: 0,
                     release: [0, 1.5, 4, 6.5][j], flash: 0, fright: false, e: null, fwd: true, d: 0, bob: j * 1.3 };
          if (j === 0) { var q = onEdge(12, 11, 15, 11, 1.5, false); gh.e = q.e; gh.fwd = q.fwd; gh.d = q.d; }
          gh.x = gh.hx; gh.y = gh.hy;
          return gh;
        });
        S.born = -1;
      };
      S.reset();
    },
    draw: function (r, f) {
      var S = r.S, W = r.w, H = r.h, t = f.t, dt = f.dt, st = f.state, lv = f.level, T = S.T, X = S.X, Y = S.Y, R = S.R, i, k;
      var listen = st === "listening", reply = st === "responding", think = st === "processing";
      if (S.born < 0) { S.born = t; S.readyUntil = t + 1.2; }
      // ---- the assistant's turn = power mode
      if (reply && !S.power) { S.power = true; S.eatMul = 200; S.ghosts.forEach(function (g) { if (g.mode !== "eyes") { g.fright = true; if (g.mode === "out") { g.fwd = !g.fwd; g.d = g.e.len - g.d; } } }); }
      if (!reply && S.power) { S.power = false; S.ghosts.forEach(function (g) { g.fright = false; }); }
      if (f.onset && reply) S.ghosts.forEach(function (g) { if (g.fright) g.flash = 1; });
      var P = S.pac, frozen = t < S.readyUntil || S.dying || t < S.flashUntil;
      function pos(a) {                                                      // an actor's tile position along its edge
        var e = a.e, fr = a.d / e.len;
        if (e.wrap) {                                                        // off one edge of the maze and in at the other
          var left = a.fwd === (e.a.x === 0), x = left ? -a.d : 27 + a.d;
          if (x < -1.5) x += 30; if (x > 28.5) x -= 30;
          a.x = x; a.y = 14; a.dx = left ? -1 : 1; a.dy = 0; return;
        }
        var A = a.fwd ? e.a : e.b, B = a.fwd ? e.b : e.a;
        a.x = A.x + (B.x - A.x) * fr; a.y = A.y + (B.y - A.y) * fr; a.dx = Math.sign(B.x - A.x); a.dy = Math.sign(B.y - A.y);
      }
      function advance(a, dist, choose) {
        a.d += dist;
        while (a.d >= a.e.len) {
          var at = a.fwd ? a.e.b : a.e.a, left = a.d - a.e.len, from = a.e, opts = at.e.filter(function (e) { return e !== from; });
          if (!opts.length) opts = at.e;
          var ne = choose(at, opts, from);
          a.e = ne; a.fwd = ne.a === at; a.d = left;
        }
        pos(a);
      }
      function far(e, at) { return e.a === at ? e.b : e.a; }
      function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
      // ---- Pac-Man: dots ahead, keep away from hunting ghosts, chase blue ones
      if (!frozen) {
        P.dash = Math.max(0, P.dash - dt);
        if (listen && f.onset) { P.dash = 0.35; P.chomp += 0.6; }
        var spd = (listen ? 5.5 + 6 * lv : reply ? 7 + 3 * lv : think ? 4 : 5) * (P.dash > 0 ? 1.45 : 1);
        advance(P, spd * dt, function (at, opts) {
          var best = null, bs = -1e9;
          opts.forEach(function (e) {
            var to = far(e, at), sc = R() * 2, n = 0;
            if (!e.wrap) for (k = 0; k <= e.len; k++) { var dd = S.dotAt[Math.round(at.x + Math.sign(to.x - at.x) * k) + "," + Math.round(at.y + Math.sign(to.y - at.y) * k)]; if (dd && dd.alive) n++; }
            sc += n * 3;
            S.ghosts.forEach(function (g) {
              if (g.mode !== "out") return;
              var d = Math.sqrt(dist2(to.x, to.y, g.x, g.y));
              if (g.fright) sc += 40 / (1 + d); else if (d < 6) sc -= 90 / (1 + d);
            });
            if (sc > bs) { bs = sc; best = e; }
          });
          return best;
        });
        P.chomp += dt * spd * 1.6;
        var key = Math.round(P.x) + "," + Math.round(P.y), dt0 = S.dotAt[key];
        if (dt0 && dt0.alive && dist2(P.x, P.y, dt0.x, dt0.y) < 0.2) {
          dt0.alive = false; S.left--; S.score += dt0.big ? 50 : 10;
          if (!S.left) { S.flashUntil = t + 2.2; S.flashDone = t + 2.2; }
        }
      }
      if (S.flashDone && t >= S.flashDone) { S.flashDone = 0; S.dots.forEach(function (d) { d.alive = true; }); S.left = S.dots.length; S.reset(); S.readyUntil = t + 1.2; }
      // ---- ghosts: classic targeting (chase / scatter / frightened / eyes home)
      var corners = [[25, -3], [2, -3], [27, 32], [0, 32]];
      S.ghosts.forEach(function (g, j) {
        g.flash = Math.max(0, g.flash - dt * 3);
        if (frozen) return;
        if (g.mode === "house") {                                           // bob in the house, then leave through the door
          g.y = 14 + Math.sin((t + g.bob) * 5) * 0.35;
          if (t - S.born > g.release) g.mode = "leaving";
          return;
        }
        if (g.mode === "leaving") {
          var sp = 3 * dt;
          if (Math.abs(g.x - 13.5) > 0.05) g.x += Math.sign(13.5 - g.x) * Math.min(sp, Math.abs(13.5 - g.x));
          else if (g.y > 11) g.y = Math.max(11, g.y - sp);
          else { var q = S.onEdge(12, 11, 15, 11, 1.5, R() < 0.5); g.e = q.e; g.fwd = q.fwd; g.d = q.d; g.mode = "out"; g.fright = S.power; }
          g.dx = 0; g.dy = -1;
          return;
        }
        var speed = g.mode === "eyes" ? 11 : g.fright ? 3.4 : think ? 4.6 : 5.2 + (listen ? 1.2 * lv : 0);
        var tx, ty;
        if (g.mode === "eyes") { tx = 13.5; ty = 11; }
        else if (think || st === "idle") { tx = corners[j][0]; ty = corners[j][1]; }
        else if (j === 0) { tx = P.x; ty = P.y; }
        else if (j === 1) { tx = P.x + 4 * P.dx; ty = P.y + 4 * P.dy; }
        else if (j === 2) { tx = 2 * (P.x + 2 * P.dx) - S.ghosts[0].x; ty = 2 * (P.y + 2 * P.dy) - S.ghosts[0].y; }
        else { if (dist2(g.x, g.y, P.x, P.y) > 64) { tx = P.x; ty = P.y; } else { tx = corners[3][0]; ty = corners[3][1]; } }
        advance(g, speed * dt, function (at, opts) {
          if (g.fright && g.mode === "out") return opts[(R() * opts.length) | 0];
          var best = opts[0], bd = 1e9;
          opts.forEach(function (e) { var to = far(e, at), d = e.wrap ? 1e6 : dist2(to.x, to.y, tx, ty); if (d < bd) { bd = d; best = e; } });
          return best;
        });
        if (g.mode === "eyes" && Math.abs(g.y - 11) < 0.3 && Math.abs(g.x - 13.5) < 0.6) { g.mode = "leaving"; g.x = 13.5; g.y = 12.5; g.fright = false; }
      });
      // ---- meetings: eat a blue ghost, or lose a life to a hunting one
      if (!frozen) S.ghosts.forEach(function (g) {
        if (g.mode !== "out" || dist2(g.x, g.y, P.x, P.y) > 0.6) return;
        if (g.fright) {
          g.mode = "eyes"; g.fright = false; S.score += S.eatMul;
          S.popups.push({ x: g.x, y: g.y, txt: String(S.eatMul), t: t }); S.eatMul = Math.min(1600, S.eatMul * 2);
        } else if (!S.dying) S.dying = t;
      });
      if (S.dying && t - S.dying > 1.95) { S.dying = 0; S.reset(); S.readyUntil = t + 1.2; }
      PAC_HI = Math.max(PAC_HI, S.score);
      // ---- draw: walls, dots, characters, header
      var g0 = r.ctx, fl = t < S.flashUntil && Math.floor((S.flashUntil - t) * 4) % 2 === 0;
      g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1;
      g0.drawImage(fl ? S.bgFlash : S.bg, 0, 0);
      g0.globalCompositeOperation = "lighter"; g0.globalAlpha = clamp(0.55 + 0.6 * lv, 0, 1);   // the walls glow brighter with the voice
      g0.drawImage(fl ? S.glowFlash : S.glow, 0, 0);
      g0.globalCompositeOperation = "source-over"; g0.globalAlpha = 1;
      var sc = r.buf("pacdyn", W, H), q = sc.getContext("2d");               // dots + characters, bloomed on their own
      q.globalCompositeOperation = "source-over"; q.globalAlpha = 1; q.clearRect(0, 0, W, H);
      var bands = f.bands, amp = 0.35 + 0.65 * lv, lvlPaths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()], ds = 0.24 * T;
      var pelOn = Math.floor(t * 5) % 2 === 0 || reply;
      for (i = 0; i < S.dots.length; i++) {
        var d = S.dots[i];
        if (!d.alive) continue;
        var bv = clamp((bands[Math.min(31, (d.x / 27 * 31) | 0)] - 0.3) / 0.7, 0, 1) * amp, li = Math.min(4, (bv * 5) | 0);
        if (d.big) {
          if (!pelOn) continue;
          var pr = T * (0.42 + 0.25 * lv + (reply ? 0.12 * Math.sin(t * 12) : 0));
          q.fillStyle = "#ffcfc0"; q.beginPath(); q.arc(X(d.x), Y(d.y), pr, 0, TAU); q.fill();
          continue;
        }
        var s2 = ds * (1 + 0.5 * bv);
        lvlPaths[li].rect(X(d.x) - s2 / 2, Y(d.y) - s2 / 2, s2, s2);
      }
      for (k = 0; k < 5; k++) { q.fillStyle = rgba(mixc([255, 184, 174], [255, 255, 255], k / 5), 0.62 + k * 0.095); q.fill(lvlPaths[k]); }
      // clip characters to the maze so the tunnel hides them
      q.save(); q.beginPath(); q.rect(X(-0.5), Y(-1), 28 * T, 33 * T); q.clip();
      S.ghosts.forEach(function (g) { if (!(S.dying && t - S.dying > 0.5)) drawGhost(q, X(g.x), Y(g.y), 0.82 * T, g, t); });
      if (S.dying) drawPacDeath(q, X(P.x), Y(P.y), 0.8 * T, (t - S.dying) / 1.5);
      else {
        var mouth = 0.04 + 0.62 * Math.abs(Math.sin(P.chomp * 2.2)), ang = Math.atan2(P.dy, P.dx);
        if (frozen && t < S.readyUntil) mouth = 0.5;
        q.fillStyle = "#ffff2a"; q.beginPath(); q.moveTo(X(P.x), Y(P.y)); q.arc(X(P.x), Y(P.y), 0.8 * T * (1 + 0.06 * (P.dash > 0)), ang + mouth, ang + TAU - mouth); q.closePath(); q.fill();
      }
      q.restore();
      g0.drawImage(sc, 0, 0);
      r.bloom(sc, 0.45 + 0.45 * lv, 0.007, 2);
      // text and lives go on after the glow so they stay crisp: popups, READY!, the header
      var px = T * 0.12;
      S.popups = S.popups.filter(function (p) { return t - p.t < 1.1; });
      S.popups.forEach(function (p) { pixText(g0, p.txt, X(p.x), Y(p.y) - 3.5 * px, px, "#39e6ff", "center"); });
      if (t < S.readyUntil) pixText(g0, "READY!", X(13.5), Y(17) - 3.5 * px, px, "#ffff2a", "center");
      if (Math.floor(t * 3) % 2 === 0) pixText(g0, "1UP", X(3.5), Y(-2.6), px, "#fff", "center");
      pixText(g0, String(S.score).padStart(2, "0"), X(5.5), Y(-1.6), px, "#fff", "right");
      pixText(g0, "HIGH SCORE", X(13.5), Y(-2.6), px, "#fff", "center");
      pixText(g0, String(PAC_HI), X(15.5), Y(-1.6), px, "#fff", "right");
      for (k = 0; k < 2; k++) { var lx = X(1.5 + k * 2), ly = Y(31.1); g0.fillStyle = "#ffff2a"; g0.beginPath(); g0.moveTo(lx, ly); g0.arc(lx, ly, 0.62 * T, Math.PI + 0.6, Math.PI + TAU - 0.6); g0.closePath(); g0.fill(); }
      scanlines(r, 0.1);

      function drawGhost(q, x, y, s, g, t) {
        var eyes = g.mode === "eyes", blue = g.fright, wht = blue && g.flash > 0.5;
        if (!eyes) {
          q.fillStyle = blue ? (wht ? "#e9e9ff" : "#2424ff") : rgba(g.col, 1);
          q.beginPath(); q.arc(x, y - 0.12 * s, 0.9 * s, Math.PI, 0);
          var base = y + 0.82 * s, n = 4, w = 1.8 * s / n, ph = Math.floor(t * 8 + g.i) % 2 ? 0.5 : 0;
          q.lineTo(x + 0.9 * s, base);
          for (var j = 0; j < n; j++) {
            var xr = x + 0.9 * s - j * w;
            q.lineTo(xr - (0.5 + ph * 0.5) * w * 0.5, base - 0.3 * s * (ph ? 1 : 0.6));
            q.lineTo(xr - w, base);
          }
          q.closePath(); q.fill();
        }
        if (blue && !eyes) {                                               // frightened face
          q.fillStyle = wht ? "#ff2020" : "#ffc8b8";
          q.fillRect(x - 0.38 * s, y - 0.28 * s, 0.2 * s, 0.2 * s); q.fillRect(x + 0.18 * s, y - 0.28 * s, 0.2 * s, 0.2 * s);
          q.beginPath(); for (var m = 0; m <= 6; m++) { var mx = x - 0.6 * s + m * 0.2 * s, my = y + 0.3 * s + (m % 2 ? -0.1 : 0.1) * s; if (m) q.lineTo(mx, my); else q.moveTo(mx, my); }
          q.strokeStyle = q.fillStyle; q.lineWidth = Math.max(1, 0.1 * s); q.stroke();
          return;
        }
        var ex = g.dx * 0.12 * s, ey = g.dy * 0.14 * s;
        for (var ei = -1; ei <= 1; ei += 2) {
          q.fillStyle = "#fff"; q.beginPath(); q.ellipse(x + ei * 0.34 * s + ex * 0.5, y - 0.2 * s + ey * 0.5, 0.24 * s, 0.3 * s, 0, 0, TAU); q.fill();
          q.fillStyle = "#1f38ff"; q.beginPath(); q.arc(x + ei * 0.34 * s + ex * 1.4, y - 0.2 * s + ey * 1.4, 0.13 * s, 0, TAU); q.fill();
        }
      }
      function drawPacDeath(q, x, y, rad, p) {
        if (p < 1) { var m = 0.3 + (Math.PI - 0.3) * p, a = -Math.PI / 2; q.fillStyle = "#ffff2a"; q.beginPath(); q.moveTo(x, y); q.arc(x, y, rad, a + m, a + TAU - m); q.closePath(); q.fill(); }
        else if (p < 1.25) {
          q.strokeStyle = "#ffff2a"; q.lineWidth = Math.max(1, rad * 0.14); q.beginPath();
          for (var j = 0; j < 8; j++) { var an = j * TAU / 8, r0 = rad * 0.3, r1 = rad * (0.6 + (p - 1) * 2); q.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); q.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); }
          q.stroke();
        }
      }
    }
  });
