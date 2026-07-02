# syntax=docker/dockerfile:1

# --- Builder: resolve & install dependencies with uv into a venv ----------- #
FROM python:3.12-slim AS builder

# Install uv from PyPI (pinned) rather than copying it from an external image,
# so the build does not depend on a second registry being reachable.
RUN pip install --no-cache-dir uv==0.11.17

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Install ONLY the runtime dependencies first, from the lockfile, in a cached
# layer. Nothing but uv.lock + pyproject.toml is needed, so this layer is reused
# across code changes.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-dev

# --- Final: slim runtime image --------------------------------------------- #
FROM python:3.12-slim AS final

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Put the resolved virtualenv first on PATH and make `app` importable.
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app

WORKDIR /app

# Copy the fully-resolved virtualenv from the builder, then the app code.
COPY --from=builder /app/.venv /app/.venv
COPY . .

RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Liveness probe for the container runtime (readiness incl. DB is /health/ready).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health/live').status==200 else 1)"

# Applies migrations, then starts the server (see docker-entrypoint.sh).
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
