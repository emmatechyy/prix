#!/usr/bin/env bash
# Shared helpers for the data workflows. The code comes from main (this checkout); the data lives on
# the orphan `data` branch, checked out at ./_data. Read-only against every upstream: no keys printed.
set -euo pipefail
cmd="${1:?usage: data-branch.sh pull|push <message-suffix>}"
if [ "$cmd" = pull ]; then
  if git ls-remote --exit-code --heads origin data >/dev/null; then
    git clone --quiet --depth 50 --branch data "$(git remote get-url origin)" _data
  else
    mkdir -p _data && git -C _data init -q -b data && git -C _data remote add origin "$(git remote get-url origin)"
  fi
  mkdir -p _data/data/snapshots _data/data/history data/snapshots data/history
  # The data branch is the source of truth; files in main are only the bundled fallback.
  cp -a _data/data/. data/ 2>/dev/null || true
  exit 0
fi
if [ "$cmd" = push ]; then
  mkdir -p _data/data
  cp -a data/snapshots data/history _data/data/
  cd _data
  git config user.name "prix-data[bot]"
  git config user.email "prix-data@users.noreply.github.com"
  git add data
  if git diff --cached --quiet; then echo "no data changes"; exit 0; fi
  git commit -q -m "data: $(date -u +%Y-%m-%dT%H:%M:%SZ) [skip ci]"
  for i in 1 2 3; do git push -q origin HEAD:data && exit 0; git pull -q --rebase origin data || true; done
  exit 1
fi
