"""Send notice notifications through Apprise."""

import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import apprise

from skku_notice.deadline import KST, extract_deadline
from skku_notice.model import Match, Notice

PRIORITIES = {"high": "4", "default": "3", "low": "2"}


def _url_for_notice(url: str, notice: Notice, priority: str) -> str:
    if urlsplit(url).scheme not in {"ntfy", "ntfys"}:
        return url
    parts = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key not in {"click", "priority"}
    ]
    query.extend((("click", notice.url), ("priority", PRIORITIES[priority])))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def send_notice(
    notice: Notice, source_name: str, priority: str, match: Match | None, ai_reason: str | None
) -> bool:
    urls = [value.strip() for value in os.environ.get("NOTIFY_URLS", "").split(",") if value.strip()]
    if not urls:
        return False
    body = []
    if ai_reason:
        body.append(ai_reason)
    deadline = extract_deadline(notice.title, notice.posted_on)
    if deadline:
        local = deadline.astimezone(KST)
        weekday = "월화수목금토일"[local.weekday()]
        label = f"마감 {local.month}월 {local.day}일({weekday})"
        if (local.hour, local.minute) != (23, 59):
            label += f" {local:%H:%M}"
        body.append(label)
    if match:
        body.append(f"규칙: {match.rule_name}")
    sender = apprise.Apprise()
    for url in urls:
        if not sender.add(_url_for_notice(url, notice, priority)):
            return False
    try:
        return bool(sender.notify(title=f"[{source_name}] {notice.title}", body="\n".join(body) or "새 공지"))
    except Exception:
        return False


def send_canvas(title: str, body: str, click_url: str, priority: str) -> bool:
    """Send one private Canvas alert with the same Apprise channel as notices."""
    urls = [value.strip() for value in os.environ.get("NOTIFY_URLS", "").split(",") if value.strip()]
    if not urls:
        return False
    sender = apprise.Apprise()
    for url in urls:
        parts = urlsplit(url)
        if parts.scheme in {"ntfy", "ntfys"}:
            query = [
                (key, value)
                for key, value in parse_qsl(parts.query)
                if key not in {"click", "priority", "tags"}
            ]
            query.extend((("click", click_url), ("priority", PRIORITIES[priority]), ("tags", "alarm")))
            url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
        if not sender.add(url):
            return False
    try:
        return bool(sender.notify(title=title, body=body))
    except Exception:
        return False
