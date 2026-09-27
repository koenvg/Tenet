FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html docs.html style.css /srv/site/
COPY fonts/Geist-latin.woff2 fonts/OFL-Geist.txt /srv/site/fonts/

EXPOSE 8080
