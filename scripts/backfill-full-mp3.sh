#!/usr/bin/env bash
# Backfill paid full MP3 from a master WAV with LAME Xing (box-only; Workers have no ffmpeg).
# Usage: JOB_ID=... WAV=... ./scripts/backfill-full-mp3.sh
set -euo pipefail
: "${JOB_ID:?}"
: "${WAV:?}"
: "${CLOUDFLARE_API_TOKEN:?}"
NS="${AUDIO_KV_NAMESPACE_ID:-4f8262cb903743708308da8c8b3ea2dc}"
ACCT="${CF_ACCOUNT_ID:-c26984df74d264105345ad1f424067b5}"
OUT="/tmp/${JOB_ID}-full-fixed.mp3"
ffmpeg -y -i "$WAV" \
  -af "silenceremove=stop_periods=-1:stop_duration=0.35:stop_threshold=-45dB" \
  -codec:a libmp3lame -b:a 192k -write_xing 1 -id3v2_version 3 \
  "$OUT"
ffprobe -hide_banner "$OUT" 2>&1 | head -20
python3 - <<PY
import os, urllib.parse, subprocess
job=os.environ["JOB_ID"]
acct=os.environ.get("CF_ACCOUNT_ID","c26984df74d264105345ad1f424067b5")
ns=os.environ.get("AUDIO_KV_NAMESPACE_ID","4f8262cb903743708308da8c8b3ea2dc")
token=os.environ["CLOUDFLARE_API_TOKEN"]
pairs=[
  (f"audio:{job}:full:mp3", os.environ.get("OUT", f"/tmp/{job}-full-fixed.mp3")),
  (f"audio:{job}:full", os.environ["WAV"]),
]
for key, path in pairs:
  if not os.path.exists(path):
    raise SystemExit(f"missing {path}")
  enc=urllib.parse.quote(key, safe="")
  url=f"https://api.cloudflare.com/client/v4/accounts/{acct}/storage/kv/namespaces/{ns}/values/{enc}"
  r=subprocess.run(["curl","-sS","-o","/tmp/kv-put.json","-w","%{http_code}",
    "-X","PUT",url,"-H",f"Authorization: Bearer {token}","--data-binary",f"@{path}"],capture_output=True,text=True)
  print(key, r.stdout, open("/tmp/kv-put.json").read()[:180])
PY
echo "Live check: https://songsnuggle.com/api/jobs/${JOB_ID}/audio?full=1&format=mp3"
