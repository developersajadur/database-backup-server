FROM node:20-alpine

RUN apk add --no-cache postgresql-client rclone

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

ENV BACKUP_DIR=/app/backups

RUN mkdir -p ${BACKUP_DIR}

CMD ["node", "dist/index.js"]
