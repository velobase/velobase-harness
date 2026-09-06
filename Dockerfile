# =============================================================================
# Unified Dockerfile — supports all SERVICE_MODE values
#
# Multi-stage build: Next.js is built inside Docker, so no pre-built `.next/`
# is required on the host. This also works on Windows (avoids symlink issues).
#
# Build:
#   docker build -t myapp .
#
# Run (examples):
#   docker run -e SERVICE_MODE=web,worker -p 3000:3000 -p 3001:3001 myapp
#   docker run -e SERVICE_MODE=all        -p 3000:3000 -p 3001:3001 -p 3002:3002 myapp
#   docker run -e SERVICE_MODE=web        -p 3000:3000 myapp
#   docker run -e SERVICE_MODE=api        -p 3002:3002 myapp
#   docker run -e SERVICE_MODE=worker     -p 3001:3001 myapp
# =============================================================================

# ── Stage 1: Build ───────────────────────────────────────────────────────────

FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack
RUN corepack enable pnpm

# Install dependencies (layer cache: only re-run when lock file changes)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY prisma ./prisma
RUN pnpm --filter velobase-harness... install --frozen-lockfile --ignore-scripts && \
    pnpm prisma generate

# Copy all source for the build
COPY . .

# Build Next.js (standalone output)
ENV SKIP_ENV_VALIDATION=true
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────

FROM node:20-slim AS runner
WORKDIR /app

# System dependencies for Prisma, Sharp, and fonts
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates fontconfig fonts-liberation && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Install production dependencies + tsx (for API/Worker runtime)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY prisma ./prisma
RUN corepack enable pnpm && \
    pnpm --filter velobase-harness... install --frozen-lockfile --prod --ignore-scripts && \
    pnpm prisma generate && \
    rm -rf /root/.cache

# Create non-root user and logs directory
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    mkdir -p /app/logs && chown appuser:nodejs /app/logs

# --- Next.js standalone build artifacts (for web mode) ---
COPY --from=builder --chown=appuser:nodejs /app/public ./public
COPY --from=builder --chown=appuser:nodejs /app/.next/standalone ./
COPY --from=builder --chown=appuser:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:nodejs /app/next.config.js ./

# --- Source code (for api / worker / standalone modes) ---
COPY --chown=appuser:nodejs src ./src
COPY --chown=appuser:nodejs services ./services
COPY --chown=appuser:nodejs apps/web ./apps/web
COPY --chown=appuser:nodejs tsconfig.json ./

# --- Entrypoint script (runs migrations then starts services) ---
COPY --chown=appuser:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER appuser

# Default: Web + Worker. Expose 3002 only when enabling SERVICE_MODE=api/all.
ENV SERVICE_MODE=web,worker
EXPOSE 3000 3001

CMD ["./docker-entrypoint.sh"]
