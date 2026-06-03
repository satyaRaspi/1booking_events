# 1Booking Railway deployment Dockerfile
# Builds the React frontend and serves it from the FastAPI backend as one Railway service.

FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm config set registry https://registry.npmjs.org/ && npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim AS backend
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV ONEBOOKING_FRONTEND_DIST=/app/backend/static

# Minimal libraries commonly needed by OpenCV headless and PDF/image packages.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /app/frontend/dist /app/backend/static

WORKDIR /app/backend

CMD sh -c "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"
