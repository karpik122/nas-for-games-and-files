#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/karpiknas"
APP_USER="karpiknas"
NODE_VERSION="24.18.0"
ADMIN_USER="admin"
ACCEPT_MINECRAFT_EULA="false"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GENERATED_ADMIN_PASSWORD=""

usage() {
  echo "Użycie: sudo bash install/debian/install.sh [--accept-minecraft-eula] [--admin-user NAZWA]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --accept-minecraft-eula)
      ACCEPT_MINECRAFT_EULA="true"
      shift
      ;;
    --admin-user)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      ADMIN_USER="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Nieznany argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Uruchom instalator przez sudo." >&2; exit 1; }
[[ "$ADMIN_USER" =~ ^[A-Za-z0-9_.-]{1,80}$ ]] || { echo "Nieprawidłowa nazwa administratora." >&2; exit 1; }
[[ -f "$SOURCE_DIR/apps/api/package.json" ]] || { echo "Uruchom skrypt z katalogu projektu KarpikNAS." >&2; exit 1; }

source /etc/os-release
[[ "${ID:-}" == "debian" ]] || { echo "Ten instalator obsługuje wyłącznie Debiana." >&2; exit 1; }
case "${VERSION_ID:-}" in
  12|13) ;;
  *) echo "Obsługiwany jest Debian 12 lub 13." >&2; exit 1 ;;
esac

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl nginx openssl rsync xz-utils

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi

  for conflicting in docker.io docker-compose docker-doc podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$conflicting" 2>/dev/null | grep -q "install ok installed"; then
      echo "Wykryto konfliktujący pakiet $conflicting. Usuń go zgodnie z instrukcją Docker i uruchom instalator ponownie." >&2
      exit 1
    fi
  done

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf '%s\n' \
    'Types: deb' \
    'URIs: https://download.docker.com/linux/debian' \
    "Suites: ${VERSION_CODENAME}" \
    'Components: stable' \
    "Architectures: $(dpkg --print-architecture)" \
    'Signed-By: /etc/apt/keyrings/docker.asc' \
    > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_node() {
  local current_major="0"
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -p 'process.versions.node.split(".")[0]')"
  fi
  if (( current_major >= 24 )); then
    return
  fi

  local machine_arch node_arch archive node_root temp_dir
  machine_arch="$(dpkg --print-architecture)"
  case "$machine_arch" in
    amd64) node_arch="x64" ;;
    arm64) node_arch="arm64" ;;
    *) echo "Node 24 nie jest przygotowany w instalatorze dla architektury $machine_arch." >&2; exit 1 ;;
  esac

  archive="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
  node_root="/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-${node_arch}"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf -- "$temp_dir"' RETURN
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${archive}" -o "$temp_dir/$archive"
  curl -fsSLo "$temp_dir/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  (cd "$temp_dir" && grep "  ${archive}$" SHASUMS256.txt | sha256sum -c -)
  install -d /usr/local/lib/nodejs
  [[ -d "$node_root" ]] || tar -xJf "$temp_dir/$archive" -C /usr/local/lib/nodejs
  ln -sfn "$node_root/bin/node" /usr/local/bin/node
  ln -sfn "$node_root/bin/npm" /usr/local/bin/npm
  ln -sfn "$node_root/bin/npx" /usr/local/bin/npx
  trap - RETURN
  rm -rf -- "$temp_dir"
}

install_docker
install_node
systemctl enable --now docker

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/karpiknas --shell /usr/sbin/nologin "$APP_USER"
fi
usermod -aG docker "$APP_USER"

install -d -m 0755 "$APP_DIR"
if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
  rsync -a \
    --exclude '/.git/' \
    --exclude '/data/' \
    --exclude '/dev-storage/' \
    --exclude '/apps/api/node_modules/' \
    --exclude '/apps/api/dist/' \
    --exclude '/apps/web/node_modules/' \
    --exclude '/apps/web/dist/' \
    --exclude '/game-servers/minecraft/.env' \
    --exclude '/game-servers/minecraft/.secrets/' \
    --exclude '/game-servers/minecraft/data/' \
    "$SOURCE_DIR/" "$APP_DIR/"
fi

install -d -o "$APP_USER" -g "$APP_USER" -m 0750 \
  /var/lib/karpiknas \
  /srv/karpiknas/storage \
  /srv/karpiknas/storage/Projekty \
  /srv/karpiknas/storage/Multimedia \
  /srv/karpiknas/storage/Backup \
  "$APP_DIR/game-servers/minecraft/data" \
  "$APP_DIR/game-servers/minecraft/data/plugins" \
  "$APP_DIR/game-servers/minecraft/.secrets"

