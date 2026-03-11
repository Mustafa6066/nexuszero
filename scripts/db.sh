#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== NexusZero Database Migration ==="

cd "$ROOT_DIR/packages/db"

case "${1:-push}" in
  push)
    echo "Pushing schema to database..."
    pnpm drizzle-kit push
    ;;
  generate)
    echo "Generating migration files..."
    pnpm drizzle-kit generate
    ;;
  migrate)
    echo "Running migrations..."
    pnpm drizzle-kit migrate
    ;;
  studio)
    echo "Opening Drizzle Studio..."
    pnpm drizzle-kit studio
    ;;
  seed)
    echo "Seeding database..."
    npx tsx src/seed.ts
    ;;
  rls)
    echo "Applying RLS policies..."
    PGPASSWORD="${PGPASSWORD:-nexuszero_dev}" psql \
      -h "${PGHOST:-localhost}" \
      -U "${PGUSER:-nexuszero}" \
      -d "${PGDATABASE:-nexuszero}" \
      -f src/rls-policies.sql
    ;;
  *)
    echo "Usage: $0 {push|generate|migrate|studio|seed|rls}"
    exit 1
    ;;
esac

echo "Done!"
