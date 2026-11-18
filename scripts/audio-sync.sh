#!/bin/sh
# Move the recorded voice between this laptop and the server, without ever deleting a take.
#
#   scripts/audio-sync.sh pull     server -> here   (a backup, and playback while working offline)
#   scripts/audio-sync.sh push     here -> server
#   scripts/audio-sync.sh both     what it does by default
#
# Recording on the phone (https://91-107-173-6.sslip.io/app/record.html) saves on the server. Recording at
# http://127.0.0.1:8080/app/record.html saves on this laptop. Run this after a phone session so the two
# machines have the same files. `rsync -au` keeps the newer copy of a re-recorded sentence and never deletes
# an extra file, so it is safe to run in either direction any number of times.
set -e
cd "$(dirname "$0")/.."
SERVER=root@91.107.173.6
DIR=/root/hermes/hossein/english-recall-exercise
MODE=${1:-both}

mkdir -p audio
case "$MODE" in
  pull|both)
    rsync -au --exclude '.tmp' --info=stats1 "$SERVER:$DIR/audio/" audio/ ;;
  *) [ "$MODE" = "push" ] || { echo "usage: $0 [pull|push|both]" >&2; exit 2; } ;;
esac
case "$MODE" in
  push|both)
    rsync -au --exclude '.tmp' --info=stats1 audio/ "$SERVER:$DIR/audio/" ;;
esac
