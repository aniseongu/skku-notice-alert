"""Load and match personal interest keywords against notice text."""

import re
from pathlib import Path

import yaml

from skku_notice.model import Notice

SIMILAR = (
    ("인턴", "현장실습", "체험형"),
    ("장학", "장학금"),
    ("공모전", "경진대회", "챌린지"),
)


def load_interests(path: Path, environment: str = "") -> tuple[str, ...]:
    keywords = re.split(r"[,\n]", environment)
    if path.exists():
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("keywords"), list):
            raise ValueError("interests YAML must contain a keywords list")
        if not all(isinstance(item, str) for item in data["keywords"]):
            raise ValueError("interest keywords must be strings")
        keywords.extend(data["keywords"])
    return tuple(dict.fromkeys(word.strip() for word in keywords if word.strip()))


def _compact(value: str) -> str:
    return "".join(value.casefold().split())


def match_interests(notice: Notice, keywords: tuple[str, ...], ocr_text: str = "") -> tuple[str, ...]:
    haystack = _compact(f"{notice.title} {notice.category or ''} {ocr_text}")
    matched = []
    for keyword in keywords:
        words = keyword.split()
        if words and all(
            any(_compact(variant) in haystack for variant in next(
                (group for group in SIMILAR if word.casefold() in group), (word,)
            ))
            for word in words
        ):
            matched.append(keyword)
    return tuple(matched)
