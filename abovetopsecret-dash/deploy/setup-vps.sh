#!/bin/bash
set -e

# OpticData — VPS Setup Script
# Run on a fresh Ubuntu 22.04+ VPS (e.g. Hetzner)
# Usage: curl -sSL <raw-url> | bash
# Or: chmod +x setup-vps.sh && ./setup-vps.sh

echo "=== OpticData Command Center — VPS Setup ==="

# 1. System updates
echo "[1/6] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Docker
if ! command -v docker &> /dev/null; then
  echo "[2/6] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "[2/6] Docker already installed"
fi

# 3. Install Docker Compose plugin
if ! docker compose version &> /dev/null; then
  echo "[3/6] Installing Docker Compose..."
  apt-get install -y -qq docker-compose-plugin
else
  echo "[3/6] Docker Compose already installed"
fi

# 4. Configure firewall
echo "[4/6] Configuring firewall..."
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 5. Clone repo and configure
echo "[5/6] Setting up application..."
REPO_DIR="/opt/abovetopsecret-dash"
DEPLOY_DIR="$REPO_DIR/abovetopsecret-dash/deploy"

if [ ! -d "$REPO_DIR" ]; then
  read -p "Enter git repository URL: " REPO_URL
  git clone "$REPO_URL" "$REPO_DIR"
else
  echo "App directory exists, pulling latest..."
  cd "$REPO_DIR" && git pull
fi

# Create .env if it doesn't exist
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "Creating environment configuration..."

  read -p "Enter domain name (e.g. dash.example.com): " DOMAIN
  read -sp "Enter database password: " DB_PASSWORD && echo
  read -sp "Enter dashboard auth token: " AUTH_TOKEN && echo

  cat > "$DEPLOY_DIR/.env" << ENVEOF
DOMAIN=${DOMAIN}
DB_PASSWORD=${DB_PASSWORD}
AUTH_TOKEN=${AUTH_TOKEN}
FB_ACCESS_TOKEN=
FB_AD_ACCOUNT_IDS=
CC_WEBHOOK_SECRET=
SHOPIFY_WEBHOOK_SECRET=
ENVEOF

  echo "Environment file created at $DEPLOY_DIR/.env"
  echo "You can configure FB/CC/Shopify credentials from the Settings UI after deploy."
fi

# 6. Start services
echo "[6/6] Starting services..."
cd "$DEPLOY_DIR"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo ""
echo "=== Setup Complete ==="
echo "Dashboard: https://${DOMAIN:-$(curl -s ifconfig.me)}"
echo ""
echo "Next steps:"
echo "  1. Point your domain's DNS A record to this server's IP: $(curl -s ifconfig.me)"
echo "  2. Open the dashboard and configure integrations in Settings"
echo "  3. SSL certificate will be auto-provisioned by Caddy on first request"
echo "  4. Run: bash $DEPLOY_DIR/setup-autodeploy.sh  to enable auto-deploy on git push"
echo ""
echo "Useful commands:"
echo "  cd $DEPLOY_DIR"
echo "  docker compose -f docker-compose.prod.yml logs -f        # View logs"
echo "  docker compose -f docker-compose.prod.yml restart         # Restart"
echo "  docker compose -f docker-compose.prod.yml down            # Stop"
echo "  docker compose -f docker-compose.prod.yml up -d --build   # Rebuild & start"
