#!/bin/sh
# Runs as root only long enough to make the data volume writable (volumes created by
# earlier root-run images, or bind mounts, may not be owned by the node user), then
# replaces itself with the app running as `node`.
set -e

chown -R node:node /app/data
exec setpriv --reuid=node --regid=node --init-groups -- "$@"
