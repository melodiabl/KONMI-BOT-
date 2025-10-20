FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install
COPY . .
RUN npm run build || true

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app .
RUN npm ci --omit=dev || npm install
EXPOSE 3001
CMD ["node", "index.js"]
