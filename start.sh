#!/usr/bin/env bash
set -euo pipefail

APP_NAME="daily-log"
IMAGE_NAME="daily-log"
PORT=9999
DB_FILE="db.sqlite"

# Ensure database file exists on host
if [[ ! -f "$DB_FILE" ]]; then
  touch "$DB_FILE"
fi

# Build image
docker build -t "$IMAGE_NAME" .

# Remove existing container if present
if docker ps -a --format '{{.Names}}' | grep -q "^${APP_NAME}$"; then
  docker rm -f "$APP_NAME" >/dev/null
fi

# Run container with DB mapped to host file
docker run -d --name "$APP_NAME" \
  -p "${PORT}:${PORT}" \
  -v "$(pwd)/${DB_FILE}:/app/db.sqlite" \
  -e "DATABASE_URL=file:/app/db.sqlite" \
  "$IMAGE_NAME"
