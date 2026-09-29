# Conversion Word → PDF (LibreOffice) pour QuickSign, protégée par authentification basique :
# utilisateur « quicksign », mot de passe = GOTENBERG_API_BASIC_AUTH_PASSWORD (= GOTENBERG_TOKEN
# côté application). Le port d'écoute est lu dans $PORT (Render, Railway, Fly.io).
FROM gotenberg/gotenberg:8

ENV GOTENBERG_API_BASIC_AUTH_USERNAME=quicksign \
    PORT=3000

CMD ["gotenberg", \
     "--api-port-from-env=PORT", \
     "--api-enable-basic-auth", \
     "--api-timeout=60s", \
     "--api-body-limit=30MB", \
     "--libreoffice-restart-after=50", \
     "--chromium-auto-start=false", \
     "--log-level=warn"]
