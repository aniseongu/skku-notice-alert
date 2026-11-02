"""Recent notice snapshots and decisions for static exports."""

import json
from dataclasses import dataclass, field
from pathlib import Path

from skku_notice.deadline import extract_deadline
from skku_notice.judge import Judgment
from skku_notice.model import Match, Notice

MAX_ARCHIVE = 300


@dataclass(frozen=True)
class Archive:
    items: dict[str, dict] = field(default_factory=dict)
    version: int = 1


def load_archive(path: Path) -> Archive:
    if not path.exists():
        return Archive()
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("version") != 1 or not isinstance(raw.get("items"), dict):
        raise ValueError("unsupported archive format")
    return Archive(raw["items"])


def add_notice(
    archive: Archive,
    notice: Notice,
    first_seen: str,
    match: Match | None = None,
    judgment: Judgment | None = None,
    priority: str | None = None,
    notified: bool = False,
) -> Archive:
    key = f"{notice.source_id}/{notice.article_no}"
    deadline = extract_deadline(notice.title, notice.posted_on)
    public = {
        "id": key,
        "source_id": notice.source_id,
        "article_no": notice.article_no,
        "title": notice.title,
        "category": notice.category,
        "url": notice.url,
        "posted_on": notice.posted_on.isoformat(),
        "pinned": notice.pinned,
        "deadline": deadline.isoformat() if deadline else None,
        "first_seen": first_seen,
    }
    personal = {
        "rule_name": match.rule_name if match else None,
        "priority": priority,
        "reasons": list(match.reasons) if match else [],
        "ai": {"verdict": judgment.verdict, "reason": judgment.reason, "model": judgment.model}
        if judgment
        else None,
        "notified": notified,
    }
    items = {**archive.items, key: {"notice": public, "match": personal}}
    ordered = sorted(
        items.items(),
        key=lambda pair: (pair[1]["notice"]["posted_on"], pair[1]["notice"]["first_seen"], pair[0]),
        reverse=True,
    )
    return Archive(dict(ordered[:MAX_ARCHIVE]))


def save_archive(path: Path, archive: Archive) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"version": archive.version, "items": archive.items}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
