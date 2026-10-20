#!/bin/sh
# Backs up a Chinchi install: the database and the stored files, in one archive.
# Run next to docker-compose.yml:   ./backup.sh [directory]   (default: ./backups)
#
# The server is stopped while the copy is made (usually seconds), so the database and the files
# match. Not included, keep them apart from the backups: .env, above all S3_KMS_MASTER_KEY,
# without which the stored files can't be read back.
#
# With BACKUP_PASSPHRASE set, the archive is encrypted (openssl, AES-256-CBC, PBKDF2) and gets
# the .enc suffix; restore.sh needs the same passphrase. Without it the database dump inside
# is plain for anyone who gets hold of the archive.
set -eu
# The dump inside holds every message and account: nothing here is readable by other users of
# the host, whatever umask the shell that runs this has.
umask 077

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
encrypt=0
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  command -v openssl >/dev/null 2>&1 || { echo "BACKUP_PASSPHRASE is set but openssl is not installed" >&2; exit 1; }
  encrypt=1
fi
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
docker run --rm -v "${project}_rustfs-data:/data:ro" \
  alpine:3@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 \
  tar czf - -C /data . \
  >"$work/files.tar.gz"

docker compose start server >/dev/null
server_stopped=0

printf 'version=%s\ncreated=%s\n' "$version" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$work/backup.info"
tar cf "$work/backup.tar" -C "$work" backup.info database.dump files.tar.gz
if [ "$encrypt" = 1 ]; then
  archive="$out_dir/chinchi-backup-$stamp.tar.enc"
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE \
    -in "$work/backup.tar" -out "$archive"
else
  archive="$out_dir/chinchi-backup-$stamp.tar"
  mv "$work/backup.tar" "$archive"
fi

chmod 600 "$archive"

echo "Done: $archive ($(du -h "$archive" | cut -f1))"
if [ "$encrypt" = 1 ]; then
  echo "Encrypted: restore.sh needs the same BACKUP_PASSPHRASE."
else
  echo "Warning: the archive is not encrypted; the database dump inside it is readable by anyone who gets it."
  echo "Set BACKUP_PASSPHRASE to encrypt backups."
fi
echo "Keep .env (with S3_KMS_MASTER_KEY) safe and apart from this archive."
