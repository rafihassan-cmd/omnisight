"""Minimal Groq (OpenAI-compatible) JSON chat client."""

from __future__ import annotations

import logging
import json
import urllib.error
import urllib.request

URL = "https://api.groq.com/openai/v1/chat/completions"


class LLMServiceError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def chat_json(*, api_key: str, model: str, system: str,
              user: str, timeout: int) -> dict:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
        "max_tokens": 1500,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    request = urllib.request.Request(
        URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Default urllib agent is blocked by Groq's CDN.
            "User-Agent": "omnisight/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            upstream = json.loads(exc.read().decode("utf-8"))
            detail = upstream.get("error", {}).get("message", "")
        except Exception:
            detail = ""

        logging.getLogger(__name__).warning(
            "Groq HTTP %s: %s", exc.code, detail
        )

        if exc.code in (401, 403):
            raise LLMServiceError(
                "AI provider rejected the API key. Check GROQ_API_KEY.", 503
            ) from exc
        if exc.code == 429:
            raise LLMServiceError(
                "AI rate limit reached. Try again in a moment.", 429
            ) from exc

        raise LLMServiceError(
            f"AI provider error {exc.code}: {detail[:200]}"
            if detail else f"AI provider error {exc.code}.",
            502,
        ) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise LLMServiceError("The AI provider is unreachable.", 503) from exc

    try:
        data = json.loads(payload["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise LLMServiceError("The AI returned an unreadable response.", 502) from exc

    if not isinstance(data, dict):
        raise LLMServiceError("The AI returned an unexpected response.", 502)

    return data