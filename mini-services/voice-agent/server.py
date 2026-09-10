"""OpenEir — realtime voice agent signaling server (FastAPI).

The browser app posts a WebRTC offer to /api/offer; we answer it with a fresh
Pipecat SmallWebRTC connection and spin up one bot pipeline per session.

    POST /api/offer  { sdp, type, peer_id? } → { sdp, type, peer_id }
    GET  /health     → { ok, enabled }       (compose healthcheck)

Single-user self-hosted by design: no rooms, no TURN infra, direct LAN audio.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger("openeir-voice")

app = FastAPI(title="OpenEir Voice Agent", docs_url=None, redoc_url=None)

OPENEIR_URL = os.environ.get("OPENEIR_URL", "http://app:3000")
SERVICE_TOKEN = os.environ.get("OPENEIR_SERVICE_TOKEN", "")


class Offer(BaseModel):
    sdp: str
    type: str = "offer"
    peer_id: Optional[str] = None


@app.get("/health")
async def health():
    return {"ok": True, "service": "openeir-voice-agent", "tokenConfigured": bool(SERVICE_TOKEN)}


@app.post("/api/offer")
async def offer(offer_req: Offer):
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="OPENEIR_SERVICE_TOKEN not configured on the voice agent")
    try:
        # pipecat 0.0.66 layout: connection class in network.webrtc_connection,
        # transport in network.small_webrtc (needs pipecat-ai[webrtc] extra)
        from pipecat.transports.network.webrtc_connection import SmallWebRTCConnection

        connection = SmallWebRTCConnection()
        await connection.initialize(sdp=offer_req.sdp, type=offer_req.type)
        answer = connection.get_answer()  # dict {sdp, type, pc_id} in 0.0.66
        # import here so /health stays alive even if pipecat extras are missing
        from bot import run_bot

        asyncio.create_task(run_bot(connection, OPENEIR_URL, SERVICE_TOKEN))
        return {"sdp": answer["sdp"], "type": answer["type"], "peer_id": answer.get("pc_id")}
    except HTTPException:
        raise
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"pipecat dependency missing: {e}")
    except Exception as e:
        log.exception("offer failed")
        raise HTTPException(status_code=500, detail=str(e))
