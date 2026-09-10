# OpenEir realtime voice agent — opt-in service (docker compose --profile voice).
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# build-essentials kept minimal; faster-whisper wheels cover most platforms
# libgl1 + libglib2.0-0: runtime libs required by opencv (cv2, pulled in by
# pipecat-ai[webrtc]) — headless images lack them
RUN apt-get update && apt-get install -y --no-install-recommends curl libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8021
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -sf http://127.0.0.1:8021/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8021"]
