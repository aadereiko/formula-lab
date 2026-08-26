# Two stages: build the front end with Node, then serve everything from Python.
# The result is one image and one origin, which is what makes the session
# cookie first-party in production.

FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    FORMULA_LAB_ENV=production \
    FORMULA_LAB_STATIC_DIR=/app/static \
    FORMULA_LAB_DATABASE_URL=sqlite:////data/formula_lab.db

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/app ./app
# A read-only database inspector, so `fly ssh console -C "python
# scripts/db.py"` is one line instead of a page of nested shell quoting.
COPY scripts/db.py ./scripts/db.py
COPY --from=web /web/dist ./static

# SQLite needs a writable directory that survives redeploys; mount a volume
# here, or set FORMULA_LAB_DATABASE_URL to a Postgres URL and ignore it.
RUN mkdir -p /data && \
    adduser --system --no-create-home --uid 10001 formula && \
    chown -R formula /data
USER formula

EXPOSE 7731
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7731/api/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7731"]
