"""Write the fixed API v1 JSON format and optional static web shell."""

import json
import shutil
from datetime import datetime
from pathlib import Path

from skku_notice.archive import Archive
from skku_notice.deadline import KST


def export_site(
    destination: Path, archive: Archive, sources: list[dict], now: datetime, web_path: Path = Path("web")
) -> None:
    api = destination / "api/v1"
    api.mkdir(parents=True, exist_ok=True)
    stamp = now.astimezone(KST).isoformat()
    ordered = sorted(
        archive.items.values(),
        key=lambda item: (item["notice"]["posted_on"], item["notice"]["first_seen"], item["notice"]["id"]),
        reverse=True,
    )
    notices = {
        "version": 1,
        "generated_at": stamp,
        "sources": [{"id": source["id"], "name": source["name"], "url": source["url"]} for source in sources],
        "notices": [item["notice"] for item in ordered],
    }
    matched = {
        "version": 1,
        "generated_at": stamp,
        "items": {item["notice"]["id"]: item["match"] for item in ordered},
    }
    for name, data in (("notices.json", notices), ("matched.json", matched)):
        (api / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if web_path.is_dir():
        shutil.copytree(
            web_path,
            destination,
            dirs_exist_ok=True,
            ignore=lambda directory, names: {"sample"} if Path(directory) == web_path else set(),
        )
