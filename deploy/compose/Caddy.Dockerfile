# Bakes the Caddyfile into the image (avoids single-file bind-mount issues on
# some Docker setups). Config is still env-driven via SV_DOMAIN / SV_TLS_EMAIL.
FROM caddy:2-alpine
COPY deploy/compose/Caddyfile /etc/caddy/Caddyfile
