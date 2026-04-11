FROM node:22-slim

WORKDIR /app

# sharp用のネイティブ依存 + fontconfig
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# NotoSansJPフォントをシステムフォントとして登録
RUN mkdir -p /usr/share/fonts/truetype/noto && \
    cp fonts/NotoSansJP-Bold.ttf /usr/share/fonts/truetype/noto/ && \
    fc-cache -fv

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
