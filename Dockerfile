# 微信云托管（绑定 GitHub 仓库）默认只在仓库根目录查找 Dockerfile，
# 所以这里放一份根目录入口；构建上下文 = 仓库根。
# 内容与 cloudrun/Dockerfile 保持一致，改动任意一处请同步另一处。
#
# 若改用「指定 Dockerfile 路径」的方式部署（新建版本 → 高级设置），
# 把路径填成 cloudrun/Dockerfile 即可，此时本文件可以删除。
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# 只装查询层依赖（express + pg），不装主工程的采集/构建依赖
COPY cloudrun/package.json ./package.json
RUN npm install --omit=dev

COPY cloudrun/server.js ./cloudrun/server.js
# 复用主工程的纯函数逻辑（events.js 无外部依赖，dedupe.js 只依赖 events.js）
COPY src/lib/events.js src/lib/dedupe.js ./src/lib/

# 云托管网关默认转发到容器的 80 端口
ENV PORT=80
EXPOSE 80

CMD ["node", "cloudrun/server.js"]
