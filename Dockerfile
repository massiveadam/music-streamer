# OpenStream Music Streaming Server
# Multi-stage build for smaller image

# ===== Client Build Stage =====
FROM node:20-slim AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install dependencies (legacy-peer-deps needed for Capacitor version mismatches)
RUN npm ci --legacy-peer-deps

# Copy client source files
COPY client/ ./
COPY types ../types

# Build with empty server URL (same-origin for production)
ENV VITE_SERVER_URL=""
RUN npm run build

# ===== Server Build Stage =====
FROM node:20-slim AS builder

WORKDIR /app/server

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*


# Copy server package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci

# Copy server source files
COPY server/*.ts ./
COPY server/tsconfig.json ./
COPY types ../types

# Build TypeScript (optional if running with tsx)
# RUN npm run build

# ===== Production Image =====
FROM node:20-slim

WORKDIR /app/server

# Install runtime dependencies for better-sqlite3 and audio processing
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    ffmpeg \
    libchromaprint-tools \
    && rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/*.ts ./
COPY --from=builder /app/server/tsconfig.json ./
COPY --from=builder /app/types ../types
COPY server/package*.json ./
COPY server/scripts ./scripts

# Copy built client for static serving
COPY --from=client-builder /app/client/dist ./public

# Create directories for persistent data
RUN mkdir -p /data /music /app/server/storage/art

# Environment variables with defaults
ENV PORT=3001
ENV MUSIC_LIBRARY_PATH=/music
ENV DATABASE_PATH=/data/library.db

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Run with tsx for TypeScript support
CMD ["npx", "tsx", "index.ts"]
