#!/usr/bin/env bash
# Sync edge functions from supabase/functions/ (source of truth, used by
# `supabase functions deploy` for hosted projects) into the docker stack's
# functions volume, which the edge runtime serves from.
#
# `main` (the runtime router) and `hello` (smoke-test function) are owned by
# the pinned stack and are never overwritten.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=supabase/functions
DST=docker/supabase/volumes/functions

if [ ! -d "$SRC" ]; then
  echo "nothing to sync: $SRC does not exist" >&2
  exit 0
fi

synced=0
for dir in "$SRC"/*/; do
  name=$(basename "$dir")
  case "$name" in main|hello) continue ;; esac
  if [ ! -f "$dir/index.ts" ] && [ ! -f "$dir/index.js" ]; then
    echo "  skipping $name (no index.ts)" >&2
    continue
  fi
  rm -rf "$DST/$name"
  cp -R "$dir" "$DST/$name"
  echo "  synced $name -> $DST/$name"
  synced=$((synced + 1))
done

echo "synced $synced function(s) into $DST (main + hello are stack-managed)"
echo "tip: run 'docker compose restart functions' to pick up changes"
