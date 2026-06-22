# --- Build stage: install dev deps and compile to dist/ ---
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Drop dev dependencies so only runtime deps are carried forward.
RUN npm prune --omit=dev

# --- Runtime stage: minimal image, non-root user ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as the built-in unprivileged `node` user, not root.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node

# Default to the CLI; override the command to pass a document path.
#   docker run --rm -e ANTHROPIC_API_KEY=... -v "$PWD:/data" doc-extract-agent /data/invoice.pdf
ENTRYPOINT ["node", "dist/cli/index.js"]
