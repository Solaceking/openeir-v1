"""Tests for the spoken-confirmation grammar and flow state machine.

Run: python -m pytest mini-services/voice-agent/tests -q
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from grammar import classify_confirmation  # noqa: E402
from openeir import ConfirmFlow, confirmation_prompt_for  # noqa: E402


class TestGrammar:
    def test_clear_yes(self):
        for t in ["yes", "yes please", "yep", "sure", "correct", "go ahead",
                  "that's right", "log it", "ok", "sounds good", "do it"]:
            assert classify_confirmation(t) == "yes", t

    def test_clear_no(self):
        for t in ["no", "nope", "nah", "no thanks", "cancel", "don't", "stop",
                  "not now", "never mind", "decline", "negative"]:
            assert classify_confirmation(t) == "no", t

    def test_ambiguity_never_authorizes(self):
        # mixtures must NEVER resolve to yes
        for t in ["yes but wait", "no I mean yes", "well", "um maybe",
                  "what was the number again", "hello", ""]:
            assert classify_confirmation(t) == "unclear", t

    def test_no_inside_other_words_does_not_match(self):
        assert classify_confirmation("noted") == "unclear"
        assert classify_confirmation("know") == "unclear"

    def test_short_prefix_rule(self):
        assert classify_confirmation("yes that's fine") == "yes"
        assert classify_confirmation("no thanks I'll do it") == "no"


class TestConfirmFlow:
    def _flow(self):
        return ConfirmFlow(readback="log blood pressure 120/80", action_ids=["act_123"])

    def test_yes_confirms_once(self):
        f = self._flow()
        d = f.decide("yes")
        assert d.kind == "confirm"
        assert d.action_id == "act_123"

    def test_no_declines(self):
        f = self._flow()
        d = f.decide("nope")
        assert d.kind == "decline"

    def test_unclear_reasks_then_card(self):
        f = self._flow()
        d1 = f.decide("ummm")
        assert d1.kind == "reask"
        d2 = f.decide("I'm not sure")
        assert d2.kind == "card_fallback"
        # after fallback nothing is confirmable by voice — the card owns it
        d3 = f.decide("yes")
        assert d3.kind == "card_fallback"

    def test_mixed_answer_is_unclear(self):
        f = self._flow()
        assert f.decide("yes no wait").kind == "reask"


class TestPromptBuilding:
    def test_builds_from_pending_payload(self):
        flow = confirmation_prompt_for([
            {"id": "a1", "tool": "logBloodPressure", "readback": "Log blood pressure 118/76"},
        ])
        assert flow is not None
        assert flow.action_ids == ["a1"]
        assert "118/76" in flow.question()

    def test_none_when_no_pending(self):
        assert confirmation_prompt_for([]) is None
