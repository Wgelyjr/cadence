#!/usr/bin/env bash
# Apply (or re-apply) all SQL migrations to the local Supabase stack.
#
# Migrations live in supabase/migrations/ and are written to be idempotent
# (IF NOT EXISTS / CREATE OR REPLACE), so re-running is safe. They cannot be
# applied at postgres first-init time because 0001_init.sql references
# auth.users, which gotrue creates when the auth service starts.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_SVC=${DB_SERVICE:-db}
PSQL=(docker compose exec -T "$DB_SVC" psql
  --username=postgres --no-password --no-psqlrc
  --single-transaction -v ON_ERROR_STOP=1
  --dbname=postgres)

if [ ! -d supabase/migrations ]; then
  echo "no supabase/migrations directory — nothing to do" >&2
  exit 0
fi

for f in $(ls supabase/migrations/*.sql 2>/dev/null | sort); do
  echo "applying $f ..."
  "${PSQL[@]}" < "$f" > /dev/null
done

count=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l)
echo "applied $count migration file(s)"
