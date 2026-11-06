#!/usr/bin/env bash
set -euo pipefail
: "${ARENA_SSH_TARGET:?Set ARENA_SSH_TARGET to the configured hosting server}"
ssh_opts=()
if [[ -n "${ARENA_SSH_KEY:-}" ]]; then ssh_opts=(-i "$ARENA_SSH_KEY"); fi
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
if [[ -n "$(git status --porcelain)" ]]; then echo 'Commit the release before deploying.' >&2; exit 1; fi
release=$(git rev-parse HEAD)
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
git archive --format=tar "$release" > "$archive"
ssh "${ssh_opts[@]}" "$ARENA_SSH_TARGET" "test -x /opt/beepboop-arena/node/bin/node && test ! -e /opt/beepboop-arena/releases/$release && sudo install -d -o \"\$(id -un)\" /opt/beepboop-arena/releases/$release"
ssh "${ssh_opts[@]}" "$ARENA_SSH_TARGET" "tar -xf - -C /opt/beepboop-arena/releases/$release" < "$archive"
ssh "${ssh_opts[@]}" "$ARENA_SSH_TARGET" bash -s -- "$release" <<'REMOTE'
set -euo pipefail
release=$1
export PATH=/opt/beepboop-arena/node/bin:$PATH
cd "/opt/beepboop-arena/releases/$release"
npm ci --omit=dev --no-audit --no-fund
previous=$(readlink -f /opt/beepboop-arena/current || true)
sudo chown -R root:root "/opt/beepboop-arena/releases/$release"
sudo ln -sfn "/opt/beepboop-arena/releases/$release" /opt/beepboop-arena/next
sudo mv -Tf /opt/beepboop-arena/next /opt/beepboop-arena/current
if sudo systemctl restart beepboop-arena; then
    for attempt in $(seq 1 20); do
        if curl --fail --silent http://127.0.0.1:8792/health >/dev/null; then echo "Deployed $release"; exit 0; fi
        sleep 1
    done
fi
if [[ -n "$previous" ]]; then
    sudo ln -sfn "$previous" /opt/beepboop-arena/next
    sudo mv -Tf /opt/beepboop-arena/next /opt/beepboop-arena/current
    sudo systemctl restart beepboop-arena
fi
echo 'Health check failed; restored the previous release when available.' >&2
exit 1
REMOTE
