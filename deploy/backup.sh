#!/bin/sh
# Backs up a Chinchi install: the database and the stored files, in one archive.
# Run next to docker-compose.yml:   ./backup.sh [directory]   (default: ./backups)
#
# The server is stopped while the copy is made (usually seconds), so the database and the files
# match. Not included, keep them apart from the backups: .env, above all S3_KMS_MASTER_KEY,
# without which the stored files can't be read back.
set -eu

out_dir=${1:-./backups}
project=chinchi
stamp=$(date +%Y-%m-%d-%H%M%S)
work=$(mktemp -d)
server_stopped=0

cleanup() {
  rm -rf "$work"
  if [ "$server_stopped" = 1 ]; then docker compose start server >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

[ -f docker-compose.yml ] || { echo "Run this next to docker-compose.yml" >&2; exit 1; }
container=$(docker compose ps -q server)
[ -n "$container" ] || { echo "Chinchi is not running (docker compose up -d)" >&2; exit 1; }
image=$(docker inspect --format '{{.Config.Image}}' "$container")
version=${image##*:}

mkdir -p "$out_dir"
echo "Backing up Chinchi $version"

echo "Stopping the server for a consistent copy"
docker compose stop server >/dev/null
server_stopped=1

echo "Dumping the database"
docker compose exec -T postgres pg_dump -U chinchi -d chinchi --format=custom >"$work/database.dump"

echo "Copying the files"
# Streamed out of a throwaway container: no host path to mount, so it works on any Docker host.
docker run --rm -v "${project}_rustfs-data:/data:ro" alpine:3 tar czf - -C /data . \
  >"$work/files.tar.gz"

docker compose start server >/dev/null
server_stopped=0

printf 'version=%s\ncreated=%s\n' "$version" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$work/backup.info"
archive="$out_dir/chinchi-backup-$stamp.tar"
tar cf "$archive" -C "$work" backup.info database.dump files.tar.gz

echo "Done: $archive ($(du -h "$archive" | cut -f1))"
echo "Keep .env (with S3_KMS_MASTER_KEY) safe and apart from this archive."
