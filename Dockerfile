FROM oven/bun:1.3

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

# Expose the port the app will run on
EXPOSE 3000

# Start the application
CMD ["bun", "run", "preview", "--host", "0.0.0.0", "--port", "3000"]
