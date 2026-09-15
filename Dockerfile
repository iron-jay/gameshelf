# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# Migrations and the first user.
#
# These cannot run from the runtime image: drizzle-kit and tsx are dev
# dependencies, and .next/standalone contains only what Next traced from the
# app's own imports. So they get a stage that keeps node_modules, and compose
# runs it to completion before the app starts.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY lib ./lib
# Not `npm run db:seed`: that script passes --env-file=.env, and there is no
# .env in a container — the environment comes from compose.
CMD ["sh", "-c", "npx drizzle-kit migrate && npx tsx scripts/seed.ts"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Cover art lives on a bind mount. Creating it here only helps when nothing is
# mounted over it; when something is, the host directory's ownership is what
# counts, which is why the deploy steps chown it to this uid.
RUN mkdir -p /data/covers && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
