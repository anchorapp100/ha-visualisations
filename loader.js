/*
 * voice-visuals-loader.js: the file you register as a Lovelace resource (JavaScript module),
 * e.g. /local/voice-visuals/voice-visuals-loader.js
 *
 * It reads config.json (optional) and version.json from the same folder, then loads voice-visuals.js?v=<version>,
 * so new builds reach your screens without fighting Home Assistant's 31-day /local cache. Every 5 minutes it
 * re-checks; a new version is hot-swapped in place (no page reload), but never mid-conversation.
 */
(function () {
  "use strict";
  if (window.__vvLoader) return;
  window.__vvLoader = true;
  var BASE = "/local/voice-visuals/", current = null, loading = false;

  function getJson(name) {
    return fetch(BASE + name + "?t=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw r.status; return r.json(); });
  }
  function getConfig() {                                            // optional; the defaults work without it
    return getJson("config.json").then(function (c) { window.VoiceVisualsConfig = c || {}; }, function () {});
  }
  function load(ver) {
    loading = true;
    var s = document.createElement("script");
    s.src = BASE + "voice-visuals.js?v=" + encodeURIComponent(ver);
    s.onload = function () { current = ver; loading = false; };
    s.onerror = function () { loading = false; };
    (document.head || document.documentElement).appendChild(s);
  }
  getConfig().then(function () { return getJson("version.json"); })
    .then(function (j) { load(String(j.version)); }, function () { load("day-" + Math.floor(Date.now() / 86400000)); });

  setInterval(function () {
    if (loading) return;
    getJson("version.json").then(function (j) {
      var v = String(j.version);
      if (!current || v === current) return;
      var VV = window.VoiceVisuals;
      if (VV && VV.isBusy && VV.isBusy()) return;                 // never mid-conversation; try again next time
      if (VV && VV.destroy) { try { VV.destroy(); } catch (e) {} }
      try { delete window.VoiceVisuals; } catch (e) { window.VoiceVisuals = undefined; }
      return getConfig().then(function () { load(v); });
    }).catch(function () {});
  }, 300000);
})();
