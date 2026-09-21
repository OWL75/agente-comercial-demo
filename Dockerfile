# Multi-stage build producing a minimal runtime image via Next.js
# `output: "standalone"` (see next.config.ts) — only traced files + a
# minimal server.js get copied to the final stage, not the full node_modules.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Values here only affect what gets inlined into client bundles at build time
# (NEXT_PUBLIC_*); every server-side var (DATABASE_URL, OPENAI_API_KEY,
# WHATSAPP_*, DEMO_ACCESS_PASSWORD) is read at runtime instead — set those as
# real environment variables on the EasyPanel service, not here.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
