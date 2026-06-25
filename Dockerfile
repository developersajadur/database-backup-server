FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y postgresql-client curl && \
    curl https://rclone.org/install.sh | bash && \
    rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

CMD ["node", "dist/index.js"]