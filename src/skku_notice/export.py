"""Write the fixed API v1 JSON format and optional static web shell."""

import json
import shutil
from datetime import datetime
from pathlib import Path

from skku_notice.archive import Archive
from skku_notice.deadline import KST


def export_site(
    destination: Path, archive: Archive, sources: list[dict], now: datetime, web_path: Path = Path("web/dist")
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
    # D-010 API v1의 기존 이름을 유지하고 interests는 추가 필드로 넣는다.
    personal = {}
    for item in ordered:
        decision = item["match"].copy()
        decision.setdefault("interests", [])
        if decision.get("ai") is not None:
            decision["ai"] = {**decision["ai"], "interests": decision["ai"].get("interests", [])}
        personal[item["notice"]["id"]] = decision
    matched = {
        "version": 1,
        "generated_at": stamp,
        "items": personal,
    }
    for name, data in (("notices.json", notices), ("matched.json", matched)):
        (api / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for item in ordered:
        notice = item["notice"]
        target = api / "notices" / notice["source_id"] / f"{notice['article_no']}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        detail = {
            "version": 1, "id": notice["id"], "summary": item.get("summary"),
            "body": item.get("body_text"), "attachments": item.get("attachments", []),
            "images": item.get("images", []),
            "body_from_image": item.get("body_from_image", False),
            "ocr_engine": item.get("ocr_engine"),
            "fetched_at": item.get("fetched_at"),
        }
        target.write_text(json.dumps(detail, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if web_path.is_dir():
        shutil.copytree(web_path, destination, dirs_exist_ok=True)
