#!/bin/bash
set -e

# OpticData — Auto-deploy script
# Called by the webhook listener on git push to main
# Pulls latest code, rebuilds containers, and restarts services

APP_DIR="/opt/abovetopsecret-dash"
DEPLOY_DIR="$APP_DIR/deploy"
LOG_FILE="/var/log/opticdata-deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Deploy triggered ==="

cd "$APP_DIR"

# Pull latest code
log "Pulling latest from origin/main..."
git fetch origin
git reset --hard origin/main

# Rebuild and restart containers
log "Rebuilding containers..."
cd "$DEPLOY_DIR"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build 2>&1 | tee -a "$LOG_FILE"

# Prune old images to save disk space
log "Pruning unused images..."
docker image prune -f >> "$LOG_FILE" 2>&1

log "=== Deploy complete ==="