if [[ ! -f "$APP_DIR/game-servers/minecraft/data/server.properties" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 0640 \
    "$SOURCE_DIR/game-servers/minecraft/data/server.properties" \
    "$APP_DIR/game-servers/minecraft/data/server.properties"
fi

install -d -m 0750 /etc/karpiknas
if [[ ! -f /etc/karpiknas/karpiknas.env ]]; then
  GENERATED_ADMIN_PASSWORD="$(openssl rand -hex 24)"
  umask 077
  cat > /etc/karpiknas/karpiknas.env <<EOF
NODE_ENV=production
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${GENERATED_ADMIN_PASSWORD}
STORAGE_ROOT=/srv/karpiknas/storage
DATABASE_PATH=/var/lib/karpiknas/karpiknas.sqlite
GAME_SERVERS_ROOT=${APP_DIR}/game-servers
EOF
fi
chown root:"$APP_USER" /etc/karpiknas/karpiknas.env
chmod 0640 /etc/karpiknas/karpiknas.env

for secret_name in minecraft_db_password minecraft_db_root_password; do
  secret_path="$APP_DIR/game-servers/minecraft/.secrets/$secret_name"
  if [[ ! -f "$secret_path" ]]; then
    openssl rand -hex 32 > "$secret_path"
  fi
  chown "$APP_USER":"$APP_USER" "$secret_path"
  chmod 0600 "$secret_path"
done

if [[ ! -f "$APP_DIR/game-servers/minecraft/.env" ]]; then
  eula_value="FALSE"
  [[ "$ACCEPT_MINECRAFT_EULA" == "true" ]] && eula_value="TRUE"
  umask 077
  cat > "$APP_DIR/game-servers/minecraft/.env" <<EOF
MINECRAFT_EULA=${eula_value}
MINECRAFT_PORT=25565
MINECRAFT_TYPE=PAPER
MINECRAFT_VERSION=LATEST
MINECRAFT_MEMORY=4G
MINECRAFT_DB_NAME=minecraft
MINECRAFT_DB_USER=minecraft
TZ=Europe/Warsaw
EOF
fi
chown "$APP_USER":"$APP_USER" "$APP_DIR/game-servers/minecraft/.env"
chmod 0600 "$APP_DIR/game-servers/minecraft/.env"

umask 022
(cd "$APP_DIR/apps/api" && npm ci && npm run build)
(cd "$APP_DIR/apps/web" && npm ci && npm run build)
chown -R root:root "$APP_DIR/apps/api/dist" "$APP_DIR/apps/web/dist"
chmod -R a+rX "$APP_DIR/apps/api/dist" "$APP_DIR/apps/web/dist"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/game-servers/minecraft/data" "$APP_DIR/game-servers/minecraft/.secrets"

install -o root -g root -m 0644 "$APP_DIR/install/debian/karpiknas.service" /etc/systemd/system/karpiknas.service
install -o root -g root -m 0644 "$APP_DIR/install/debian/nginx-karpiknas.conf" /etc/nginx/sites-available/karpiknas
if [[ -e /etc/nginx/sites-enabled/default ]]; then
  if [[ ! -e /etc/nginx/sites-available/default.disabled-by-karpiknas ]]; then
    mv /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default.disabled-by-karpiknas
  else
    unlink /etc/nginx/sites-enabled/default
  fi
fi
ln -sfn /etc/nginx/sites-available/karpiknas /etc/nginx/sites-enabled/karpiknas
nginx -t

systemctl daemon-reload
systemctl enable nginx karpiknas
systemctl restart nginx karpiknas

api_ready="false"
for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    api_ready="true"
    break
  fi
  sleep 1
done
if [[ "$api_ready" != "true" ]]; then
  echo "Usługa KarpikNAS nie uruchomiła się poprawnie." >&2
  journalctl -u karpiknas -n 30 --no-pager >&2
  exit 1
fi

runuser -u "$APP_USER" -- docker compose -f "$APP_DIR/game-servers/minecraft/compose.yaml" config --quiet
runuser -u "$APP_USER" -- docker compose -f "$APP_DIR/game-servers/minecraft/compose.yaml" up -d database
if [[ "$ACCEPT_MINECRAFT_EULA" == "true" ]]; then
  runuser -u "$APP_USER" -- docker compose -f "$APP_DIR/game-servers/minecraft/compose.yaml" up -d minecraft
fi

echo
echo "KarpikNAS został zainstalowany. Otwórz: http://$(hostname -I | awk '{print $1}')/"
echo "Login administratora: $ADMIN_USER"
if [[ -n "$GENERATED_ADMIN_PASSWORD" ]]; then
  echo "Jednorazowo zapisane hasło administratora: $GENERATED_ADMIN_PASSWORD"
else
  echo "Zachowano istniejące hasło z /etc/karpiknas/karpiknas.env"
fi
echo "SQLite: /var/lib/karpiknas/karpiknas.sqlite"
echo "MariaDB dla pluginów: host=database port=3306 baza=minecraft użytkownik=minecraft"
echo "Hasło MariaDB: $APP_DIR/game-servers/minecraft/.secrets/minecraft_db_password"
if [[ "$ACCEPT_MINECRAFT_EULA" != "true" ]]; then
  echo "Minecraft nie został uruchomiony. Po przeczytaniu EULA ustaw MINECRAFT_EULA=TRUE w $APP_DIR/game-servers/minecraft/.env."
fi
