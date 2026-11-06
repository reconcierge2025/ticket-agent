# שרת הסוכן (Railway / כל שרת Docker) – רץ 24/7.
# תמונה של Playwright שכוללת כבר את הדפדפן בגרסה המתאימה (1.48.2).
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

WORKDIR /app
ENV NODE_ENV=production \
    AGENT_DATA_DIR=/data \
    BROWSER_CHANNEL= \
    TZ=Asia/Jerusalem

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY config.example.json ./

# /data = Railway Volume (mount it in the service settings with mount path /data) – watches, records, state
CMD ["node", "src/agent.js", "--server"]
