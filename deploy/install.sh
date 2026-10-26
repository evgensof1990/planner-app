#!/usr/bin/env bash
# Installs or updates the Planovik server on Ubuntu with nginx.
# Run on the server from the repository checkout:  sudo bash deploy/install.sh
# Safe to re-run: keeps /etc/planovik.env and the data in /var/lib/planovik.
set -euo pipefail

DOMAIN="${DOMAIN:-plan.myrenthub.ru}"
APP_DIR=/opt/planovik
ENV_FILE=/etc/planovik.env
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

[ "$(id -u)" = 0 ] || { echo "Запустите через sudo"; exit 1; }

# 1. Node.js >= 18 available system-wide (services cannot use a per-user nvm install)
NODE_BIN="$(PATH=/usr/local/bin:/usr/bin:/bin command -v node || true)"
if [ -z "$NODE_BIN" ] || [ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Нужен Node.js 18+ в /usr/bin или /usr/local/bin. Сейчас: ${NODE_BIN:-не найден}"
  echo "Установка: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi
echo "Node.js: $NODE_BIN $("$NODE_BIN" -v)"

# 2. Code: only what the server needs (no node_modules, no dependencies)
id planovik >/dev/null 2>&1 || useradd --system --home /var/lib/planovik --shell /usr/sbin/nologin planovik
mkdir -p "$APP_DIR" /var/lib/planovik
rm -rf "$APP_DIR/server" "$APP_DIR/src"
cp -r "$SRC_DIR/server" "$APP_DIR/server"
mkdir -p "$APP_DIR/src"
cp "$SRC_DIR/src/sync.js" "$SRC_DIR/src/icalparse.js" "$SRC_DIR/src/date.js" "$SRC_DIR/src/scheduler.js" "$SRC_DIR/src/quickparse.js" "$APP_DIR/src/"
echo '{"type":"module"}' > "$APP_DIR/package.json"
chown -R planovik:planovik /var/lib/planovik
chmod 700 /var/lib/planovik

# 3. Secrets: asked here, never typed into a chat
if [ ! -f "$ENV_FILE" ]; then
  TOKEN="$(openssl rand -hex 24)"
  read -rp "Логин Яндекса (например, name@yandex.ru): " YLOGIN
  read -rsp "Пароль приложения для Календаря (ввод не отображается): " YPASS; echo
  umask 077
  cat > "$ENV_FILE" <<EOF
PLANNER_TOKEN=$TOKEN
YANDEX_LOGIN=$YLOGIN
YANDEX_APP_PASSWORD=$YPASS
CAL_WORK=Плановик Работа
CAL_PERSONAL=Плановик Личное
PORT=3300
ALLOWED_ORIGINS=https://evgensof1990.github.io,https://$DOMAIN,https://localhost,capacitor://localhost,http://localhost:5173
EOF
  chmod 600 "$ENV_FILE"
  echo
  echo "Ключ доступа для приложения (Настройки → Синхронизация → Свой сервер):"
  echo "  $TOKEN"
  echo "Его можно посмотреть позже: sudo grep PLANNER_TOKEN $ENV_FILE"
  echo
fi

# 4. Service
sed "s|/usr/bin/env node|$NODE_BIN|" "$SRC_DIR/deploy/planovik.service" > /etc/systemd/system/planovik.service
systemctl daemon-reload
systemctl enable planovik >/dev/null
systemctl restart planovik

# 5. nginx site + HTTPS
if [ ! -f /etc/nginx/sites-available/planovik.conf ]; then
  sed "s/plan.myrenthub.ru/$DOMAIN/" "$SRC_DIR/deploy/nginx-plan.conf" > /etc/nginx/sites-available/planovik.conf
  ln -sf /etc/nginx/sites-available/planovik.conf /etc/nginx/sites-enabled/planovik.conf
  nginx -t && systemctl reload nginx
  if command -v certbot >/dev/null; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email || echo "certbot не выпустил сертификат: проверьте, что A-запись $DOMAIN указывает на этот сервер, и запустите: sudo certbot --nginx -d $DOMAIN"
  else
    echo "certbot не найден: sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d $DOMAIN"
  fi
fi

sleep 2
systemctl --no-pager --lines=5 status planovik || true
curl -fsS "http://127.0.0.1:3300/api/health" && echo " — сервер отвечает"
