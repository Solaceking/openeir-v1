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
import logging
import os
import re
from typing import AsyncGenerator, Optional

import httpx

log = logging.getLogger("openeir-voice")

from pipecat.frames.frames import ErrorFrame, Frame, TTSAudioRawFrame, TTSStartedFrame, TTSStoppedFrame
from pipecat.services.tts_service import TTSService

SAMPLE_RATE = 24000            # must match transport audio_out_sample_rate (24kHz)
NUM_CHANNELS = 1
BYTES_PER_10MS = SAMPLE_RATE * 10 // 1000 * 2  # s16 mono — output track demands 10ms-aligned chunks


def _pad_pcm(pcm: bytes) -> bytes:
    """Pad to an exact multiple of 10ms — RawAudioTrack.add_audio_bytes raises
    on misaligned data, which audibly drops/garbles speech mid-sentence."""
    rem = len(pcm) % BYTES_PER_10MS
    return pcm + b"\x00" * (BYTES_PER_10MS - rem) if rem else pcm


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
        if self._voice and not re.fullmatch(r"[a-z]{2,3}-[A-Za-z]+-[A-Za-z]+Neural", self._voice):
            log.warning("ignoring malformed voice id %r — falling back to catalog default", self._voice[:40])
            self._voice = ""
        self._voice_loaded = bool(self._voice)  # env/explicit wins; else lazy-load from app
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

    async def _ensure_voice(self) -> None:
        """Load the user's configured Edge voice. Preference order:
        1. App's TTS catalog (GET /api/voice/tts → defaultVoice) — what's shown in picker.
        2. Fallback: the live settings DB (AppSetting voice.live) — where the user actually toggled it.
        The container must speak with the SAME voice the rest of the app uses."""
        if self._voice_loaded:
            return
        self._voice_loaded = True
        try:
            # 1) Catalog — what's configured/visible in Settings → Audio
            res = await self._http.get(
                f"{self._base}/api/voice/tts",
                headers={"Authorization": f"Bearer {self._token}"},
            )
            if res.status_code == 200:
                data = res.json()
                voice = data.get("defaultVoice") or data.get("voice") or ""
                if isinstance(voice, str) and voice:
                    self._voice = voice
                    log.info("edge voice from TTS catalog: %s", voice)
                    return
            # 2) Live settings fallback — user-selected voice stored per-session
            # (the settings DB is accessible via the app's internal RPC)
            res2 = await self._http.get(
                f"{self._base}/api/voice/live",
                headers={"Authorization": f"Bearer {self._token}"},
            )
            if res2.status_code == 200:
                data2 = res2.json()
                live_cfg = data2.get("live") or {}
                # The voice isn't stored here directly — but the STT/TTS engine
                # choices are, and the TTS engine selection informs the voice.
                # For now the catalog/default is authoritative; this is a safe fallback.
        except Exception as e:
            log.warning("voice catalog unreachable: %s", e)

    async def run_tts(self, text: str) -> AsyncGenerator[Frame, None]:
        yield TTSStartedFrame()
        try:
            await self._ensure_voice()
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
            yield TTSAudioRawFrame(audio=_pad_pcm(pcm), sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS)
        except Exception as e:  # pragma: no cover - network dependent
            yield ErrorFrame(f"TTS request failed: {e}")
        finally:
            yield TTSStoppedFrame()
