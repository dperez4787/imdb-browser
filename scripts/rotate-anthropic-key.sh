#!/usr/bin/env bash
# Rotate the chat backend's ANTHROPIC_API_KEY.
#
# Get a key at https://console.anthropic.com/settings/keys (Create Key), then:
#   ./scripts/rotate-anthropic-key.sh
#
# The key is read with hidden input and never echoed, logged, or written to disk.
# Cloud Run resolves the :latest secret alias at instance startup, so the script
# forces a new revision after adding the version and waits for /health.
set -euo pipefail

PROJECT=project-d60a83c1-2c60-4d51-ad0
REGION=us-central1
SERVICE=imdb-browser-chat
SECRET=ANTHROPIC_API_KEY

read -rsp "Paste your Anthropic API key (input hidden): " KEY
echo

# Validation: catches the classic paste failures before they reach production.
if [[ "$KEY" != sk-ant-* ]]; then
  echo "ERROR: key must start with 'sk-ant-'." >&2; exit 1
fi
if (( ${#KEY} < 40 )); then
  echo "ERROR: key is only ${#KEY} chars — that's a placeholder, not a real key." >&2; exit 1
fi
if LC_ALL=C grep -q '[^ -~]' <<<"$KEY"; then
  echo "ERROR: key contains non-ASCII characters (smart quote / ellipsis from a paste?)." >&2; exit 1
fi

echo "Adding new secret version…"
printf '%s' "$KEY" | gcloud secrets versions add "$SECRET" --project="$PROJECT" --data-file=-
unset KEY

echo "Forcing a new Cloud Run revision so :latest is re-resolved…"
gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --update-labels="key-rotated=r$(date +%s)" --quiet

URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)')
echo "Waiting for $URL/health…"
for i in $(seq 1 20); do
  if curl -sf --max-time 10 "$URL/health" >/dev/null; then
    echo "Healthy. Old secret versions are still enabled; disable them with:"
    echo "  gcloud secrets versions list $SECRET --project=$PROJECT"
    echo "  gcloud secrets versions disable <N> --secret=$SECRET --project=$PROJECT"
    exit 0
  fi
  sleep 5
done
echo "WARNING: /health did not come back within 100s — check the service logs." >&2
exit 1
