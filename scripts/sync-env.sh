#!/usr/bin/env bash
# Keep the two .env files in sync.
#
# Docker Compose interpolates ${VAR} from the project root's .env only —
# it does NOT read docker/supabase/.env (the included stack's directory).
# So the root .env must carry every variable the pinned stack composes with:
# this script mirrors docker/supabase/.env into a managed block at the end
# of the root .env, and mirrors the user's BARRY_* values the other way
# (root .env is where Barry is configured; the stack file is what the
# edge-functions service actually reads).
#
# Run by scripts/setup-docker.sh and by `make up`. Safe to re-run any time.
set -euo pipefail
cd "$(dirname "$0")/.."

SBU_ENV=docker/supabase/.env
ROOT_ENV=.env
BEGIN="# --- BEGIN stack env (managed by scripts/sync-env.sh — do not edit) ---"
END="# --- END stack env (managed) ---"

[ -f "$SBU_ENV" ] || { echo "missing $SBU_ENV — run 'make setup' first" >&2; exit 1; }
[ -f "$ROOT_ENV" ] || { echo "missing $ROOT_ENV — run 'make setup' first" >&2; exit 1; }

# 1. BARRY_*: root .env (user config) -> stack file (edge runtime reads it).
#    BARRY_* is deliberately NOT mirrored into the managed block below — the
#    client section of the root .env is the single source for them.
root_val() { grep -E "^$1=" "$ROOT_ENV" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }
for k in BARRY_BASE_URL BARRY_API_KEY BARRY_MODEL BARRY_EMBEDDING_MODEL BARRY_SEARXNG_URL; do
  v=$(root_val "$k")
  [ -n "$v" ] || continue
  if grep -qE "^$k=" "$SBU_ENV"; then
    tmp=$(mktemp); sed "s|^$k=.*|$k=$v|" "$SBU_ENV" > "$tmp" && mv "$tmp" "$SBU_ENV"
  else
    printf '%s=%s\n' "$k=$v" >> "$SBU_ENV"
  fi
done

# 2. Mirror the stack file into the root .env's managed block (rewritten
#    in place each run; everything else in the root .env is untouched).
#    One line per key, last occurrence wins (same precedence compose uses),
#    first-seen order preserved.
tmp=$(mktemp)
awk -v begin="$BEGIN" -v end="$END" '
  $0 == begin { skip = 1; next }
  $0 == end   { skip = 0; next }
  !skip { print }
' "$ROOT_ENV" > "$tmp"
{
  cat "$tmp"
  echo "$BEGIN"
  awk '
    match($0, /^[A-Za-z_][A-Za-z0-9_]*=/) {
      k = $0; sub(/=.*/, "", k)
      if (k ~ /^BARRY_(BASE_URL|API_KEY|MODEL|EMBEDDING_MODEL|SEARXNG_URL)$/) next
      if (!(k in val)) order[++n] = k
      val[k] = $0
    }
    END { for (i = 1; i <= n; i++) print val[order[i]] }
  ' "$SBU_ENV"
  echo "$END"
} > "$ROOT_ENV"
rm -f "$tmp"
chmod 644 "$SBU_ENV" "$ROOT_ENV"

echo "  env synced: $ROOT_ENV (compose source) now mirrors $SBU_ENV"
