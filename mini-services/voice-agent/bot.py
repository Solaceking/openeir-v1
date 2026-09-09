"""OpenEir — realtime voice bot (Pipecat pipeline).

Pipeline per session:

    browser mic ──WebRTC──▶ SmallWebRTCTransport
                             │  Silero VAD (barge-in: user speech cancels TTS)
                             ▼
                            STT  (pluggable: local whisper | Deepgram self-hosted)
                             ▼
                    OpenEirTurnProcessor   ──HTTP──▶ OpenEir app (/api/agent/rpc)
                             │              (chat.turn → LLM + tools + audit +
                             │               confirm-before-write, all in the app)
                             ▼
                            TTS  (pluggable: app Edge | piper | openai | deepgram)
                             ▼
                        speaker out

Barge-in is Pipecat's core value here: while Eir is speaking, the user can
just start talking — VAD detects it, the pipeline cancels the remaining
speech, and the next transcript starts fresh. allow_interruptions is
explicitly left ENABLED (disabling it would reduce this mode to the existing
push-to-talk experience).

Writes are NEVER executed by voice alone without the spoken yes/no exchange
(ConfirmFlow) — and even then the app executes them behind the same audited,
idempotent confirmation path as the chat card. A spoken "no" or an unclear
answer never saves anything.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import Frame, TextFrame, TranscriptionFrame, TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport, SmallWebRTCTransportParams

from engines import build_stt, build_tts
from openeir import OpenEirClient, ConfirmFlow, confirmation_prompt_for

log = logging.getLogger("openeir-voice")


class OpenEirTurnProcessor(FrameProcessor):
    """Turns transcripts into OpenEir turns; handles the spoken confirm loop."""

    def __init__(self, client: OpenEirClient, session_id: str):
        super().__init__()
        self._client = client
        self._session_id = session_id
        self._flow: Optional[ConfirmFlow] = None

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip()
            if not text:
                return
            await self._handle_utterance(text)
        elif isinstance(frame, TextFrame) and frame.text.startswith("__openeir__"):
            # internal control frames (reserved for future integrations)
            return

        await self.push_frame(frame, direction)

    async def _speak(self, text: str) -> None:
        if text.strip():
            await self.push_frame(TTSSpeakFrame(text), FrameDirection.DOWNSTREAM)

    async def _handle_utterance(self, text: str) -> None:
        # 1) spoken confirmation loop first — a pending write owns the floor
        if self._flow is not None:
            decision = self._flow.decide(text)
            if decision.kind == "confirm":
                action_id = decision.action_id
                self._flow = None
                if action_id:
                    out = await self._client.confirm_action(action_id)
                    if out.get("ok"):
                        await self._speak(f"Saved. {out.get('result', '')}")
                    else:
                        await self._speak(f"I couldn't save that. {out.get('reason', '')}")
                return
            if decision.kind == "decline":
                action_id = decision.action_id
                self._flow = None
                if action_id:
                    await self._client.decline_action(action_id)
                await self._speak("Okay, I've discarded that — nothing was saved.")
                return
            if decision.kind == "reask":
                await self._speak(decision.text)
                return
            # card_fallback
            self._flow = None
            await self._speak(decision.text)
            return

        # 2) normal conversation turn — the app's engine does everything
        try:
            turn = await self._client.chat_turn(text, self._session_id)
        except Exception as e:  # network/auth problems must not kill the session
            log.error("chat.turn failed: %s", e)
            await self._speak("I couldn't reach your OpenEir server just then — try again in a moment.")
            return

        if not turn.ok:
            await self._speak(turn.error or "Something went wrong reaching your records.")
            return

        await self._speak(turn.reply)

        # 3) writes proposed by the model → spoken yes/no confirmation
        flow = confirmation_prompt_for(turn.pending)
        if flow is not None:
            self._flow = flow
            await self._speak(flow.question())


async def run_bot(connection: SmallWebRTCConnection, openeir_url: str, service_token: str) -> None:
    client = OpenEirClient(openeir_url, service_token)
    try:
        config = await client.live_config()
        live = config.get("live", {})
        if not live.get("enabled", False):
            log.warning("Live conversation is disabled in Settings — refusing to start a session")
            await connection.disconnect()
            return

        session_id = f"voice-{connection.peer_id}" if hasattr(connection, "peer_id") else "voice-live"

        transport = SmallWebRTCTransport(
            params=SmallWebRTCTransportParams(
                webrtc_connection=connection,
                audio_in_enabled=True,
                audio_out_enabled=True,
                vad_analyzer=SileroVADAnalyzer(),  # barge-in detection
            ),
        )

        stt = build_stt(config)
        tts = build_tts(config, openeir_url, service_token)
        turn_processor = OpenEirTurnProcessor(client, session_id)

        pipeline = Pipeline(
            [
                transport.input(),      # mic + VAD + transcription events
                stt,                    # pluggable STT
                turn_processor,         # OpenEir brain via RPC + spoken confirms
                tts,                    # pluggable TTS
                transport.output(),     # speaker
            ]
        )
        task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

        @transport.event_handler("on_client_connected")
        async def _connected(transport, client_data):  # noqa: ANN001
            log.info("voice session connected (%s)", client_data)
            await task.queue_frames([TextFrame("Hello — I'm listening.")])

        @transport.event_handler("on_client_disconnected")
        async def _disconnected(transport, client_data):  # noqa: ANN001
            log.info("voice session disconnected (%s)", client_data)
            await task.cancel()

        runner = PipelineRunner(handle_sigint=False)
        await runner.run(task)
    finally:
        await client.aclose()
