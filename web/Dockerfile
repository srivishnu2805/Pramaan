# Build stage
FROM denoland/deno:latest AS builder

# Point Deno's cache at a known location so it can be copied to the next stage
ENV DENO_DIR=/deno-dir

WORKDIR /app

# Copy dependency manifests first so the dependency install layer caches across source-only edits
COPY deno.json deno.lock package.json* ./
RUN deno ci

# Copy the rest of the application source code
COPY . .

# Production stage
FROM denoland/deno:latest

ENV DENO_DIR=/deno-dir

EXPOSE 5173

WORKDIR /app

RUN chown -R deno:deno /app

# Switch to the official non-root user
USER deno

# Copy application source and node_modules from builder
COPY --from=builder --chown=deno:deno /app .

# Copy the populated Deno cache so runtime has pre-cached dependencies
COPY --from=builder --chown=deno:deno /deno-dir /deno-dir

CMD ["deno", "task", "dev", "--host", "0.0.0.0"]


