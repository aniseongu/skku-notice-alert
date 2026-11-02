"""Batch Gemini relevance judgments; failures leave rule matching in charge."""

import json
from dataclasses import dataclass

from google import genai
from google.genai import types

from skku_notice.fetch import ImageData
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
                    "summary": {"type": "STRING"},
                    "image_text": {"type": "STRING"},
                    "interests": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["id", "verdict", "reason", "summary", "interests", "image_text"],
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
    interests: tuple[str, ...] = ()
    summary: str | None = None
    image_text: str = ""


def decide_priority(
    match: object | None, judgment: Judgment | None, interests: tuple[str, ...] = ()
) -> str | None:
    if interests or (judgment and judgment.interests):
        return "high"
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
    interests: tuple[str, ...] = (),
    bodies: dict[str, str] | None = None,
    images: dict[str, list[ImageData]] | None = None,
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
            "body": (bodies or {}).get(f"{notice.source_id}/{notice.article_no}", "")[:1500],
        }
        for notice in notices
    ]
    prompt = (
        "다음 사용자 프로필을 바탕으로 공지마다 해당 가능성을 판정하세요. "
        "자격이 분명하지 않으면 maybe를 선택하세요. 각 id에 대해 "
        "relevant, maybe, not_relevant 중 하나와 해요체 한 문장 이유(40자 안팎)를 반환하세요. "
        "summary는 해요체 1~3문장으로, 각 문장을 줄바꿈으로 구분하세요. "
        "누가 언제까지 무엇을 하면 되는지 위주로 쓰세요. "
        "이유 문장에서 판정어(해당, 확인 필요, 해당 없음)를 되풀이하지 마세요. "
        "interests에는 주어진 관심 키워드 중 글과 뜻이 맞는 값만 넣으세요. "
        "글자에 직접 없어도 뜻이 맞으면 포함하고, 관심 키워드가 없으면 빈 배열로 반환하세요. "
        "본문이 빈 글은 제목만으로 판정하고 모르는 자격은 단정하지 마세요.\n"
        + json.dumps({"profile": profile, "interests": interests, "articles": articles}, ensure_ascii=False)
    )
    contents: str | list[types.Part] = prompt
    if images:
        image_instruction = (
            "\n그림을 포함한 글은 그림 내용도 판정, 이유, 요약에 반영하세요. "
            "각 글의 image_text에는 그림 속 글자를 읽기 순서대로 옮겨 적고, "
            "글자가 없으면 빈 문자열을 쓰세요."
        )
        parts = [types.Part.from_text(text=prompt + image_instruction)]
        for notice in notices:
            notice_id = f"{notice.source_id}/{notice.article_no}"
            for number, image in enumerate(images.get(notice_id, []), 1):
                parts.append(types.Part.from_text(text=f"글 id={notice_id}, 그림 {number}"))
                parts.append(types.Part.from_bytes(data=image.data, mime_type=image.mime_type))
        contents = parts
    allowed = {f"{notice.source_id}/{notice.article_no}" for notice in notices}
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
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
                    selected = item.get("interests", [])
                    if not isinstance(selected, list):
                        selected = []
                    chosen = tuple(word for word in interests if word in selected)
                    result[item["id"]] = Judgment(
                        item["verdict"], item["reason"], model, chosen,
                        item.get("summary") if isinstance(item.get("summary"), str) else None,
                        item.get("image_text") if isinstance(item.get("image_text"), str) else "",
                    )
            return result
        except Exception:
            if attempt:
                return {}
    return {}
