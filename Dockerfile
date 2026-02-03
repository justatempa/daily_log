# 使用更具体的Alpine版本以获得更好的可重现性
FROM node:20-alpine3.19 AS deps
WORKDIR /app

# 合并包管理命令，减少层数
RUN apk add --no-cache libc6-compat openssl \
    && apk add --no-cache --virtual .build-deps python3 make g++ git

COPY package.json package-lock.json ./
RUN npm ci --only=production

# 移除构建时依赖
RUN apk del .build-deps

FROM node:20-alpine3.19 AS builder
WORKDIR /app

# 复用deps阶段的包，避免重复安装libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 优化构建参数，减少构建时间
RUN npm run db:generate && \
    npm run build -- --no-lint

FROM node:20-alpine3.19 AS runner
WORKDIR /app

# 创建非root用户运行应用
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    chown -R nextjs:nodejs /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=9999
ENV HOSTNAME=0.0.0.0

# 仅复制必要的文件
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 如果使用Next.js standalone输出模式（需要next.config.js配置）
# 这样可以避免复制整个node_modules

USER nextjs

EXPOSE 3000

# 简化启动命令
CMD ["node", "server.js"]