#!/bin/sh
# 公開用の写し: 期間中に実行したスクリプトそのままです（伏せ字の対象なし）。
# Transcribes a demo video with mlx-whisper (local Apple-silicon model, 0 tokens) and compares the text with the
# narration lines, so a misread or a dropped line is found by listening, not by reading the script.
# Usage: whisper-roundtrip.sh <video.mp4> [lines.json] [outdir]
#   lines.json: from narration-check.mjs (default: next to this script). outdir: default whisper-<video name>/ next to it.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
mp4=$1
lines=${2:-$HERE/lines.json}
out=${3:-$HERE/whisper-$(basename "$mp4" .mp4)}
mkdir -p "$out"
ffmpeg -y -loglevel error -i "$mp4" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$out/audio.wav"
# No --initial-prompt: a prompt with the right words would hide the misreads this is for.
uv run --with mlx-whisper mlx_whisper "$out/audio.wav" --model mlx-community/whisper-large-v3-turbo --language ja --task transcribe --output-format txt --output-dir "$out" --verbose False
node "$HERE/narration-check.mjs" --transcript "$out/audio.txt" --lines "$lines" | tee "$out/compare.txt"
echo "→ $out/audio.txt, $out/compare.txt"
