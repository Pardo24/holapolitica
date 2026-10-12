#!/usr/bin/env bash
# Deploys a new site image. It is the forced command of the CI deploy key in
# root's authorized_keys, so that key can do this and nothing else:
#
#   command="/opt/holapolitica/ops/deploy-frontend.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-actions-deploy-frontend
#
# Reads a gzipped `docker save` of holapolitica-frontend:latest on stdin
# (.github/workflows/frontend-ci.yml), restarts the site on it and checks it
# answers. If it does not, the previous image goes back up.
set -euo pipefail
cd /opt/holapolitica
compose() { docker compose -f docker-compose.prod.yml "$@" </dev/null; }

if docker image inspect holapolitica-frontend:latest >/dev/null 2>&1; then
  docker tag holapolitica-frontend:latest holapolitica-frontend:previous
fi
gunzip | docker load
compose up -d --force-recreate frontend

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "deployed $(docker image inspect -f '{{.Id}}' holapolitica-frontend:latest | cut -c8-19)"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done

echo "the new image did not answer, rolling back" >&2
if docker image inspect holapolitica-frontend:previous >/dev/null 2>&1; then
  docker tag holapolitica-frontend:previous holapolitica-frontend:latest
  compose up -d --force-recreate frontend
fi
exit 1
