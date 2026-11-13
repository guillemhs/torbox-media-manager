FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++
RUN npm install --legacy-peer-deps --no-audit --no-fund
RUN apk del .build-deps

# Copy source code
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json .
COPY constitution.md .
COPY docker-compose.yml .

# Build application
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app
RUN apk add --no-cache libstdc++

# Copy built assets from builder
COPY --from=builder /app/package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++
RUN npm install --only=production --legacy-peer-deps --no-audit --no-fund
RUN apk del .build-deps

# Copy built code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/constitution.md .
COPY --from=builder /app/docker-compose.yml .

# Add non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose application port
EXPOSE 8066

# Start the application
CMD ["npm", "start"]