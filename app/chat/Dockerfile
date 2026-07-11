# Chat backend container image for Cloud Run. Built with `docker build` on the
# CI runner and pushed to Artifact Registry tagged by commit SHA (IMDB-12),
# mirroring linear-example's backend Dockerfile.
FROM node:24-slim

WORKDIR /app

# Manifests first so the dependency layer caches: a src edit rebuilds in
# seconds instead of re-running npm ci. mcp-graphql is a production dependency
# — the server spawns its dist entry from node_modules per chat request.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Drop root: run as the unprivileged `node` user baked into the base image.
USER node

# Plain `node` — no `--env-file`. Cloud Run has no .env; ANTHROPIC_API_KEY is
# injected from Secret Manager into the real process environment. The
# `--env-file-if-exists` in the npm start script is local-dev only and must not
# leak into the container. The server listens on process.env.PORT.
CMD ["node", "src/server.js"]
