#!/usr/bin/env bash
# Turns on the Telegram bot and voice input for the Planovik server.
# Run on the server:  sudo bash deploy/setup-telegram.sh
# Safe to re-run: keeps existing values, only asks for what is missing.
set -euo pipefail
ENV_FILE=/etc/planovik.env
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Сначала установите сервер: sudo bash deploy/install.sh"; exit 1; }

if ! grep -q '^TG_RELAY_SECRET=' "$ENV_FILE"; then
  echo "TG_RELAY_SECRET=$(openssl rand -hex 24)" >> "$ENV_FILE"
fi
if ! grep -q '^SPEECHKIT_API_KEY=' "$ENV_FILE"; then
  echo "API-ключ сервисного аккаунта Yandex Cloud с ролью ai.speechkit-stt.user."
  read -rsp "Вставьте ключ (Enter — пропустить, голос можно включить позже): " KEY; echo
  [ -n "$KEY" ] && echo "SPEECHKIT_API_KEY=$KEY" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
systemctl restart planovik
sleep 2
journalctl -u planovik -n 1 --no-pager -o cat

echo
echo "Секрет для Cloudflare Worker (переменная RELAY_SECRET):"
echo "  $(grep '^TG_RELAY_SECRET=' "$ENV_FILE" | cut -d= -f2)"
echo "Посмотреть позже: sudo grep TG_RELAY_SECRET $ENV_FILE"
