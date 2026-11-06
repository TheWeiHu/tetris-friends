#!/usr/bin/env bash
set -euo pipefail
: "${1:?Pass the original Bounce Protocol instrumental WAV}"
root=$(cd "$(dirname "$0")/.." && pwd)
ffmpeg -nostdin -hide_banner -i "$1" -ss 8 -t 32 \
  -af 'afade=t=in:st=0:d=0.025,afade=t=out:st=31.94:d=0.06' \
  -c:a aac -b:a 112k "$root/public/assets/bounce-protocol.m4a"
