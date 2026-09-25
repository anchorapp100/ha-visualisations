  /* ---------------- public API ---------------- */
  window.VoiceVisuals = {
    version: VERSION, skins: SKINS, skinByName: skinByName, SURPRISE: SURPRISE, CFG: CFG,
    Renderer: Renderer, FrameBuilder: FrameBuilder, Stage: Stage, Demo: Demo, DEMO_TEXT: DEMO_TEXT, analyzeBuffer: analyzeBuffer,
    isBusy: function () { return !!(OV.lastActive || OV.hideTimer || OV.demo); },
    destroy: destroyOverlay, playDemo: playDemo, stopDemo: stopDemo,
    overlay: OV,
    captions: function () { return cap && { pages: cap.pages, bounds: cap.bounds, dur: cap.dur, full: cap.full, startsIn: tts ? ttsStartAt - performance.now() : null, audio: ttsInfo, lead: leadModel() }; }
  };
  if (!window.__VV_NO_OVERLAY) startOverlay();
})();
