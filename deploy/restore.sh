#!/bin/sh
# Restores a backup made by backup.sh, replacing everything in this install.
# Run next to docker-compose.yml and the same .env (the same S3_KMS_MASTER_KEY):
#
#   ./restore.sh backups/chinchi-backup-2026-10-16-120000.tar [--yes]
#
# The running Chinchi must be the backup's version or newer: migrations only go forward.
set -eu

archive=${1:-}
confirm=${2:-}
project=chinchi

[ -n "$archive" ] && [ -f "$archive" ] || { echo "Usage: ./restore.sh <backup.tar> [--yes]" >&2; exit 1; }
[ -f docker-compose.yml ] || { echo "Run this next to docker-compose.yml" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
tar xf "$archive" -C "$work" 2>/dev/null || { echo "Not a Chinchi backup: $archive" >&2; exit 1; }
for part in backup.info database.dump files.tar.gz; do
  [ -f "$work/$part" ] || { echo "Not a Chinchi backup: $part is missing" >&2; exit 1; }
done
backup_version=$(sed -n 's/^version=//p' "$work/backup.info")

# The version this install runs: the server image docker compose would start.
image=$(docker compose config --images | grep chinchi-server)
version=${image##*:}
oldest=$(printf '%s\n%s\n' "$backup_version" "$version" | sort -V | head -n1)
if [ "$oldest" != "$backup_version" ]; then
  echo "The backup is from Chinchi $backup_version, this install runs $version." >&2
  echo "Set CHINCHI_VERSION=$backup_version (or newer) in .env first." >&2
  exit 1
fi

echo "Restoring Chinchi $backup_version backup into this install ($version)."
echo "Everything stored here now (accounts, messages, files) will be replaced."
if [ "$confirm" != "--yes" ]; then
  printf 'Type "restore" to continue: '
  read -r answer
  [ "$answer" = restore ] || { echo "Cancelled"; exit 1; }
fi

echo "Stopping the server and the storage"
docker compose stop server rustfs >/dev/null
docker compose up -d postgres >/dev/null
until docker compose exec -T postgres pg_isready -U chinchi -d postgres >/dev/null 2>&1; do sleep 1; done

echo "Restoring the database"
docker compose exec -T postgres dropdb -U chinchi --force --if-exists chinchi
docker compose exec -T postgres createdb -U chinchi -O chinchi chinchi
docker compose exec -T postgres pg_restore -U chinchi -d chinchi --no-owner --exit-on-error \
  <"$work/database.dump"

echo "Restoring the files"
docker run --rm -i -v "${project}_rustfs-data:/data" \
  alpine:3@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 \
  sh -c 'find /data -mindepth 1 -delete && tar xzf - -C /data' <"$work/files.tar.gz"

echo "Starting Chinchi"
docker compose up -d >/dev/null
echo "Done. Migrations from $backup_version to $version run as the server starts."
