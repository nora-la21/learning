FROM python:3.12-slim

# Install Node.js 22 from NodeSource
RUN apt-get update && apt-get install -y curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build frontend
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend/ ./frontend/
RUN npm run build --prefix frontend

# Install backend
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
RUN mkdir -p backend/static && cp -r frontend/dist/. backend/static/

WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
