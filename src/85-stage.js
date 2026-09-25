  /* ---------------- Stage: canvas + transcript, laid out per skin (used by the overlay and the gallery) ---------------- */
  var VV_STYLE = [
    ".vv-stage{position:relative;overflow:hidden;background:#000;font-family:'Google Sans',Roboto,Noto,-apple-system,'Segoe UI',sans-serif;}",
    ".vv-overlay{position:fixed;inset:0;z-index:2147483000;opacity:0;visibility:hidden;transition:opacity .5s ease,visibility .5s ease;pointer-events:none;}",
    ".vv-overlay.show{opacity:1;visibility:visible;}",
    ".vv-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}",
    ".vv-content{position:absolute;display:flex;flex-direction:column;box-sizing:border-box;gap:1.6vmin;pointer-events:none;}",
    ".vv-thumb .vv-content{display:none;}",
    // layouts
    ".vv-l-full .vv-content{inset:0;justify-content:center;padding:0 8%;}",
    ".vv-l-left .vv-content{top:0;bottom:0;left:0;right:44%;justify-content:center;padding:0 3% 0 7%;}",
    ".vv-l-bottom .vv-content{left:7%;right:7%;bottom:5%;max-height:30%;justify-content:flex-end;align-items:center;text-align:center;}",
    ".vv-l-top .vv-content{left:7%;right:7%;top:5%;max-height:34%;justify-content:flex-start;align-items:center;text-align:center;}",
    // text
    ".vv-status{font-size:clamp(11px,1.1vw,15px);letter-spacing:.3em;text-transform:uppercase;min-height:1.2em;}",
    ".vv-user{font-size:clamp(20px,3.1vw,40px);line-height:1.25;text-wrap:balance;}",
    ".vv-assistant{font-size:clamp(24px,3.8vw,48px);line-height:1.3;text-wrap:pretty;max-height:52vh;overflow:hidden;}",
    ".vv-l-bottom .vv-user,.vv-l-top .vv-user{font-size:clamp(17px,2.2vw,30px);}",
    ".vv-l-bottom .vv-assistant,.vv-l-top .vv-assistant{font-size:clamp(19px,2.6vw,36px);max-height:17vh;}",
    ".vv-long .vv-assistant{font-size:clamp(17px,2.2vw,30px);}",
    ".vv-user:empty,.vv-assistant:empty{display:none;}",
    // themes
    ".vv-t-default .vv-status{color:rgba(230,236,255,.55);text-shadow:0 0 8px rgba(0,0,0,.9);}",
    ".vv-t-default .vv-user{color:rgba(230,236,255,.8);text-shadow:0 0 4px rgba(0,0,0,.95),0 0 14px rgba(0,0,0,.75),0 2px 4px rgba(0,0,0,.8);}",
    ".vv-t-default .vv-assistant{color:#e6ecff;text-shadow:0 0 4px rgba(0,0,0,.95),0 0 14px rgba(0,0,0,.85),0 2px 4px rgba(0,0,0,.9);}",
    ".vv-t-warm .vv-status{color:#ffb638;text-shadow:0 0 10px rgba(255,150,40,.45);}",
    ".vv-t-warm .vv-user{color:rgba(255,236,205,.78);text-shadow:0 0 4px rgba(0,0,0,.95),0 2px 6px rgba(0,0,0,.8);}",
    ".vv-t-warm .vv-assistant{color:#ffe7c2;text-shadow:0 0 12px rgba(255,160,50,.28),0 0 4px rgba(0,0,0,.95),0 2px 6px rgba(0,0,0,.85);}",
    ".vv-t-terminal .vv-content{font-family:'Cascadia Mono','Consolas','Courier New',monospace;}",
    ".vv-t-terminal .vv-status{color:#5dff9a;text-shadow:0 0 8px rgba(80,255,140,.6);}",
    ".vv-t-terminal .vv-status:not(:empty)::before{content:'> ';}",
    ".vv-t-terminal .vv-status:not(:empty)::after{content:'_';animation:vvBlink 1s steps(1) infinite;}",
    ".vv-t-terminal .vv-user{color:rgba(150,255,190,.72);text-shadow:0 0 6px rgba(80,255,140,.35);}",
    ".vv-t-terminal .vv-user::before{content:'you: ';opacity:.6;}",
    ".vv-t-terminal .vv-assistant{color:#aaffc8;text-shadow:0 0 8px rgba(80,255,140,.55),0 0 2px rgba(0,0,0,.9);}",
    ".vv-t-terminal.vv-l-bottom .vv-user{font-size:clamp(14px,1.7vw,24px);}",
    ".vv-t-terminal.vv-l-bottom .vv-assistant{font-size:clamp(16px,2vw,28px);}",
    // Mother (Alien): uppercase aqua phosphor inside the terminal, a typed "> " inquiry and a block cursor on the status
    ".vv-t-mother .vv-content{font-family:'Cascadia Mono','Consolas','Lucida Console','Courier New',monospace;text-transform:uppercase;letter-spacing:.04em;}",
    ".vv-t-mother .vv-status{color:#8cffd6;text-shadow:0 0 8px rgba(90,255,200,.6);}",
    ".vv-t-mother .vv-status:not(:empty)::after{content:'\\2588';margin-left:.35em;animation:vvBlink 1s steps(1) infinite;}",
    ".vv-t-mother .vv-user{color:rgba(160,255,225,.72);text-shadow:0 0 6px rgba(90,255,200,.35);font-size:clamp(15px,1.9vw,26px);}",
    ".vv-t-mother .vv-user::before{content:'> ';}",
    ".vv-t-mother .vv-assistant{color:#b6ffe6;text-shadow:0 0 9px rgba(90,255,200,.55),0 0 2px rgba(0,0,0,.9);font-size:clamp(17px,2.3vw,31px);}",
    ".vv-t-mother.vv-long .vv-assistant{font-size:clamp(14px,1.8vw,24px);}",
    // Light Cycles (Tron): cyan for you, a warm glow for the assistant
    ".vv-t-tron .vv-status{color:#6fe8ff;text-shadow:0 0 10px rgba(60,220,255,.75);}",
    ".vv-t-tron .vv-user{color:rgba(205,246,255,.84);text-shadow:0 0 8px rgba(60,220,255,.4),0 0 3px rgba(0,0,0,.9);}",
    ".vv-t-tron .vv-assistant{color:#fff2e2;text-shadow:0 0 14px rgba(255,150,40,.5),0 0 3px rgba(0,0,0,.95);}",
    // LCARS (Star Trek): flat condensed capitals in the console palette, inside the frame's upper panel
    ".vv-l-lcars .vv-content{left:22%;right:5%;top:17%;max-height:36%;justify-content:flex-start;align-items:flex-start;text-align:left;gap:1.2vmin;}",
    ".vv-t-lcars .vv-content{font-family:'Antonio','Bahnschrift Condensed','Bahnschrift','Arial Narrow','Roboto Condensed',sans-serif;font-stretch:condensed;text-transform:uppercase;letter-spacing:.03em;}",
    ".vv-t-lcars .vv-status{color:#ff9966;letter-spacing:.12em;}",
    ".vv-t-lcars .vv-user{color:#99ccff;font-size:clamp(17px,2.4vw,33px);}",
    ".vv-t-lcars .vv-assistant{color:#ffcc99;font-size:clamp(19px,2.9vw,40px);max-height:25vh;}",
    ".vv-t-lcars.vv-long .vv-assistant{font-size:clamp(16px,2.2vw,30px);}",
    // 1980s arcade: chunky monospace capitals, a yellow "player" status, white glowing text
    ".vv-t-arcade .vv-content{font-family:'Lucida Console','Consolas','Courier New',monospace;text-transform:uppercase;letter-spacing:.05em;font-weight:700;}",
    ".vv-t-arcade .vv-status{color:#ffe600;text-shadow:0 0 10px rgba(255,220,0,.6);}",
    ".vv-t-arcade .vv-status:not(:empty)::after{content:'_';animation:vvBlink 1s steps(1) infinite;}",
    ".vv-t-arcade .vv-user{color:#7ff3ff;text-shadow:0 0 8px rgba(60,220,255,.45),0 0 3px rgba(0,0,0,.9);font-size:clamp(15px,1.9vw,26px);}",
    ".vv-t-arcade .vv-assistant{color:#fff;text-shadow:0 0 10px rgba(255,255,255,.35),0 0 3px rgba(0,0,0,.95);font-size:clamp(17px,2.35vw,32px);line-height:1.35;}",
    ".vv-t-arcade.vv-long .vv-assistant{font-size:clamp(14px,1.9vw,26px);}",
    // vector monitor: thin white capitals with a phosphor glow
    ".vv-t-vector .vv-content{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:.14em;font-weight:300;}",
    ".vv-t-vector .vv-status{color:rgba(255,255,255,.75);text-shadow:0 0 8px rgba(200,220,255,.8);}",
    ".vv-t-vector .vv-user{color:rgba(225,235,255,.78);text-shadow:0 0 8px rgba(160,190,255,.5);}",
    ".vv-t-vector .vv-assistant{color:#fff;text-shadow:0 0 10px rgba(210,225,255,.85),0 0 2px rgba(255,255,255,.9);}",
    "@keyframes vvBlink{50%{opacity:0;}}",
    "@media (prefers-reduced-motion: reduce){.vv-overlay{transition:none;}.vv-t-terminal .vv-status::after,.vv-t-mother .vv-status::after{animation:none;}}"
  ].join("");
  function injectStyle() {
    if (document.getElementById("vv-style")) return;
    var st = document.createElement("style"); st.id = "vv-style"; st.textContent = VV_STYLE; (document.head || document.documentElement).appendChild(st);
  }

  // opts: { overlay, thumb, quality, skin }
  function Stage(host, opts) {
    opts = opts || {};
    injectStyle();
    this.base = "vv-stage" + (opts.overlay ? " vv-overlay" : "") + (opts.thumb ? " vv-thumb" : "");
    this.el = document.createElement("div"); this.el.className = this.base;
    this.canvas = document.createElement("canvas"); this.canvas.className = "vv-canvas";
    this.content = document.createElement("div"); this.content.className = "vv-content";
    this.content.innerHTML = "<div class='vv-status'></div><div class='vv-user'></div><div class='vv-assistant'></div>";
    this.el.appendChild(this.canvas); this.el.appendChild(this.content);
    this.elStatus = this.content.children[0]; this.elUser = this.content.children[1]; this.elReply = this.content.children[2];
    this.txt = ["", "", ""]; this.shown = false;
    host.appendChild(this.el);
    this.renderer = new Renderer(this.canvas, { quality: opts.quality || 1, thumb: !!opts.thumb });
    this.setSkin(opts.skin || SKINS[0].id);
  }
  Stage.prototype.setSkin = function (id) {
    var sk = this.renderer.setSkin(id); this.skin = sk; this.applyClass(); return sk;
  };
  Stage.prototype.applyClass = function () {
    var sk = this.skin;
    this.el.className = this.base + " vv-l-" + (sk.layout || "full") + " vv-t-" + (sk.text || "default") +
      (this.txt[2].length > 150 ? " vv-long" : "") + (this.shown ? " show" : "");
  };
  Stage.prototype.show = function (on) { if (this.shown !== !!on) { this.shown = !!on; this.applyClass(); } };
  Stage.prototype.text = function (status, user, reply) {
    status = status || ""; user = user || ""; reply = reply || "";
    if (status !== this.txt[0]) { this.txt[0] = status; this.elStatus.textContent = status; }
    if (user !== this.txt[1]) { this.txt[1] = user; this.elUser.textContent = user; }
    if (reply !== this.txt[2]) { var wasLong = this.txt[2].length > 150; this.txt[2] = reply; this.elReply.textContent = reply; if (wasLong !== reply.length > 150) this.applyClass(); }
  };
  // Would this reply fit the reply box without clipping? Measured on a hidden twin with the same classes and width.
  Stage.prototype.replyFits = function (text) {
    var m = this.twin, c = this.content;
    if (!m) {
      m = this.twin = document.createElement("div"); m.className = "vv-assistant"; m.setAttribute("aria-hidden", "true");
      m.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;max-height:none;overflow:visible;";
      c.appendChild(m);
    }
    var cs = getComputedStyle(c), rs = getComputedStyle(this.elReply), H = this.el.clientHeight;
    function px(v) { return /%$/.test(v) ? parseFloat(v) * H / 100 : parseFloat(v); }   // % max-heights stay % when computed
    m.style.width = Math.max(50, c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + "px";
    m.textContent = text;
    var others = this.elStatus.offsetHeight + this.elUser.offsetHeight + 2 * (parseFloat(cs.rowGap) || 0);
    var room = px(rs.maxHeight), box = px(cs.maxHeight);
    if (isNaN(box)) box = c.clientHeight;
    room = isNaN(room) ? box - others : Math.min(room, box - others);
    return m.scrollHeight <= room + 1;
  };
  Stage.prototype.draw = function (f) { this.renderer.render(f); if (this.renderer.skin !== this.skin) { this.skin = this.renderer.skin; this.applyClass(); } };
  Stage.prototype.destroy = function () { if (this.el.parentNode) this.el.parentNode.removeChild(this.el); };
