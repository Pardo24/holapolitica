#!/bin/sh
# Weekly mail: who used the API from outside the site last week, by IP or
# by download key (with who asked for it). Counters are kept by the
# backend (app/core/api_access.py); the report is app/services/api_usage.py.
set -eu
REPORT=$(docker exec holapolitica-backend-1 python -m app.services.api_usage 2>/dev/null)
printf '%s\n' "$REPORT" | /opt/holapolitica/ops/notify.sh "Hola Politica: us extern de l'API"
