FROM nginx:1.27-alpine AS assets

# Normalize permissions (755 directories, 644 files) in a build stage. Doing this with RUN in the final image
# would copy every touched file into a new layer and roughly double the image size (~240 MB of sprites & voice).
WORKDIR /site
COPY index.html ./
COPY css/ css/
COPY js/ js/
COPY images/ images/
COPY audio/ audio/
RUN find . -type d -exec chmod 755 {} + \
    && find . -type f -exec chmod 644 {} +

FROM nginx:1.27-alpine

# Remove default nginx welcome assets and install production server config
RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Slopitaire static web assets, already world-readable
COPY --from=assets /site/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1
