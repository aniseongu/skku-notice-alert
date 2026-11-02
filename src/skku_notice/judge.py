"""Batch Gemini relevance judgments; failures leave rule matching in charge."""

import json
from dataclasses import dataclass

from google import genai
from google.genai import types

from skku_notice.model import Notice

VERDICTS = {"relevant", "maybe", "not_relevant"}
SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "id": {"type": "STRING"},
                    "verdict": {"type": "STRING", "enum": ["relevant", "maybe", "not_relevant"]},
                    "reason": {"type": "STRING"},
                },
                "required": ["id", "verdict", "reason"],
            },
        }
    },
    "required": ["items"],
}


@dataclass(frozen=True)
class Judgment:
    verdict: str
    reason: str
    model: str


def decide_priority(match: object | None, judgment: Judgment | None) -> str | None:
    rule_priority = getattr(match, "priority", None)
    if judgment is None:
        return rule_priority
    if rule_priority:
        return "low" if judgment.verdict == "not_relevant" else rule_priority
    return {"relevant": "default", "maybe": "low"}.get(judgment.verdict)


def judge_notices(
    notices: list[Notice],
    source_names: dict[str, str],
    profile: dict,
    model: str,
    api_key: str,
    client: object | None = None,
) -> dict[str, Judgment]:
    if not notices:
        return {}
    client = client or genai.Client(api_key=api_key)
    articles = [
        {
            "id": f"{notice.source_id}/{notice.article_no}",
            "source_id": notice.source_id,
            "source_name": source_names[notice.source_id],
            "category": notice.category,
            "title": notice.title,
            "posted_on": notice.posted_on.isoformat(),
        }
        for notice in notices
    ]
    prompt = (
        "다음 사용자 프로필을 바탕으로 공지마다 해당 가능성을 판정하세요. "
        "자격이 분명하지 않으면 maybe를 선택하세요. 각 id에 대해 "
        "relevant, maybe, not_relevant 중 하나와 한국어 한 문장 이유(40자 안팎)를 반환하세요. "
        "본문은 제공되지 않으므로 제목에 없는 자격은 단정하지 마세요.\n"
        + json.dumps({"profile": profile, "articles": articles}, ensure_ascii=False)
    )
    allowed = {f"{notice.source_id}/{notice.article_no}" for notice in notices}
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", response_schema=SCHEMA
                ),
            )
            items = json.loads(response.text)["items"]
            result = {}
            for item in items:
                if (
                    item["id"] in allowed
                    and item["verdict"] in VERDICTS
                    and isinstance(item["reason"], str)
                ):
                    result[item["id"]] = Judgment(item["verdict"], item["reason"], model)
            return result
        except Exception:
            if attempt:
                return {}
    return {}
