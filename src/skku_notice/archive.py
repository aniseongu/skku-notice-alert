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
    interests: tuple[str, ...] = (),
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
        "interests": list(interests),
        "reasons": list(match.reasons) if match else [],
        "ai": {
            "verdict": judgment.verdict,
            "reason": judgment.reason,
            "model": judgment.model,
            "interests": list(judgment.interests),
        }
        if judgment
        else None,
        "notified": notified,
    }
    old = archive.items.get(key, {})
    items = {**archive.items, key: {
        "notice": public, "match": personal,
        "body_text": old.get("body_text"),
        "attachments": old.get("attachments", []),
        "images": old.get("images", []),
        "summary": judgment.summary if judgment and judgment.summary else old.get("summary"),
        "body_attempts": old.get("body_attempts", 0),
        "body_pending": old.get("body_pending", False),
        "fetched_at": old.get("fetched_at"),
    }}
    ordered = sorted(
        items.items(),
        key=lambda pair: (pair[1]["notice"]["posted_on"], pair[1]["notice"]["first_seen"], pair[0]),
        reverse=True,
    )
    return Archive(dict(ordered[:MAX_ARCHIVE]))


def update_detail(
    archive: Archive, key: str, body: str | None, attachments: tuple[tuple[str, str], ...],
    fetched_at: str | None, images: tuple[str, ...] = (),
) -> Archive:
    item = archive.items[key]
    updated = {**item, "body_text": body, "body_pending": body is None, "attachments": [
        {"name": name, "url": url} for name, url in attachments
    ], "images": list(images), "fetched_at": fetched_at,
        "body_attempts": item.get("body_attempts", 0) + 1}
    return Archive({**archive.items, key: updated})


def save_archive(path: Path, archive: Archive) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"version": archive.version, "items": archive.items}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
