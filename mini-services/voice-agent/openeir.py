"""OpenEir — client for the app's internal RPC (/api/agent/rpc).

The voice container holds NO business logic: every conversational turn goes
through the SAME engine as text chat (tool calling, confirm-before-write,
audit). This module is a thin, fully typed HTTP client plus the spoken-
confirmation flow state machine. Python never writes to the database — it can
only ask the app to mark a pending action confirmed, which the app still
gates, audits and executes exactly once.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx


class OpenEirError(RuntimeError):
    pass


@dataclass
class TurnResult:
    ok: bool
    reply: str = ""
    session_id: str = ""
    pending: list[dict[str, Any]] = field(default_factory=list)
    tool_events: list[dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None

    @classmethod
    def from_rpc(cls, data: dict[str, Any]) -> "TurnResult":
        if not data.get("ok"):
            return cls(ok=False, error=data.get("error") or "Eir could not reply")
        turn = data.get("turn", {})
        return cls(
            ok=True,
            reply=turn.get("reply", ""),
            session_id=turn.get("sessionId", ""),
            pending=turn.get("pending", []) or [],
            tool_events=turn.get("toolEvents", []) or [],
        )


class OpenEirClient:
    """Async client for the OpenEir internal RPC. Fail-closed on token."""

    def __init__(self, base_url: str, service_token: str, timeout: float = 60.0) -> None:
        if not service_token:
            raise OpenEirError("OPENEIR_SERVICE_TOKEN is required (the app refuses RPC without it)")
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {service_token}"},
            timeout=timeout,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        res = await self._client.post("/api/agent/rpc", json={"method": method, "params": params or {}})
        if res.status_code == 403:
            raise OpenEirError("RPC forbidden — OPENEIR_SERVICE_TOKEN mismatch (set it on app + voice agent)")
        res.raise_for_status()
        return res.json()

    # ---- conversation (the ONE brain: chat-engine with tools + audit) ----

    async def chat_turn(self, text: str, session_id: Optional[str] = None) -> TurnResult:
        data = await self._call("chat.turn", {"text": text, "channel": "voice", "sessionId": session_id})
        return TurnResult.from_rpc(data)

    # ---- confirmations (spoken yes/no path) ----

    async def actions_pending(self) -> list[dict[str, Any]]:
        data = await self._call("actions.pending")
        return data.get("pending", [])

    async def confirm_action(self, action_id: str, phrase: Optional[str] = None) -> dict[str, Any]:
        return await self._call("actions.confirm", {"id": action_id, "phrase": phrase})

    async def decline_action(self, action_id: str) -> dict[str, Any]:
        return await self._call("actions.decline", {"id": action_id})

    # ---- engine configuration (pluggable STT/TTS lives in app settings) ----

    async def live_config(self) -> dict[str, Any]:
        return await self._call("config.live")


# ---------- spoken confirmation flow ----------

@dataclass
class FlowDecision:
    kind: str  # 'speak' | 'confirm' | 'decline' | 'reask' | 'card_fallback'
    text: str = ""
    action_id: Optional[str] = None


class ConfirmFlow:
    """State machine between a proposed write and a spoken human decision.

    Guarantees (mirroring the app's card flow):
      * a proposal ALWAYS asks an explicit yes/no question
      * 'unclear' answers get exactly one re-ask, then fall back to the card
      * it never executes anything itself — the app does, on confirm
    """

    MAX_REASKS = 1

    def __init__(self, readback: str, action_ids: list[str]) -> None:
        self.readback = readback
        self.action_ids = action_ids
        self.reasks = 0
        self.done = False  # terminal after card_fallback — voice no longer owns the decision

    def question(self) -> str:
        return f"Ready to save: {self.readback}. Shall I save it? Yes or no."

    def on_answer(self, utterance: str, classify=None) -> FlowDecision:
        """Alias of decide() — explicit name for the awaiting-confirmation path."""
        return self.decide(utterance, classify)

    def decide(self, utterance: str, classify=None) -> FlowDecision:
        from grammar import classify_confirmation  # local import keeps module import-light

        if self.done:
            return FlowDecision(kind="card_fallback", text="I've left a card in the app so you can confirm there.")

        classify_fn = classify or classify_confirmation
        verdict = classify_fn(utterance)
        if verdict == "yes":
            return FlowDecision(kind="confirm", action_id=self.action_ids[0] if self.action_ids else None)
        if verdict == "no":
            return FlowDecision(kind="decline", action_id=self.action_ids[0] if self.action_ids else None)
        if self.reasks < self.MAX_REASKS:
            self.reasks += 1
            return FlowDecision(kind="reask", text=f"Sorry — yes or no? {self.readback}. Shall I save it?")
        self.done = True
        return FlowDecision(kind="card_fallback", text="No problem — I've left a card in the app so you can confirm there.")


def confirmation_prompt_for(pending: list[dict[str, Any]]) -> Optional[ConfirmFlow]:
    """Build the spoken question for the FIRST pending action of a turn."""
    if not pending:
        return None
    first = pending[0]
    tool = first.get("tool", "this action")
    humanized = re.sub(r"(?<=[a-z])([A-Z])", r" \1", tool).lower()
    readback = first.get("readback") or f"{humanized}"
    ids = [p.get("id") for p in pending if p.get("id")]
    return ConfirmFlow(readback=readback, action_ids=[i for i in ids if i])
