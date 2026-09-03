# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Leave this EMPTY for a reverse-proxy deployment: the client then talks to its
# own origin and one image works on any domain. Set it only when the server
# lives on a different host (see DEPLOY.md).
ARG NEXT_PUBLIC_SERVER_URL=""
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_TELEMETRY_DISABLED=1
# Opts this build into the self-contained output the runtime stage copies.
ENV BUILD_STANDALONE=true

RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Next's standalone server binds localhost by default, which is unreachable
# from outside the container.
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
USER node
CMD ["node", "server.js"]
