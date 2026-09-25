  /* ---------- shared bits for the 1980s arcade skins: a 5x7 pixel font, pixel sprites, vector digits, CRT scanlines ----------
     Sprites are original designs drawn in the style of the era, not copies of any game's artwork. */
  var PIX_FONT = (function () {
    var src = {                                          // 7 rows per glyph, 5 bits each (MSB = leftmost), as hex pairs
      "0": "0E11131519110E", "1": "040C040404040E", "2": "0E11010204081F", "3": "1F02040201110E", "4": "02060A121F0202",
      "5": "1F101E0101110E", "6": "0608101E11110E", "7": "1F010204080808", "8": "0E11110E11110E", "9": "0E11110F01020C",
      "A": "0E1111111F1111", "B": "1E11111E11111E", "C": "0E11101010110E", "D": "1C12111111121C", "E": "1F10101E10101F",
      "F": "1F10101E101010", "G": "0E11101711110F", "H": "1111111F111111", "I": "0E04040404040E", "J": "0702020202120C",
      "K": "11121418141211", "L": "1010101010101F", "M": "111B1515111111", "N": "11111915131111", "O": "0E11111111110E",
      "P": "1E11111E101010", "Q": "0E11111115120D", "R": "1E11111E141211", "S": "0F10100E01011E", "T": "1F040404040404",
      "U": "1111111111110E", "V": "11111111110A04", "W": "1111111515150A", "X": "11110A040A1111", "Y": "1111110A040404",
      "Z": "1F01020408101F", "!": "04040404040004", "-": "0000001F000000", "<": "02040810080402", ">": "08040201020408",
      ":": "000C0C000C0C00", "=": "00001F001F0000", "?": "0E110102040004", ".": "00000000000C0C", " ": "00000000000000"
    }, out = {};
    for (var ch in src) {
      var rows = [];
      for (var i = 0; i < 7; i++) rows.push(parseInt(src[ch].substr(i * 2, 2), 16));
      out[ch] = rows;
    }
    return out;
  })();
  // Text in the 5x7 font: px = size of one font pixel. align: "left" | "center" | "right". Returns the width drawn.
  function pixText(g, text, x, y, px, color, align) {
    text = String(text).toUpperCase();
    var w = text.length * 6 * px - px, x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x, i, r, c;
    g.fillStyle = color;
    for (i = 0; i < text.length; i++) {
      var gl = PIX_FONT[text[i]] || PIX_FONT[" "];
      for (r = 0; r < 7; r++) { var bits = gl[r]; if (!bits) continue; for (c = 0; c < 5; c++) if (bits & (16 >> c)) g.fillRect(x0 + (i * 6 + c) * px, y + r * px, px, px); }
    }
    return w;
  }
  // A pixel sprite from rows of characters; pal maps a character to a colour (anything else is transparent)
  function pixSprite(rows, pal, px) {
    var h = rows.length, w = 0, i, j;
    for (i = 0; i < h; i++) w = Math.max(w, rows[i].length);
    var c = mkCanvas(w * px, h * px), g = c.getContext("2d");
    for (i = 0; i < h; i++) for (j = 0; j < rows[i].length; j++) { var col = pal[rows[i][j]]; if (col) { g.fillStyle = col; g.fillRect(j * px, i * px, px, px); } }
    return c;
  }
  // Vector digits (seven segments on a 4x6 cell), as drawn by vector-monitor games
  var VSEG = { a: [0, 0, 4, 0], b: [4, 0, 4, 3], c: [4, 3, 4, 6], d: [0, 6, 4, 6], e: [0, 3, 0, 6], f: [0, 0, 0, 3], g: [0, 3, 4, 3] };
  var VDIG = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afedcg", "7": "abc", "8": "abcdefg", "9": "abcfgd" };
  function vecText(g, text, x, y, s) {                   // s = size of one grid step; strokes into the current path
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      var segs = VDIG[text[i]] || "", ox = x + i * 6 * s;
      for (var k = 0; k < segs.length; k++) { var q = VSEG[segs[k]]; g.moveTo(ox + q[0] * s, y + q[1] * s); g.lineTo(ox + q[2] * s, y + q[3] * s); }
    }
    return text.length * 6 * s - 2 * s;
  }
  // CRT scanlines: a cached pattern laid over the frame
  function scanlines(r, alpha) {
    var S = r.S, W = r.w, H = r.h;
    if (!S.__scan) {
      var c = mkCanvas(W, H), g = c.getContext("2d"), step = Math.max(2, Math.round(3 * r.u));
      g.fillStyle = "rgba(0,0,0,1)";
      for (var y = 0; y < H; y += step) g.fillRect(0, y, W, Math.max(1, Math.round(step / 3)));
      S.__scan = c;
    }
    var gg = r.ctx; gg.save(); gg.globalAlpha = alpha; gg.drawImage(S.__scan, 0, 0); gg.restore();
  }
