FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
