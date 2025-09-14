FROM node:20-alpine

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache git

# Copiar package.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar código fuente
COPY . .

# Crear directorio de autenticación
RUN mkdir -p /app/auth

# Exponer puerto
EXPOSE 3002

# Comando de inicio
CMD ["node", "index.js"]








