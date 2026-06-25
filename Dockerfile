FROM node:22-bookworm-slim

WORKDIR /app

# Install PostgreSQL client, rclone and required utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        postgresql-client \
        rclone \
        ca-certificates \
        curl && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create backup directory
RUN mkdir -p /app/backups

# Default environment
ENV NODE_ENV=production

# Start service
CMD ["npm", "start"]