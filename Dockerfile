FROM node:lts-alpine3.24 AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm install

# Copy source code
COPY src ./src
COPY tsconfig.json .
COPY constitution.md .
COPY docker-compose.yml .
COPY .env .

# Build application
RUN npm run build

# Production stage
FROM node:lts-alpine3.24 AS production

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/package*.json ./
RUN npm install --only=production

# Copy built code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/constitution.md .
COPY --from=builder /app/docker-compose.yml .
COPY --from=builder /app/.env .

# Add non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose application port
EXPOSE 6666

# Start the application
CMD ["npm", "start"]