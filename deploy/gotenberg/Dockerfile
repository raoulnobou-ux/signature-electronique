# Conversion Word → PDF (LibreOffice) pour QuickSign, protégée par authentification basique.
# Surface minimale : seule la route LibreOffice est ouverte ; Chromium, la fusion PDF, le
# téléchargement d'URL (SSRF) et les webhooks sont désactivés. Le conteneur ne détient
# aucun secret de l'application, aucun accès à la base ni au stockage : il reçoit un
# fichier, renvoie un PDF, et ne garde rien (fichiers temporaires effacés après chaque
# conversion, file d'attente bornée, délai et taille maximum).
#
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
     "--libreoffice-auto-start=true", \
     "--libreoffice-start-timeout=45s", \
     "--chromium-auto-start=false", \
     "--chromium-disable-routes=true", \
     "--pdfengines-disable-routes=true", \
     "--api-disable-download-from=true", \
     "--webhook-deny-private-ips=true", \
     "--webhook-deny-public-ips=true", \
     "--libreoffice-max-queue-size=20", \
     "--prometheus-disable-collect=true", \
     "--log-level=warn"]
