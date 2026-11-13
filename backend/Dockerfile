# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools for native modules (e.g. bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for TypeScript build)
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Prune devDependencies to keep only production dependencies
RUN npm prune --omit=dev

# Stage 2: Production Runtime
FROM node:22-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create uploads directory and ensure node ownership
RUN mkdir -p /app/uploads && chown -R node:node /app

# Copy package manifests for metadata/runtime
COPY package*.json ./

# Copy production node_modules from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy seed script
COPY --chown=node:node seed_room.js ./seed_room.js

# Use non-root node user for security
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "dist/index.js"]
