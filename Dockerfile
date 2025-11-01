# Use multi-stage build for better optimization
FROM oven/bun:1.3 AS builder

WORKDIR /app

# Copy package.json and bun.lockb
COPY package.json ./
COPY bun.lockb ./

# Try with frozen-lockfile first, fall back to regular install if it fails
RUN bun install --frozen-lockfile || bun install

# Copy the rest of the application
COPY . .

# Build the application
RUN bun run build

# Production stage with Caddy
FROM caddy:2.8-alpine

# Copy built application
COPY --from=builder /app/dist /app/dist

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Expose the port
EXPOSE 3000

# Start Caddy with the configuration
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
