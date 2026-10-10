/* Shared state, settings, and profanity filter used by both operator.js and display.js */

const STORAGE_KEY = "cami-caption-settings-v1";

const DEFAULT_SETTINGS = {
  mode: "full", // "full" | "bar"
  fontSize: 64, // px, used for full mode; bar mode scales down automatically
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  textColor: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 0.85,
  align: "center", // "left" | "center"
  maxLinesFull: 8, // lines shown before clearing/scrolling in Full Screen mode
  maxLinesBar: 4,  // lines shown before clearing/scrolling in Bottom Bar mode
  overflowMode: "clear", // "clear" (wipe and restart at top) | "scroll" (drop oldest line)
  scrollSpeedMs: 450, // how smoothly lines slide into their new position
  filterEnabled: true,
  replacement: "****",
  customWords: "" // comma separated, user-added on top of the default list
};

const DEFAULT_BAD_WORDS = [
  "fuck","fucking","fucker","shit","shitty","bitch","bastard","asshole","ass",
  "dick","piss","cunt","cock","whore","slut","nigger","nigga","faggot","retard",
  "damn","goddamn","motherfucker","prick","twat"
];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function buildWordList(customWords) {
  const extra = (customWords || "")
    .split(",")
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_BAD_WORDS, ...extra]));
}

function applyProfanityFilter(text, settings) {
  if (!settings.filterEnabled || !text) return text;
  const words = buildWordList(settings.customWords);
  if (words.length === 0) return text;
  const pattern = new RegExp("\\b(" + words.map(escapeRegex).join("|") + ")\\b", "gi");
  return text.replace(pattern, settings.replacement || "****");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Renders a list of {id, text} caption lines plus one trailing interim line
   into `container`, reusing existing DOM nodes by id instead of rebuilding
   everything on every call. This is what stops the display from "shaking":
   interim text updates many times a second while someone is speaking, and
   wiping + recreating every line on each of those ticks replayed every
   line's entrance animation at once. Here, a line only animates in once,
   when it's genuinely new; untouched lines are just repositioned (smoothly,
   via FLIP) or left alone. */
function createLineRenderer(container) {
  let nodeMap = new Map(); // line id -> element
  let interimNode = null;

  return function renderLines(lineObjs, interimText, opts) {
    const animate = !!(opts && opts.animate);
    const duration = (opts && opts.durationMs) || 400;

    const firstRects = animate ? new Map() : null;
    if (animate) {
      nodeMap.forEach((node, id) => firstRects.set(id, node.getBoundingClientRect()));
    }

    const incomingIds = new Set(lineObjs.map(l => l.id));
    for (const [id, node] of nodeMap) {
      if (!incomingIds.has(id)) {
        node.remove();
        nodeMap.delete(id);
      }
    }

    const newlyAdded = new Set();
    lineObjs.forEach(lineObj => {
      let node = nodeMap.get(lineObj.id);
      if (!node) {
        node = document.createElement("div");
        node.className = "cap-line";
        nodeMap.set(lineObj.id, node);
        newlyAdded.add(node);
      }
      if (node.textContent !== lineObj.text) node.textContent = lineObj.text;
      container.appendChild(node);
    });

    if (interimText && interimText.trim()) {
      if (!interimNode) {
        interimNode = document.createElement("div");
        interimNode.className = "cap-line interim";
        newlyAdded.add(interimNode);
      }
      if (interimNode.textContent !== interimText) interimNode.textContent = interimText;
      container.appendChild(interimNode);
    } else if (interimNode) {
      interimNode.remove();
      interimNode = null;
    }

    if (animate) {
      nodeMap.forEach((node, id) => {
        if (newlyAdded.has(node)) return;
        const first = firstRects.get(id);
        if (!first) return;
        const last = node.getBoundingClientRect();
        const dy = first.top - last.top;
        if (Math.abs(dy) < 0.5) return;
        node.style.transition = "none";
        node.style.transform = `translateY(${dy}px)`;
        node.getBoundingClientRect(); // force reflow so the jump above applies before transitioning back
        node.style.transition = `transform ${duration}ms ease`;
        node.style.transform = "translateY(0)";
      });
    }

    return lineObjs.length > 0 || (interimText && interimText.trim().length > 0);
  };
}

/* Messaging between the Operator Console and any number of Display Screens,
   over the network — not just between tabs on the same computer. The local
   server (server.py) relays messages between whichever browsers (on
   whichever machines) have a page open, over Server-Sent Events, with a
   plain POST to send. This is what lets the Operator run on one laptop
   while the Display Screen runs on another machine for vMix to pick up. */
function makeBus() {
  const listeners = [];
  let source = null;

  function connect() {
    source = new EventSource("/api/events");
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        listeners.forEach(fn => fn(data));
      } catch (err) {}
    };
  }
  connect();

  return {
    send(data) {
      fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }).catch(() => {});
    },
    on(fn) {
      listeners.push(fn);
    }
  };
}
