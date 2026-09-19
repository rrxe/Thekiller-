# Stormy - Dockerfile لنشر البوت + تطبيق الويب على VPS عبر Dokploy
FROM node:20-alpine

WORKDIR /app

# تثبيت الاعتماديات أولًا للاستفادة من كاش الطبقات
COPY package*.json ./
RUN npm install --omit=dev

# نسخ باقي الملفات
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
