# syntax=docker/dockerfile:1

# ----------------------------------------------------------------- build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.base.json tsconfig.server.json tsconfig.web.json vite.config.mts ./
COPY src ./src
RUN npm run build

# Drop dev dependencies from the runtime tree.
RUN npm prune --omit=dev

# --------------------------------------------------------------- runtime stage
FROM node:22-bookworm-slim AS runtime

# samba-common-bin provides smbstatus, smbpasswd, pdbedit and testparm.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      samba \
      samba-common-bin \
      procps \
      tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    PORT=5069 \
    DATA_DIR=/data \
    SAMBA_CONF=/etc/samba/smb.conf \
    SAMBA_MANAGER_CONF=/etc/samba/samba-manager.conf \
    SAMBA_SERVICE=smbd

VOLUME ["/data", "/etc/samba", "/srv/samba"]
EXPOSE 5069 445 139

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5069)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
