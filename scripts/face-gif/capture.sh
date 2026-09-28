#!/bin/bash
# usage: capture.sh <project-dir> <out-dir> <configs.json>
# For each config object in the JSON array: push it via emu-app-config, wait, screenshot.
set -u
PROJ=$1; OUT=$2; CFGS=$3
mkdir -p "$OUT"; cd "$PROJ"
N=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$CFGS")
for ((i=0;i<N;i++)); do
  pkill -f emu-app-config 2>/dev/null; sleep 0.5
  ENC=$(python3 -c "import json,sys,urllib.parse;print(urllib.parse.quote(json.dumps(json.load(open(sys.argv[1]))[int(sys.argv[2])],separators=(',',':')),safe=''))" "$CFGS" $i)
  BROWSER=/usr/bin/true pebble emu-app-config --emulator emery >"$OUT/cfg$i.log" 2>&1 &
  PORT=""
  for t in $(seq 1 40); do
    PORT=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -i python | grep -v 'pypkjs\|:80\b' | awk '{print $9}' | sed 's/.*://' | sort -u | while read p; do curl -s -m1 "http://localhost:$p/x?probe=1" 2>/dev/null | grep -q 'Not Found' && echo $p && break; done)
    [ -n "$PORT" ] && break; sleep 0.5
  done
  if [ -z "$PORT" ]; then echo "frame $i: no config port"; continue; fi
  curl -s -m3 "http://localhost:$PORT/close?$ENC" >/dev/null
  sleep ${WAIT:-4}
  rm -f "$OUT/f$i.png"; pebble screenshot --emulator emery --no-open "$OUT/f$i.png" >/dev/null 2>&1
  [ -s "$OUT/f$i.png" ] && echo "frame $i ok (port $PORT)" || echo "frame $i: screenshot FAILED"
done
pkill -f emu-app-config 2>/dev/null
