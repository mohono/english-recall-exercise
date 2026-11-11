#!/bin/sh
# Push main to GitHub and update the server: http://91.107.173.6:8766/app/
#   scripts/deploy.sh
# The server folder is /root/hermes/hossein/english-recall-exercise, served by the systemd unit
# english-recall.service (serve.py --no-open --lan, port 8766 open in ufw). app/vendor/ (the speech model) is
# not in git; it was copied there once with rsync and git pull leaves it alone.
set -e
cd "$(dirname "$0")/.."
SERVER=root@91.107.173.6
DIR=/root/hermes/hossein/english-recall-exercise
URL=http://91.107.173.6:8766/app/

if [ -n "$(git status --porcelain)" ]; then echo "Uncommitted changes: commit first." >&2; exit 1; fi
git push -q
ssh -o BatchMode=yes "$SERVER" "cd $DIR && git pull --ff-only -q && systemctl restart english-recall && sleep 1 \
  && systemctl is-active --quiet english-recall && git log --oneline -1"
[ "$(git rev-parse HEAD)" = "$(ssh -o BatchMode=yes "$SERVER" "git -C $DIR rev-parse HEAD")" ] || { echo "Server is not at this commit." >&2; exit 1; }
code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$URL")
[ "$code" = 200 ] || { echo "Server answered $code at $URL" >&2; exit 1; }
echo "Deployed: $URL"
