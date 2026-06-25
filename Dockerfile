FROM node:22-bookworm-slim

WORKDIR /app

# Install PostgreSQL client & rclone
RUN apt-get update && \
    apt-get install -y postgresql-client curl && \
    curl -fsSL https://rclone.org/install.sh | bash && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

CMD ["npm", "start"]