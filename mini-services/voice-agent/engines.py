"""OpenEir — pluggable STT/TTS engine factory for the realtime agent.

Philosophy mirrors the app's SttRouting settings: engines are configured in
OpenEir (Settings → Providers → Audio + the Live conversation card), fetched
at session start via the internal RPC (config.live), and mapped here to a
Pipecat service. No engine is hard-coded as the only choice:

  STT:  local_whisper        → OpenAI-compatible local server (whisper.cpp /
                               faster-whisper-server), or in-process faster-
                               whisper when no URL is configured
        deepgram_selfhosted  → Deepgram-compatible engine you host yourself

  TTS:  edge                 → the app's own Edge neural TTS (default, free)
        piper                → fully offline Piper voices (in-container)
        openai_compat        → any OpenAI-compatible speech server
        deepgram             → Deepgram Aura (self-hosted or cloud endpoint)

Every import is lazy with a plain-language error, so a missing extra degrades
into a startup message instead of a mystery traceback.
"""

from __future__ import annotations

import os
from typing import Any

from pipecat.pipeline.base import Frame  # noqa: F401  (re-exported for bot.py convenience)


def _import(name: str, extra: str):
    try:
        return __import__(name, fromlist=["__doc__"])
    except ImportError as e:  # pragma: no cover - environment dependent
        raise RuntimeError(
            f"Missing dependency for the selected voice engine: install the "
            f"'pipecat-ai{extra}' extra (pip install 'pipecat-ai{extra}'). Original error: {e}"
        ) from e


def build_stt(config: dict[str, Any]):
    """Create the STT service from the app's live config."""
    engine = (config.get("live", {}) or {}).get("sttEngine", "local_whisper")
    stt = config.get("stt", {}) or {}

    if engine == "deepgram_selfhosted":
        deepgram = _import("pipecat.services.deepgram", "[deepgram]")
        api_key = os.environ.get("DEEPGRAM_API_KEY", "")
        base_url = os.environ.get("DEEPGRAM_URL")  # e.g. http://deepgram:8080/v1/listen
        kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        return deepgram.DeepgramSTTService(**kwargs)

    # default: local whisper
    whisper_url = stt.get("whisperUrl")
    if whisper_url:
        openai_mod = _import("pipecat.services.openai", "[openai]")
        return openai_mod.openai.OpenAISTTService(
            api_key=os.environ.get("LOCAL_STT_API_KEY", "local"),
            base_url=whisper_url,
            model=stt.get("whisperModel") or "whisper-1",
        )
    whisper = _import("pipecat.services.whisper", "[whisper]")
    return whisper.WhisperSTTService()


def build_tts(config: dict[str, Any], openeir_base_url: str, service_token: str):
    """Create the TTS service from the app's live config."""
    engine = (config.get("live", {}) or {}).get("ttsEngine", "edge")
    rate = (config.get("live", {}) or {}).get("rate") or 1.0

    if engine == "edge":
        from edge_tts_service import OpenEirEdgeTTS  # local module

        return OpenEirEdgeTTS(openeir_base_url=openeir_base_url, service_token=service_token, rate=rate)

    if engine == "piper":
        piper = _import("pipecat.services.piper", "[piper]")
        return piper.PiperTTSService(
            voice_path=os.environ.get("PIPER_VOICE_PATH", "voices/en_US-amy-medium.onnx"),
        )

    if engine == "openai_compat":
        openai_mod = _import("pipecat.services.openai", "[openai]")
        return openai_mod.openai.OpenAITTSService(
            api_key=os.environ.get("LOCAL_TTS_API_KEY", "local"),
            base_url=os.environ.get("LOCAL_TTS_URL", "http://localhost:8000/v1"),
        )

    if engine == "deepgram":
        deepgram = _import("pipecat.services.deepgram", "[deepgram]")
        kwargs: dict[str, Any] = {"api_key": os.environ.get("DEEPGRAM_API_KEY", "")}
        if os.environ.get("DEEPGRAM_URL"):
            kwargs["base_url"] = os.environ["DEEPGRAM_URL"]
        return deepgram.DeepgramTTSService(**kwargs)

    raise RuntimeError(f"Unknown ttsEngine '{engine}' — expected edge | piper | openai_compat | deepgram")
