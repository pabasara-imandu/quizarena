# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Optional deps (redis, @anthropic-ai/sdk) are included: they are what the
# Redis adapter and the quiz generator need when their env vars are set.
RUN npm ci --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

EXPOSE 4000
USER node

# Container-level health so an orchestrator restarts a wedged process rather
# than leaving a class staring at a dead room.
HEALTHCHECK --interval=30s --timeout=4s --start-period=8s --retries=3   CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
