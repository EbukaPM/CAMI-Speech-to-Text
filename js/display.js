(() => {
  const bus = makeBus();
  let settings = loadSettings();

  const captionEl = document.getElementById("captionText");
  const emptyHint = document.getElementById("emptyHint");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const body = document.body;

  let lines = [];
  let interim = "";
  const renderCaptionLines = createLineRenderer(captionEl);

  // ---- full screen toggle, auto-hidden until the mouse moves ----
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function updateFullscreenLabel() {
    fullscreenBtn.textContent = isFullscreen() ? "Exit Full Screen" : "Full Screen";
  }

  function toggleFullscreen() {
    const el = document.documentElement;
    if (!isFullscreen()) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  }

  let hideTimer = null;
  function showOverlayControls() {
    document.querySelectorAll(".auto-hide-control").forEach(el => el.classList.add("visible"));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      document.querySelectorAll(".auto-hide-control").forEach(el => el.classList.remove("visible"));
    }, 2500);
  }

  fullscreenBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateFullscreenLabel);
  document.addEventListener("webkitfullscreenchange", updateFullscreenLabel);
  document.addEventListener("mousemove", showOverlayControls);
  document.addEventListener("touchstart", showOverlayControls);
  updateFullscreenLabel();
  showOverlayControls();

  function applyLayout() {
    captionEl.style.position = "absolute";
    captionEl.style.left = "0";
    captionEl.style.right = "0";
    captionEl.style.display = "flex";
    captionEl.style.flexDirection = "column";
    captionEl.style.boxSizing = "border-box";
    captionEl.style.width = "100%";
    captionEl.style.color = settings.textColor;
    captionEl.style.fontFamily = settings.fontFamily;
    captionEl.style.fontSize = settings.fontSize + "px";
    captionEl.style.textAlign = settings.align;
    captionEl.style.alignItems = settings.align === "left" ? "flex-start" : "center";
    captionEl.style.overflow = "hidden";

    if (settings.mode === "bar") {
      body.style.background = "#000";
      captionEl.style.top = "auto";
      captionEl.style.bottom = "0";
      captionEl.style.justifyContent = "flex-end";
      captionEl.style.maxHeight = "48vh";
      captionEl.style.padding = "1.5% 4%";
      captionEl.style.background = hexToRgba(settings.bgColor, settings.bgOpacity);
    } else {
      body.style.background = hexToRgba(settings.bgColor, settings.bgOpacity);
      captionEl.style.top = "0";
      captionEl.style.bottom = "0";
      captionEl.style.height = "100%";
      captionEl.style.justifyContent = "center";
      captionEl.style.maxHeight = "100vh";
      // Small, fixed breathing room top and bottom so text never touches
      // the very edge of the screen.
      captionEl.style.padding = "1.5cm 4% 2cm";
      captionEl.style.background = "transparent";
    }

    fitTextToContainer();
  }

  // Guarantees every caption line is always fully visible — never clipped
  // by the container's fixed height. Starts from the operator's chosen
  // font size and only shrinks as far as actually needed to fit whatever
  // is currently on screen, growing back the moment there's room again
  // (e.g. right after a Clear & Restart drops most lines).
  function fitTextToContainer() {
    const minFontSize = 16;
    let fontSize = settings.fontSize;
    captionEl.style.fontSize = fontSize + "px";

    let guard = 0;
    while (captionEl.scrollHeight > captionEl.clientHeight && fontSize > minFontSize && guard < 40) {
      fontSize = Math.max(minFontSize, Math.floor(fontSize * 0.95));
      captionEl.style.fontSize = fontSize + "px";
      guard++;
    }
  }

  function hexToRgba(hex, opacity) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  function render() {
    const hasText = renderCaptionLines(lines, interim, {
      animate: true,
      durationMs: settings.scrollSpeedMs
    });
    emptyHint.style.display = hasText ? "none" : "flex";
    fitTextToContainer();
  }

  bus.on((msg) => {
    if (!msg) return;
    if (msg.type === "settings" && msg.settings) {
      settings = { ...settings, ...msg.settings };
      saveSettings(settings);
      applyLayout();
    } else if (msg.type === "caption") {
      lines = Array.isArray(msg.lines) ? msg.lines : [];
      interim = msg.interim || "";
      render();
    }
  });

  applyLayout();
  render();
})();
