#!/bin/bash
set -e

# OpticData — Auto-Deploy Setup
# Run this ON the VPS to enable automatic deploys on git push
# Usage: bash /opt/abovetopsecret-dash/deploy/setup-autodeploy.sh

APP_DIR="/opt/abovetopsecret-dash"
DEPLOY_DIR="$APP_DIR/deploy"

echo "=== OpticData Auto-Deploy Setup ==="

# 1. Generate webhook secret if not already set
if [ ! -f "$DEPLOY_DIR/.env.webhook" ]; then
  WEBHOOK_SECRET=$(openssl rand -hex 32)
  cat > "$DEPLOY_DIR/.env.webhook" << EOF
WEBHOOK_SECRET=${WEBHOOK_SECRET}
WEBHOOK_PORT=9000
EOF
  echo "[1/4] Generated webhook secret"
  echo ""
  echo "  IMPORTANT: Copy this webhook secret — you'll need it for GitHub:"
  echo "  $WEBHOOK_SECRET"
  echo ""
else
  echo "[1/4] Webhook config already exists at $DEPLOY_DIR/.env.webhook"
  WEBHOOK_SECRET=$(grep WEBHOOK_SECRET "$DEPLOY_DIR/.env.webhook" | cut -d= -f2)
fi

# 2. Make deploy script executable
chmod +x "$DEPLOY_DIR/deploy.sh"
echo "[2/4] Deploy script is executable"

# 3. Install and enable systemd service
cp "$DEPLOY_DIR/opticdata-webhook.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable opticdata-webhook
systemctl restart opticdata-webhook
echo "[3/4] Webhook listener service installed and started"

# 4. Open webhook port in firewall (internal only — Caddy proxies from 443)
# Port 9000 stays on 127.0.0.1, no firewall rule needed

# Verify it's running
sleep 2
if systemctl is-active --quiet opticdata-webhook; then
  echo "[4/4] Webhook listener is running on port 9000"
else
  echo "[4/4] WARNING: Webhook listener failed to start. Check: journalctl -u opticdata-webhook"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Now configure the GitHub webhook:"
echo "  1. Go to: https://github.com/slyngg/ad-tracker/settings/hooks/new"
echo "  2. Payload URL: https://optic-data.com/deploy/webhook"
echo "  3. Content type: application/json"
echo "  4. Secret: $WEBHOOK_SECRET"
echo "  5. Events: Just the push event"
echo "  6. Click 'Add webhook'"
echo ""
echo "Test it: git push to main and watch:"
echo "  journalctl -u opticdata-webhook -f"
echo "  tail -f /var/log/opticdata-deploy.log"
