FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.mjs ./
COPY harness/ ./harness/
COPY web/ ./web/
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4390 TASK_STORE_PATH=/data/tasks.json HARNESS_STORE_PATH=/data/harness.json INBOX_STORE_PATH=/data/inbox.json
EXPOSE 4390
CMD ["node", "server.mjs"]
