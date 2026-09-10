"""OpenEir — Edge neural TTS through the user's OWN app server.

Reuses /api/voice/tts (msedge-tts, disk-cached) so the realtime agent speaks
with exactly the same voice the rest of the app uses — no new vendor, no new
key. Authenticated with the internal service token (proxy allowance).

The app returns MP3 (audio/mpeg). The WebRTC transport plays RAW PCM, so we
decode MP3 → 24kHz mono s16le with PyAV before yielding the frame. Yielding
the MP3 bytes directly sounds like static/glitch (they were being interpreted
as PCM samples).
"""

from __future__ import annotations

import io
import os
from typing import AsyncGenerator, Optional

import httpx

from pipecat.frames.frames import ErrorFrame, Frame, TTSAudioRawFrame, TTSStartedFrame, TTSStoppedFrame
from pipecat.services.tts_service import TTSService

SAMPLE_RATE = 24000
NUM_CHANNELS = 1


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

    @staticmethod
    def _mp3_to_pcm(mp3: bytes) -> bytes:
        """Decode MP3 to 24kHz mono s16le PCM using PyAV (av is already a
        dependency via aiortc). Raises RuntimeError on decode failure."""
        import av

        pcm = bytearray()
        container = av.open(io.BytesIO(mp3))
        try:
            resampler = av.AudioResampler(
                format="s16", layout="mono", rate=SAMPLE_RATE
            )
            for frame in container.decode(audio=0):
                # flatten resampled frames before concat (differing sample
                # counts per plane crash .to_bytes() on multi-frame buffers)
                out = resampler.resample(frame)
                if isinstance(out, av.AudioFrame):
                    out = [out]
                for f in out or []:
                    pcm.extend(bytes(f.planes[0]))
        finally:
            container.close()
        if not pcm:
            raise RuntimeError("mp3 decode produced no PCM")
        return bytes(pcm)

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
            if len(res.content) < 100:
                yield ErrorFrame("TTS returned empty audio")
                return
            try:
                pcm = self._mp3_to_pcm(res.content)
            except Exception as e:  # decode failure must not kill the pipeline
                yield ErrorFrame(f"TTS decode failed: {e}")
                return
            yield TTSAudioRawFrame(audio=pcm, sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS)
        except Exception as e:  # pragma: no cover - network dependent
            yield ErrorFrame(f"TTS request failed: {e}")
        finally:
            yield TTSStoppedFrame()
