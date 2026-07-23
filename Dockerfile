# Imagen base: Node 22 slim (Debian bookworm). Necesario para Supabase JS
# v2 (WebSocket nativo desde Node 22 sin flag).
FROM node:22-bookworm-slim

# Dependencias del sistema para Playwright + Chromium headless.
# Lista curada — es lo mínimo que Chrome requiere en Debian slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos package.json PRIMERO para aprovechar el cache de Docker.
# Un cambio de código sin cambiar deps ya no fuerza a re-instalar npm.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false --no-audit --no-fund

# Playwright chromium — descarga el binario (no re-instala deps del OS
# porque ya están arriba).
RUN npx playwright install chromium

# Copiamos el resto del código.
COPY . .

# Aseguramos que el script del pipeline sea ejecutable.
RUN chmod +x scripts/run-pipeline.sh

# Comando por defecto (Railway lo override con startCommand si aplica).
CMD ["bash", "scripts/run-pipeline.sh"]
