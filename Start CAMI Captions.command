#!/bin/bash
cd "$(dirname "$0")"
PORT=8787

STARTED_SERVER=0
if ! lsof -i :"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Starting CAMI Captions server on port $PORT..."
  python3 server.py "$PORT" &
  SERVER_PID=$!
  STARTED_SERVER=1
  sleep 1
else
  echo "Server already running on port $PORT — reusing it."
fi

if open -Ra "Google Chrome" >/dev/null 2>&1; then
  open -a "Google Chrome" "http://localhost:$PORT/operator.html"
  open -a "Google Chrome" "http://localhost:$PORT/display.html"
else
  open "http://localhost:$PORT/operator.html"
  open "http://localhost:$PORT/display.html"
fi

echo ""
echo "Two tabs just opened: the Operator Console and the Display Screen."
echo "The Operator Console shows this computer's network address — give that"
echo "to vMix (as a Web Browser input), or open it on whatever computer is"
echo "running vMix, so it can pick up the Display Screen."
echo ""
echo "macOS may ask to allow incoming network connections the first time —"
echo "click Allow, or other computers on the network won't be able to reach it."
echo ""
echo "Keep THIS window open for the whole service."
echo "When you're done, close this window (or press Ctrl+C) to stop the server."
echo ""

if [ "$STARTED_SERVER" -eq 1 ]; then
  wait "$SERVER_PID"
else
  while lsof -i :"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; do
    sleep 5
  done
fi
