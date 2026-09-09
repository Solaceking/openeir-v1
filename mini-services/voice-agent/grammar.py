"""OpenEir — spoken confirmation grammar (pure functions, zero I/O).

When the realtime voice agent proposes a write (log a reading, mark a dose),
it must ask a clear yes/no question and the user's answer must be classified
CONSERVATIVELY: anything ambiguous is "unclear" and gets re-asked once, then
falls back to the visual card. A mumbled "well..." never authorizes a write.
"""

from __future__ import annotations

import re

YES_PHRASES = {
    "yes", "yes please", "yes please do", "yep", "yup", "yeah", "ya", "sure",
    "ok", "okay", "okey", "alright", "all right", "correct", "right",
    "confirm", "confirmed", "do it", "please do", "go ahead", "go on",
    "sounds good", "that's right", "thats right", "log it", "save it",
    "affirmative", "you can", "please save", "please log", "do that",
}

NO_PHRASES = {
    "no", "nope", "nah", "no thanks", "no thank you", "cancel", "stop",
    "stop it", "wait", "don't", "dont", "do not", "don't do it", "dont do it",
    "not now", "never mind", "nevermind", "abort", "decline", "negative",
    "don't save", "dont save", "don't log", "dont log", "skip that", "no don't",
}

# refusal openers — if the sentence starts with one of these, trailing words
# never flip it into a yes ("no thanks I'll do it myself" is still a NO)
NO_OPENERS = ("no", "nope", "nah", "no thanks", "no thank you", "don't",
              "dont", "do not", "never mind", "nevermind", "cancel", "stop")

YES_TOKENS = {"yes", "yeah", "yep", "yup", "sure", "correct", "confirm",
              "confirmed", "ok", "okay", "alright", "right", "affirmative"}
NO_TOKENS = {"no", "nope", "nah", "cancel", "stop", "wait", "don't", "dont",
             "not", "never", "decline", "abort", "negative"}

_WORD_RE = re.compile(r"[a-z']+")


def normalize(text: str) -> str:
    return " ".join(_WORD_RE.findall(text.lower())).strip()


def classify_confirmation(text: str) -> str:
    """Return 'yes' | 'no' | 'unclear'.

    Rules, deliberately conservative:
      * exact phrase match wins
      * a refusal opener decides ('no thanks, I'll do it myself' → no)
      * short utterances are scanned token-wise: any yes+no mixture → unclear
      * long utterances without an exact phrase → unclear
    """
    t = normalize(text)
    if not t:
        return "unclear"

    if t in YES_PHRASES:
        return "yes"
    if t in NO_PHRASES:
        return "no"

    # refusal opener decides — but only if no yes-word appears anywhere after
    # it ("no I mean yes" stays unclear), and only at word boundaries
    # ("noted" is not "no")
    starts_with_no = any(t == o or t.startswith(o + " ") for o in NO_OPENERS)
    if starts_with_no and not any(w in YES_TOKENS for w in t.split()):
        return "no"

    words = t.split()
    if len(words) > 4:
        return "unclear"

    says_yes = any(w in YES_TOKENS for w in words)
    says_no = any(w in NO_TOKENS for w in words)
    if says_yes and says_no:
        return "unclear"
    if says_yes:
        return "yes"
    if says_no:
        return "no"
    return "unclear"
