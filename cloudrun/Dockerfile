# 微信云托管部署用：构建上下文为仓库根目录，Dockerfile 路径填 cloudrun/Dockerfile
# 保留 ../src/lib 依赖（events.js / dedupe.js 为纯函数，直接复用主工程逻辑）
#
# 注意：云托管「绑定 GitHub 仓库」的方式只查找仓库根目录的 Dockerfile，
# 根目录的 Dockerfile 与本文件内容一致（同步维护）。绑定 GitHub 部署时用根目录那份；
# 用「本地代码上传 / 高级设置指定 Dockerfile 路径」时可以用本文件。
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
