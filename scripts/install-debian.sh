#!/usr/bin/env bash
# One-time setup for a Debian VM: Docker, the directory layout, and the
# ownership the app needs. Idempotent — safe to run again.
#
#   sudo ./scripts/install-debian.sh
#
# Afterwards: fill in .env and run `docker compose up -d`.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

# The user who invoked sudo is the one who should be able to talk to Docker.
TARGET_USER="${SUDO_USER:-root}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$(dirname "$REPO")/gameshelf-data"

say() { printf '\n== %s\n' "$*"; }

if ! grep -qi debian /etc/os-release; then
  echo "This expects Debian. Continuing anyway, but check the package names." >&2
fi

# ---------------------------------------------------------------- docker
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  say "Docker already present: $(docker --version)"
else
  apt-get update -qq

  # Debian packages Docker itself, which is two packages and no third-party
  # repository. Plenty for two containers. The official repo is the fallback for
  # releases that do not carry compose v2 yet.
  if apt-cache show docker.io >/dev/null 2>&1 && apt-cache show docker-compose-v2 >/dev/null 2>&1; then
    say "Installing Docker from Debian's own packages"
    apt-get install -y -qq docker.io docker-compose-v2
  else
    say "Debian has no compose v2 package here; using Docker's repository"
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg |
      gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
      docker-buildx-plugin docker-compose-plugin
  fi

  systemctl enable --now docker
fi

if [ "$TARGET_USER" != "root" ]; then
  say "Letting $TARGET_USER use Docker without sudo"
  usermod -aG docker "$TARGET_USER"
fi

# ------------------------------------------------------------------ data
say "Creating $DATA"
mkdir -p "$DATA/pgdata" "$DATA/covers"

# The app runs as uid 1001 inside its container, and a bind mount keeps the
# host's ownership, so without this the first cover download fails with EACCES.
chown -R 1001:1001 "$DATA/covers"
[ "$TARGET_USER" != "root" ] && chown "$TARGET_USER" "$DATA" || true

# ------------------------------------------------------------------- env
if [ ! -f "$REPO/.env" ]; then
  say "Creating .env from the template"
  cp "$REPO/.env.example" "$REPO/.env"
  [ "$TARGET_USER" != "root" ] && chown "$TARGET_USER" "$REPO/.env" || true
  chmod 600 "$REPO/.env"
fi

cat <<DONE

== Done

  docker    $(docker --version 2>/dev/null || echo 'not on PATH yet')
  compose   $(docker compose version --short 2>/dev/null || echo 'not on PATH yet')
  data      $DATA

Next:

  1. Edit $REPO/.env
       POSTGRES_PASSWORD, SESSION_SECRET  — openssl rand -base64 32
       IGDB_CLIENT_ID / IGDB_CLIENT_SECRET, SGDB_API_KEY
       ORIGIN                             — the public https:// URL
       ADMIN_PASSWORD                     — ADMIN_USERNAME defaults to admin
       AUTH_DISABLED=true                 — only if the port is private

  2. Log out and back in, so the docker group applies.

  3. cd $REPO && docker compose up -d

DONE
