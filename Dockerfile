FROM node:20-alpine3.19 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN npm run db:generate && npm run build

FROM node:20-alpine3.19 AS runner
WORKDIR /app
RUN apk add --no-cache openssl \
  && addgroup -g 1001 -S nodejs \
  && adduser -S -u 1001 -G nodejs nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=13003
ENV HOSTNAME=0.0.0.0
# 图片存储目录：容器内固定 /app/uploads，由宿主机挂载持久化
ENV UPLOAD_DIR=/app/uploads

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 预建图片目录，保证以 nextjs 用户运行时可直接写盘
RUN mkdir -p /app/uploads/images && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 13003
CMD ["node","server.js"]
