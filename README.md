# CAMI Speech to Text

Live speech-to-text captions for church services. A pastor (or anyone with a mic) speaks, and the words appear live on a screen — full screen or as a lower-third bar — with automatic profanity filtering and fully customizable styling.

## What's in here

- **Operator Console** ([operator.html](operator.html)) — start/stop the microphone, control the profanity filter, and adjust font, color, layout, and scroll behavior. This is the control panel.
- **Display Screen** ([display.html](display.html)) — the plain output shown on the projector, or picked up by vMix as a Web Browser source. Shows only the live caption text.
- **Server** ([server.py](server.py)) — a small Python server (standard library only, nothing to install) that serves the pages and relays live updates between every connected browser in real time, over the network — so the Operator Console and Display Screen can run on different computers.

## Running it locally

**Easiest:** double-click [`Start CAMI Captions.command`](Start%20CAMI%20Captions.command) (macOS). It starts the server and opens both pages in Chrome.

**Manually:**

```bash
python3 server.py 8787
```

Then open `http://localhost:8787/operator.html` and `http://localhost:8787/display.html` in Chrome (speech recognition needs Chrome or Edge).

The Operator Console shows this computer's network address under **Network** — hand that to vMix (as a Web Browser input) or open it on another computer on the same Wi-Fi to run the Operator and Display on separate machines.

## Deploying

This deploys as a single web service — no separate frontend/backend split needed, since `server.py` serves both the static pages and the live-sync relay.

### Render (recommended, free tier)

1. Push this repo to GitHub.
2. On [Render](https://render.com), choose **New → Blueprint** and point it at this repo — it will pick up [`render.yaml`](render.yaml) automatically. Or create a **New Web Service** manually with:
   - Build command: *(none)*
   - Start command: `python3 server.py`
3. Render assigns an HTTPS URL automatically — the Operator Console's Network box will show it correctly.

Note: Render's free tier sleeps after ~15 minutes of inactivity (30–60s to wake back up on the next request). Fine for testing; for an actual live service, running it locally on the venue's own network (as above) has no such delay and no internet dependency.

## Notes

- No database — there's nothing to persist. All state is live, in-memory on the server, and resets between sessions.
- No login yet — anyone with the Operator Console link can control the captions. Fine for local/private use; add an auth gate before exposing a public deployment for real use.
- Speech recognition uses the browser's built-in engine (Chrome/Edge), which requires an internet connection and a secure context (`localhost` or `https`).
