#!/bin/sh
# Send an operations alert by email, reusing the backend's own SMTP
# credentials so there is no second mail setup to keep alive.
#
#   printf 'body text\n' | ops/notify.sh "Subject line"
#
# Recipient comes from OPS_ALERT_EMAIL in /opt/holapolitica/.env (the
# compose env file, root-600). Silently does nothing when it is unset, so a
# box without the variable never fails a backup over a missing mailbox.
set -eu

SUBJECT="${1:?usage: notify.sh SUBJECT (body on stdin)}"
BODY=$(cat)

ENV_FILE="${HOLAPOLITICA_ENV:-/opt/holapolitica/.env}"
TO=$(grep -E '^OPS_ALERT_EMAIL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)
if [ -z "${TO:-}" ]; then
  echo "notify: OPS_ALERT_EMAIL not set in $ENV_FILE, dropping: $SUBJECT" >&2
  exit 0
fi

# The mail goes out from inside the backend container: it already holds
# SMTP_HOST / SMTP_USERNAME / SMTP_PASSWORD, and smtplib is in the stdlib,
# so nothing new is installed on the host.
docker exec -i \
  -e "OPS_TO=$TO" \
  -e "OPS_SUBJECT=$SUBJECT" \
  -e "OPS_BODY=$BODY" \
  holapolitica-backend-1 python - <<'PY'
import os
import smtplib
import ssl
from email.message import EmailMessage

host = os.environ.get("SMTP_HOST")
if not host:
    raise SystemExit("SMTP_HOST is not configured in the backend container")

msg = EmailMessage()
msg["From"] = "%s <%s>" % (
    os.environ.get("SMTP_FROM_NAME", "Hola Política"),
    os.environ.get("SMTP_FROM_EMAIL", "noreply@holapolitica.org"),
)
msg["To"] = os.environ["OPS_TO"]
msg["Subject"] = os.environ["OPS_SUBJECT"]
msg.set_content(os.environ.get("OPS_BODY", ""))

port = int(os.environ.get("SMTP_PORT", "587"))
with smtplib.SMTP(host, port, timeout=30) as s:
    s.starttls(context=ssl.create_default_context())
    user = os.environ.get("SMTP_USERNAME")
    if user:
        s.login(user, os.environ.get("SMTP_PASSWORD", ""))
    s.send_message(msg)
PY
