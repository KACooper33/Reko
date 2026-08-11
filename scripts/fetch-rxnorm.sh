#!/usr/bin/env bash
#
# A2 — fetch the RxNorm full monthly release (RRF) from UMLS.
#
#   ./scripts/fetch-rxnorm.sh [MMDDYYYY]
#
# With no argument it asks rxnav for the current release date, so the usual case
# is just `./scripts/fetch-rxnorm.sh`.
#
# Requires UMLS_API_KEY in .env — which .gitignore covers. Get a key by
# registering for a UMLS account and accepting the Metathesaurus licence:
# https://uts.nlm.nih.gov/uts/signup-login
#
# The key is never echoed and never appears on a command line. curl reads it
# from a 0600 temp file that is deleted on exit, so it stays out of `ps` output.
#
# The download lands in data/raw/, which is gitignored. RxNorm is licensed —
# never commit it. Re-running resumes a partial download rather than restarting.

set -euo pipefail
cd "$(dirname "$0")/.."

DEST="data/raw"

# ---- release date -----------------------------------------------------------
if [ $# -ge 1 ]; then
  RELEASE="$1"
else
  echo "Asking rxnav for the current release..."
  RELEASE="$(curl -s --max-time 30 https://rxnav.nlm.nih.gov/REST/version.json |
    python3 -c '
import json,sys,datetime
v=json.load(sys.stdin)["version"]              # e.g. 03-Aug-2026
print(datetime.datetime.strptime(v,"%d-%b-%Y").strftime("%m%d%Y"))')"
fi

FILE="RxNorm_full_${RELEASE}.zip"
SRC="https://download.nlm.nih.gov/umls/kss/rxnorm/${FILE}"
echo "Release:     ${RELEASE}"
echo "Destination: ${DEST}/${FILE}"

# ---- credentials ------------------------------------------------------------
if [ ! -f .env ]; then
  echo "error: no .env. Add UMLS_API_KEY=<your key> to it." >&2
  exit 1
fi
set -a; . ./.env; set +a
: "${UMLS_API_KEY:?UMLS_API_KEY is not set in .env}"

mkdir -p "$DEST"

# ---- download ---------------------------------------------------------------
# The inner URL is a query-parameter value, so it must be percent-encoded.
ENC_SRC="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$SRC")"

CFG="$(mktemp)"
chmod 600 "$CFG"
trap 'rm -f "$CFG"' EXIT
printf 'url = "https://uts-ws.nlm.nih.gov/download?url=%s&apiKey=%s"\n' "$ENC_SRC" "$UMLS_API_KEY" > "$CFG"

curl --config "$CFG" \
     --location --fail --show-error \
     --retry 3 --retry-delay 5 \
     --continue-at - \
     --output "$DEST/$FILE" || {
  status=$?
  # 33 means the server refused a range request; a fresh start is the fix.
  if [ "$status" -eq 33 ]; then
    echo "Server refused resume; restarting the download."
    curl --config "$CFG" --location --fail --show-error --output "$DEST/$FILE"
  else
    echo "error: download failed (curl $status)." >&2
    echo "A 401 or an HTML body usually means the key is wrong or the licence" >&2
    echo "is not yet accepted. Check https://uts.nlm.nih.gov/uts/profile" >&2
    exit "$status"
  fi
}

# ---- verify -----------------------------------------------------------------
# A failed auth often returns an HTML error page with a 200, so check the magic
# bytes rather than trusting the status code.
if ! unzip -tq "$DEST/$FILE" >/dev/null 2>&1; then
  echo "error: ${FILE} is not a valid zip. First bytes:" >&2
  head -c 200 "$DEST/$FILE" >&2; echo >&2
  echo "This is usually an auth failure returned as HTML." >&2
  exit 1
fi

echo
echo "OK  $(du -h "$DEST/$FILE" | cut -f1)  ${DEST}/${FILE}"
echo "Contents (RRF files only, largest first):"
unzip -l "$DEST/$FILE" | awk '/\.RRF/ {printf "  %10.1f MB  %s\n", $1/1048576, $4}' | sort -rn | head -12
