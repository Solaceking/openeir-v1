"""OpenEir — Edge neural TTS through the user's OWN app server.

Reuses /api/voice/tts (msedge-tts, disk-cached) so the realtime agent speaks
with exactly the same voice the rest of the app uses — no new vendor, no new
key. Authenticated with the internal service token (proxy allowance).
"""

from __future__ import annotations

import os
from typing import AsyncGenerator, Optional

import httpx

from pipecat.frames.frames import ErrorFrame, Frame, TTSAudioRawFrame, TTSStartedFrame, TTSStoppedFrame
from pipecat.services.tts_service import TTSService


class OpenEirEdgeTTS(TTSService):
    def __init__(
        self,
        *,
        openeir_base_url: str,
        service_token: str,
        rate: float = 1.0,
        voice: Optional[str] = None,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self._base = openeir_base_url.rstrip("/")
        self._token = service_token
        self._rate = min(1.6, max(0.6, float(rate)))
        self._voice = voice or os.environ.get("OPENEIR_EDGE_VOICE", "")
        self._http = httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        await self._http.aclose()
        await super().aclose()

    async def run_tts(self, text: str) -> AsyncGenerator[Frame, None]:
        yield TTSStartedFrame()
        try:
            payload: dict = {"text": text[:600], "rate": self._rate}
            if self._voice:
                payload["voice"] = self._voice
            res = await self._http.post(
                f"{self._base}/api/voice/tts",
                json=payload,
                headers={"Authorization": f"Bearer {self._token}"},
            )
            if res.status_code != 200:
                yield ErrorFrame(f"TTS upstream error {res.status_code}")
                return
            audio = res.content
            if len(audio) < 100:
                yield ErrorFrame("TTS returned empty audio")
                return
            yield TTSAudioRawFrame(audio=audio, sample_rate=24000, num_channels=1)
        except Exception as e:  # pragma: no cover - network dependent
            yield ErrorFrame(f"TTS request failed: {e}")
        finally:
            yield TTSStoppedFrame()
