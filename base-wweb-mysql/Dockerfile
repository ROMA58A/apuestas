FROM node:20-bookworm-slim

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_OPTIONS=--max-old-space-size=384

COPY . .
RUN npm ci
RUN node patch-web-whatsapp-provider.js

CMD ["npm", "start"]
