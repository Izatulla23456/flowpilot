# FlowPilot — production-образ
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

EXPOSE 8787
# сервер/data — том с данными (workflows, settings, history)
VOLUME ["/app/server/data"]

CMD ["npx", "tsx", "server/index.ts"]
