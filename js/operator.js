(() => {
  const bus = makeBus();
  let settings = loadSettings();
  let isListening = false;
  let recognition = null;
  let restartTimer = null;

  // Finalized lines ({id, text}, already pushed through the profanity
  // filter) plus the current not-yet-final chunk still being spoken.
  let lines = [];
  let interimRaw = "";
  let nextLineId = 1;

  const els = {
    toggleBtn: document.getElementById("toggleBtn"),
    liveDot: document.getElementById("liveDot"),
    unsupportedBanner: document.getElementById("unsupportedBanner"),
    filterToggle: document.getElementById("filterToggle"),
    replacement: document.getElementById("replacement"),
    customWords: document.getElementById("customWords"),
    maxLinesFull: document.getElementById("maxLinesFull"),
    maxLinesFullVal: document.getElementById("maxLinesFullVal"),
    maxLinesBar: document.getElementById("maxLinesBar"),
    maxLinesBarVal: document.getElementById("maxLinesBarVal"),
    scrollSpeed: document.getElementById("scrollSpeed"),
    scrollSpeedVal: document.getElementById("scrollSpeedVal"),
    fontSize: document.getElementById("fontSize"),
    fontSizeVal: document.getElementById("fontSizeVal"),
    fontFamily: document.getElementById("fontFamily"),
    textColor: document.getElementById("textColor"),
    bgColor: document.getElementById("bgColor"),
    bgOpacity: document.getElementById("bgOpacity"),
    bgOpacityVal: document.getElementById("bgOpacityVal"),
    align: document.getElementById("align"),
    clearBtn: document.getElementById("clearBtn"),
    previewBox: document.getElementById("previewBox"),
    previewInner: document.getElementById("previewInner"),
    statusText: document.getElementById("statusText"),
    filterStatusText: document.getElementById("filterStatusText"),
    modeStatusText: document.getElementById("modeStatusText"),
  };

  const renderPreviewLines = createLineRenderer(els.previewInner);

  function hydrateUIFromSettings() {
    els.filterToggle.checked = settings.filterEnabled;
    els.replacement.value = settings.replacement;
    els.customWords.value = settings.customWords;
    els.maxLinesFull.value = settings.maxLinesFull;
    els.maxLinesFullVal.textContent = settings.maxLinesFull;
    els.maxLinesBar.value = settings.maxLinesBar;
    els.maxLinesBarVal.textContent = settings.maxLinesBar;
    els.scrollSpeed.value = settings.scrollSpeedMs;
    els.scrollSpeedVal.textContent = scrollSpeedLabel(settings.scrollSpeedMs);
    els.fontSize.value = settings.fontSize;
    els.fontSizeVal.textContent = settings.fontSize + "px";
    els.fontFamily.value = settings.fontFamily;
    els.textColor.value = settings.textColor;
    els.bgColor.value = settings.bgColor;
    els.bgOpacity.value = settings.bgOpacity;
    els.bgOpacityVal.textContent = Math.round(settings.bgOpacity * 100) + "%";
    els.align.value = settings.align;
    document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;
    document.querySelector(`input[name="overflow"][value="${settings.overflowMode}"]`).checked = true;
    els.filterStatusText.textContent = settings.filterEnabled ? "On" : "Off";
    els.modeStatusText.textContent = settings.mode === "full" ? "Full Screen" : "Bottom Bar";
    applyPreviewStyle();
  }

  function persistAndBroadcastSettings() {
    saveSettings(settings);
    retrimLines();
    bus.send({ type: "settings", settings });
    els.filterStatusText.textContent = settings.filterEnabled ? "On" : "Off";
    els.modeStatusText.textContent = settings.mode === "full" ? "Full Screen" : "Bottom Bar";
    applyPreviewStyle();
    broadcastCaption();
  }

  function applyPreviewStyle() {
    els.previewInner.style.color = settings.textColor;
    els.previewInner.style.fontFamily = settings.fontFamily;
    els.previewBox.style.alignItems = settings.align === "left" ? "flex-start" : "center";
    els.previewInner.style.textAlign = settings.align;
    const scaledFont = Math.max(14, Math.round(settings.fontSize * 0.3));
    els.previewInner.style.fontSize = scaledFont + "px";
  }

  function scrollSpeedLabel(ms) {
    if (ms <= 250) return "Fast";
    if (ms <= 500) return "Medium";
    if (ms <= 850) return "Slow";
    return "Very Slow";
  }

  // ---- line buffer (clear-and-restart or scroll once the cap is hit) ----
  function currentMaxLines() {
    return settings.mode === "bar" ? settings.maxLinesBar : settings.maxLinesFull;
  }

  function addFinalSegment(rawText) {
    const text = rawText.trim();
    if (!text) return;
    const filtered = applyProfanityFilter(text, settings);
    const max = currentMaxLines();
    if (settings.overflowMode === "clear" && lines.length >= max) {
      // Carry the most recent line forward as the start of the new page,
      // instead of wiping to a blank screen — keeps continuity for anyone
      // reading instead of a jarring full disappear.
      const lastLine = lines[lines.length - 1];
      lines = lastLine ? [lastLine] : [];
    }
    lines.push({ id: nextLineId++, text: filtered });
    if (settings.overflowMode === "scroll" && lines.length > max) {
      lines = lines.slice(lines.length - max);
    }
  }

  function retrimLines() {
    const max = currentMaxLines();
    if (lines.length > max) {
      lines = settings.overflowMode === "clear" ? lines.slice(-1) : lines.slice(lines.length - max);
    }
  }

  function broadcastCaption() {
    const filteredInterim = applyProfanityFilter(interimRaw, settings);
    updatePreview(lines, filteredInterim);
    bus.send({ type: "caption", lines, interim: filteredInterim });
  }

  // ---- settings listeners ----
  els.filterToggle.addEventListener("change", () => { settings.filterEnabled = els.filterToggle.checked; persistAndBroadcastSettings(); });
  els.replacement.addEventListener("input", () => { settings.replacement = els.replacement.value || "****"; persistAndBroadcastSettings(); });
  els.customWords.addEventListener("input", () => { settings.customWords = els.customWords.value; persistAndBroadcastSettings(); });
  els.maxLinesFull.addEventListener("input", () => { settings.maxLinesFull = Number(els.maxLinesFull.value); els.maxLinesFullVal.textContent = settings.maxLinesFull; persistAndBroadcastSettings(); });
  els.maxLinesBar.addEventListener("input", () => { settings.maxLinesBar = Number(els.maxLinesBar.value); els.maxLinesBarVal.textContent = settings.maxLinesBar; persistAndBroadcastSettings(); });
  els.scrollSpeed.addEventListener("input", () => { settings.scrollSpeedMs = Number(els.scrollSpeed.value); els.scrollSpeedVal.textContent = scrollSpeedLabel(settings.scrollSpeedMs); persistAndBroadcastSettings(); });
  els.fontSize.addEventListener("input", () => { settings.fontSize = Number(els.fontSize.value); els.fontSizeVal.textContent = settings.fontSize + "px"; persistAndBroadcastSettings(); });
  els.fontFamily.addEventListener("change", () => { settings.fontFamily = els.fontFamily.value; persistAndBroadcastSettings(); });
  els.textColor.addEventListener("input", () => { settings.textColor = els.textColor.value; persistAndBroadcastSettings(); });
  els.bgColor.addEventListener("input", () => { settings.bgColor = els.bgColor.value; persistAndBroadcastSettings(); });
  els.bgOpacity.addEventListener("input", () => { settings.bgOpacity = Number(els.bgOpacity.value); els.bgOpacityVal.textContent = Math.round(settings.bgOpacity * 100) + "%"; persistAndBroadcastSettings(); });
  els.align.addEventListener("change", () => { settings.align = els.align.value; persistAndBroadcastSettings(); });
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener("change", () => { settings.mode = document.querySelector('input[name="mode"]:checked').value; persistAndBroadcastSettings(); });
  });
  document.querySelectorAll('input[name="overflow"]').forEach(r => {
    r.addEventListener("change", () => { settings.overflowMode = document.querySelector('input[name="overflow"]:checked').value; persistAndBroadcastSettings(); });
  });

  els.clearBtn.addEventListener("click", () => {
    lines = [];
    interimRaw = "";
    broadcastCaption();
  });

  // ---- speech recognition ----
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function updatePreview(lineList, interim) {
    renderPreviewLines(lineList, interim, {
      animate: settings.overflowMode === "scroll",
      durationMs: settings.scrollSpeedMs
    });
  }

  function setListeningUI(on) {
    isListening = on;
    els.toggleBtn.textContent = on ? "Stop Listening" : "Start Listening";
    els.toggleBtn.classList.toggle("listening", on);
    els.liveDot.classList.toggle("live", on);
    els.statusText.textContent = on ? "Listening…" : "Idle";
  }

  let consecutiveNoSpeech = 0;

  function scheduleRestart() {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      try {
        recognition.start();
      } catch (e) {
        // The recognition engine sometimes isn't ready immediately after
        // it just stopped (a known Chrome race) — rather than leaving it
        // dead silently, keep retrying instead of giving up after one try.
        scheduleRestart();
      }
    }, 300);
  }

  function startRecognition() {
    if (!SpeechRecognition) return;
    consecutiveNoSpeech = 0;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      els.statusText.textContent = "Listening…";
    };

    recognition.onresult = (event) => {
      consecutiveNoSpeech = 0;
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          addFinalSegment(transcript);
        } else {
          interimChunk += transcript;
        }
      }
      interimRaw = interimChunk;
      broadcastCaption();
    };

    recognition.onerror = (e) => {
      if (e.error === "no-speech") {
        // Normal the first time or two — just means it's gone a few
        // seconds without hearing anything, and onend below restarts it.
        // But if it keeps happening, the mic isn't reaching Chrome at all.
        consecutiveNoSpeech++;
        els.statusText.textContent = consecutiveNoSpeech === 1
          ? "Listening… (no speech heard yet)"
          : `No mic input detected (attempt ${consecutiveNoSpeech}) — check Chrome's mic permission/device`;
        return;
      }
      els.statusText.textContent = "Error: " + e.error;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stopRecognition();
      }
    };

    recognition.onend = () => {
      if (isListening) {
        // Chrome stops recognition periodically; restart automatically.
        scheduleRestart();
      }
    };

    recognition.start();
    setListeningUI(true);
  }

  function stopRecognition() {
    isListening = false;
    clearTimeout(restartTimer);
    if (recognition) {
      recognition.onend = null;
      recognition.stop();
    }
    setListeningUI(false);
  }

  els.toggleBtn.addEventListener("click", () => {
    if (!SpeechRecognition) return;
    if (isListening) stopRecognition(); else startRecognition();
  });

  if (!SpeechRecognition) {
    els.unsupportedBanner.style.display = "block";
    els.toggleBtn.disabled = true;
    els.toggleBtn.style.opacity = 0.5;
  }

  window.addEventListener("beforeunload", () => { if (isListening) stopRecognition(); });

  // ---- network address, so this can be handed to vMix or opened from another computer ----
  const networkUrlEl = document.getElementById("networkUrl");
  fetch("/api/info")
    .then(r => r.json())
    .then(info => {
      networkUrlEl.textContent = `${info.origin}/display.html`;
    })
    .catch(() => {
      networkUrlEl.textContent = "Couldn't look up the network address — make sure you started this with the CAMI Captions server, not by opening the file directly.";
    });

  hydrateUIFromSettings();
  bus.send({ type: "settings", settings });
  broadcastCaption();
})();
