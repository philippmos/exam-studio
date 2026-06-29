#!/bin/sh
# Render the SPA's runtime config from environment variables at container start.
# This is what lets one image run in any environment ("build once, deploy
# anywhere"): nginx serves the generated /config.json, which the Angular app
# fetches before it boots. Executed by the nginx image's /docker-entrypoint.d
# hook before nginx starts. envsubst ships with the official nginx image.
set -eu

template="/config.template.json"
output="/usr/share/nginx/html/config.json"

# Behind nginx the browser calls the proxied relative path by default.
export GRAPHQL_URL="${GRAPHQL_URL:-/graphql}"

# Only substitute the known variables, so any other $… in the file is preserved.
envsubst '${GRAPHQL_URL} ${AUTH0_DOMAIN} ${AUTH0_CLIENT_ID} ${AUTH0_AUDIENCE}' \
  <"$template" >"$output"

echo "[40-render-config] wrote $output"
