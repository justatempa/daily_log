FROM node:20-alpine3.19 AS deps
WORKDIR /app

# Runtime deps for Prisma and Node on Alpine
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
# Install full deps for build (Tailwind/TS are dev deps)
RUN npm ci

FROM node:20-alpine3.19 AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run db:generate && npm run build

FROM node:20-alpine3.19 AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=9999
ENV HOSTNAME=0.0.0.0

# Standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 9999

CMD ["node","server.js"]
