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

# Production stage with Node.js
FROM oven/bun:1.3

WORKDIR /app

# Copy package.json and install all dependencies (server needs express, cors)
COPY package.json ./
RUN bun install --frozen-lockfile || bun install

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy server file
COPY server.js ./

# Expose the port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the Express server
CMD ["bun", "server.js"]
