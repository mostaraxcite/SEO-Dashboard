#!/usr/bin/env bash
# Logical backup of the whole database (custom format). Usage: scripts/backup.sh [outfile]
# Uses DATABASE_OWNER_URL from the environment or .env. Store backups encrypted and off-host.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_OWNER_URL:-}" ] && [ -f .env ]; then export "$(grep -E '^DATABASE_OWNER_URL=' .env | xargs)"; fi
: "${DATABASE_OWNER_URL:?DATABASE_OWNER_URL is required}"
mkdir -p backups
out="${1:-backups/projecthub-$(date -u +%Y%m%dT%H%M%SZ).dump}"
pg_dump --format=custom --no-owner --dbname="$DATABASE_OWNER_URL" --file="$out"
echo "Backup written to $out"
