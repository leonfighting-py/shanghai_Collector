# 微信云托管部署用：构建上下文为仓库根目录，Dockerfile 路径填 cloudrun/Dockerfile
# 保留 ../src/lib 依赖（events.js / dedupe.js 为纯函数，直接复用主工程逻辑）
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY cloudrun/package.json ./package.json
RUN npm install --omit=dev

COPY cloudrun/server.js ./cloudrun/server.js
COPY src/lib/events.js src/lib/dedupe.js ./src/lib/

# 云托管网关默认转发到容器的 80 端口
ENV PORT=80
EXPOSE 80

CMD ["node", "cloudrun/server.js"]
