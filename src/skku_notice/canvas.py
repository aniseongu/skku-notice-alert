# 출처: WhaleExtentions/extensions/icampus-check/executescript.js
"""Read favorite Canvas courses and their pending assignments and LearningX modules."""

import json
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

from skku_notice.canvas_alerts import CanvasItem

BASE = "https://canvas.skku.edu"
FAVORITES = "/api/v1/users/self/favorites/courses?per_page=100"
OFFLINE_TYPES = {"none", "on_paper", "not_graded"}


class CanvasError(Exception):
    """A safe error code; never includes request details."""


def _get_pages(client: httpx.Client, path: str, gap: float = 1.0) -> list[dict]:
    rows: list[dict] = []
    url = urljoin(BASE, path)
    visited = set()
    while url and len(visited) < 25:
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.netloc != "canvas.skku.edu" or url in visited:
            raise CanvasError("잘못된 페이지 링크")
        visited.add(url)
        for attempt in range(3):
            try:
                response = client.get(url)
            except httpx.RequestError:
                if attempt == 2:
                    raise CanvasError("Canvas 연결 실패") from None
                time.sleep(2**attempt)
                continue
            if response.status_code == 401:
                raise CanvasError("토큰 거절")
            if response.status_code >= 500 and attempt < 2:
                time.sleep(2**attempt)
                continue
            if not response.is_success:
                raise CanvasError(f"Canvas HTTP {response.status_code}")
            break
        try:
            data = json.loads(response.text.removeprefix("while(1);"))
        except ValueError:
            raise CanvasError("Canvas 응답 형식 오류") from None
        if not isinstance(data, list):
            raise CanvasError("Canvas 목록 형식 오류")
        rows.extend(data)
        link = response.links.get("next", {}).get("url")
        url = urljoin(BASE, link) if link else ""
        if url:
            time.sleep(gap)
    if url:
        raise CanvasError("Canvas 페이지 제한 초과")
    return rows


def _dt(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else None
    except ValueError:
        return None


def _assignment(course: dict, row: dict, now: datetime) -> CanvasItem | None:
    if not row.get("id") or not row.get("name") or row.get("published") is False:
        return None
    submission = row.get("submission") or {}
    done = bool(
        submission.get("submitted_at")
        or submission.get("excused")
        or submission.get("grade") not in (None, "")
        or submission.get("workflow_state") in {"submitted", "graded", "pending_review"}
    )
    due = _dt(row.get("due_at")) or _dt(row.get("lock_at"))
    unlock = _dt(row.get("unlock_at"))
    lock = _dt(row.get("lock_at"))
    types = set(row.get("submission_types") or [])
    if (
        done
        or not due
        or due <= now
        or (unlock and unlock > now)
        or (lock and lock <= now)
        or row.get("locked_for_user")
        or (types and types <= OFFLINE_TYPES)
    ):
        return None
    quiz = bool(
        "online_quiz" in types
        or row.get("quiz_id")
        or row.get("is_quiz_assignment")
        or any(word in row["name"].casefold() for word in ("퀴즈", "시험", "quiz", "exam"))
    )
    course_id = str(course["id"])
    url = row.get("html_url") or f"{BASE}/courses/{course_id}/assignments/{row['id']}"
    if urlsplit(url).netloc != "canvas.skku.edu":
        url = f"{BASE}/courses/{course_id}/assignments/{row['id']}"
    return CanvasItem(
        f"{course_id}:assignment:{row['id']}",
        row["name"],
        course["name"],
        "퀴즈" if quiz else "과제",
        due,
        url,
    )


def _lecture(course: dict, row: dict, now: datetime) -> CanvasItem | None:
    info = row.get("content_data") or {}
    due = _dt(info.get("due_at"))
    if (
        not info.get("use_attendance")
        or not due
        or due <= now
        or row.get("attendance_status") == "attendance"
        or row.get("completed")
        or (_dt(info.get("unlock_at")) and _dt(info["unlock_at"]) > now)
    ):
        return None
    item_id = row.get("module_item_id") or row.get("id")
    if not item_id or not row.get("title"):
        return None
    course_id = str(course["id"])
    key_id = row.get("content_id") or info.get("id") or item_id
    return CanvasItem(
        f"{course_id}:lecture:{key_id}",
        row["title"],
        course["name"],
        "강의",
        due,
        f"{BASE}/courses/{course_id}/modules/items/{item_id}",
    )


def read_canvas(
    token: str, now: datetime, fixture_dir: Path | None = None, gap: float = 1.0
) -> list[CanvasItem]:
    """Use fixture responses or sequential, bearer-authenticated API calls."""
    if fixture_dir:

        def read(name: str) -> list[dict]:
            data = json.loads((fixture_dir / name).read_text(encoding="utf-8"))
            if not isinstance(data, list):
                raise CanvasError("Canvas fixture 목록 형식 오류")
            return data

        courses = read("favorites.json")
    else:
        client = httpx.Client(
            headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
            timeout=10.0,
            follow_redirects=False,
        )
        try:
            courses = _get_pages(client, FAVORITES, gap)
            return _read_courses(courses, now, lambda path: _get_pages(client, path, gap), gap, True)
        finally:
            client.close()
    return _read_courses(courses, now, read, 0, False)


def _read_courses(courses: list[dict], now: datetime, get, gap: float, network: bool) -> list[CanvasItem]:
    found: dict[str, CanvasItem] = {}
    for course in courses:
        if not isinstance(course, dict) or not str(course.get("id", "")).isdigit() or not course.get("name"):
            continue
        course_id = str(course["id"])
        if network:
            time.sleep(gap)
        assignments = get(
            f"assignments_{course_id}.json"
            if not network
            else f"/api/v1/courses/{course_id}/assignments?include%5B%5D=submission&per_page=100"
        )
        if network:
            time.sleep(gap)
        modules = get(
            f"modules_{course_id}.json" if not network else f"/learningx/api/v1/courses/{course_id}/modules"
        )
        for row in assignments:
            item = _assignment(course, row, now)
            if item:
                found[item.key] = item
        for module in modules:
            for row in module.get("module_items") or []:
                item = _lecture(course, row, now)
                if item and item.key not in found:
                    found[item.key] = item
    return sorted(found.values(), key=lambda item: (item.due, item.key))
