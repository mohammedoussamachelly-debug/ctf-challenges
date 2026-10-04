FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Install deps first for layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# App source + static frontend
COPY src ./src
COPY public ./public

EXPOSE 4000
CMD ["node", "src/index.js"]
