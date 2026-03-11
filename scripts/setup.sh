#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== NexusZero Development Setup ==="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install Node.js 20+."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm is required. Run: npm install -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Error: Docker is required."; exit 1; }

NODE_VERSION=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Error: Node.js 20+ required. Current: $(node -v)"
  exit 1
fi

echo "✓ Prerequisites met (Node $(node -v), pnpm $(pnpm -v), Docker)"
echo ""

# Copy .env if missing
if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "✓ Created .env from .env.example"
  echo "  → Edit .env with your API keys before running services"
else
  echo "✓ .env already exists"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
cd "$ROOT_DIR"
pnpm install

# Start infrastructure
echo ""
echo "Starting infrastructure (Postgres, Redis, ClickHouse, MinIO)..."
docker compose up -d

echo "Waiting for services to be healthy..."
sleep 5

# Wait for Postgres
until docker compose exec -T postgres pg_isready -U nexuszero >/dev/null 2>&1; do
  echo "  Waiting for Postgres..."
  sleep 2
done
echo "✓ Postgres is ready"

# Wait for Redis
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  echo "  Waiting for Redis..."
  sleep 2
done
echo "✓ Redis is ready"

echo "✓ ClickHouse is starting (may take a moment)"
echo "✓ MinIO is starting (S3-compatible storage)"

# Run database migrations
echo ""
echo "Running database migrations..."
cd "$ROOT_DIR/packages/db"
pnpm drizzle-kit push 2>/dev/null || echo "  (Migrations will run when drizzle-kit is configured)"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Services:"
echo "  Postgres:   postgresql://nexuszero:nexuszero_dev@localhost:5432/nexuszero"
echo "  Redis:      redis://localhost:6379"
echo "  ClickHouse: http://localhost:8123 (user: nexuszero)"
echo "  MinIO:      http://localhost:9001 (user: nexuszero)"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys (Anthropic, OpenAI, etc.)"
echo "  2. Run: pnpm dev"
