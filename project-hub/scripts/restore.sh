#!/usr/bin/env bash
# Restores a backup produced by backup.sh into DATABASE_OWNER_URL (drops existing objects first).
# Usage: scripts/restore.sh backups/file.dump   — then re-run grants: npm run db:migrate
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_OWNER_URL:-}" ] && [ -f .env ]; then export "$(grep -E '^DATABASE_OWNER_URL=' .env | xargs)"; fi
: "${DATABASE_OWNER_URL:?DATABASE_OWNER_URL is required}"
file="${1:?usage: scripts/restore.sh <dump-file>}"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_OWNER_URL" "$file"
echo "Restored $file"
