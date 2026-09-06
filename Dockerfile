# OpenEir — production container
# Build:  docker build -t openeir .
# Run:    see docker-compose.yml (profiles: core, ai, bluetooth, agent)

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=file:/app/db/custom.db
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run db:generate && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/db/custom.db
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# create non-root user
RUN adduser --disabled-password --gecos "" openeir
RUN mkdir -p /app/db && chown -R openeir:openeir /app

COPY --from=build --chown=openeir:openeir /app/.next/standalone ./
COPY --from=build --chown=openeir:openeir /app/.next/static ./.next/static
COPY --from=build --chown=openeir:openeir /app/public ./public
COPY --from=build --chown=openeir:openeir /app/prisma ./prisma
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER openeir
VOLUME ["/app/db"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["server"]
