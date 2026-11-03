import json
from datetime import datetime

import httpx
import pytest

from skku_notice import gcal
from skku_notice.deadline import KST

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=KST)


def _notice(no: str, deadline: str | None, url: str = "https://cse.skku.edu/") -> dict:
    return {"id": f"cse-notice:{no}", "source_id": "cse-notice", "article_no": no, "title": f"공지 {no}",
            "category": "채용", "url": url + no, "posted_on": "2026-11-01", "pinned": False,
            "deadline": deadline, "first_seen": None}


def test_desired_events_are_mine_and_saved_with_future_deadlines():
    notices = [
        _notice("1", "2026-11-16T10:00:00+09:00"),   # 기준에 맞음
        _notice("2", "2026-11-16T10:00:00+09:00"),   # 해당 없음
        _notice("3", "2026-11-01T10:00:00+09:00"),   # 지난 마감
        _notice("4", "2026-11-20T23:59:00+09:00"),   # 저장만
        _notice("5", None),                           # 마감 없음
        _notice("6", "2026-11-16T10:00:00+09:00", url="javascript:alert"),
    ]
    matched = {
        "cse-notice:1": {"rule_name": "채용", "interests": []},
        "cse-notice:2": {"rule_name": "채용", "ai": {"verdict": "not_relevant", "interests": []}},
        "cse-notice:3": {"rule_name": "채용"},
        "cse-notice:6": {"rule_name": "채용"},
    }
    events = gcal.desired_events(notices, matched, [notices[3], {"bad": 1}], NOW)
    titles = sorted(event["summary"] for event in events.values())
    assert titles == ["[마감] 공지 1", "[마감] 공지 4"]
    first = events[gcal._event_id("cse-notice:1")]
    assert first["start"]["dateTime"] == "2026-11-16T09:30:00+09:00"
    assert first["end"]["dateTime"] == "2026-11-16T10:00:00+09:00"
    assert first["extendedProperties"]["private"][gcal.MARK] == "cse-notice:1"
    assert all(set(key) <= set("abcdefghijklmnopqrstuv0123456789") for key in events)


def test_sync_only_touches_events_this_app_made():
    keep = gcal.desired_events([_notice("1", "2026-11-16T10:00:00+09:00")],
                               {"cse-notice:1": {"rule_name": "채용"}}, [], NOW)
    new = gcal.desired_events([_notice("9", "2026-11-18T10:00:00+09:00")],
                              {"cse-notice:9": {"rule_name": "채용"}}, [], NOW)
    keep_id = next(iter(keep))
    listing = {"items": [
        {"id": keep_id, **keep[keep_id]},
        {"id": "skkuoldone", "extendedProperties": {"private": {gcal.MARK: "cse-notice:old"}}},
        {"id": "mine123", "summary": "사용자가 직접 넣은 일정"},
    ]}
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path.rsplit("/", 1)[-1]))
        if request.method == "GET":
            return httpx.Response(200, json=listing)
        return httpx.Response(200 if request.method != "DELETE" else 204, json={})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = gcal.sync(client, "abc@group.calendar.google.com", {**keep, **new})
    assert result == (1, 0, 1)
    assert ("POST", "events") in calls
    assert ("DELETE", "skkuoldone") in calls
    assert not any(target == "mine123" for _, target in calls)


def test_revoked_google_connection_has_a_safe_message():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant", "error_description": "SECRET_DETAIL"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(gcal.CalendarError) as caught:
            gcal.access_token(client, "id", "secret", "refresh")
    assert "다시 연결" in str(caught.value)
    assert "SECRET" not in str(caught.value)


def test_main_skips_until_connected(monkeypatch, capsys, tmp_path):
    for name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_CALENDAR_ID"):
        monkeypatch.delenv(name, raising=False)
    assert gcal.main(tmp_path) == 0
    assert "연결 전" in capsys.readouterr().out


def test_main_reports_counts_without_secrets(monkeypatch, capsys, tmp_path):
    notices = {"notices": [_notice("1", "2026-12-16T10:00:00+09:00")]}
    (tmp_path / "notices.json").write_text(json.dumps(notices))
    (tmp_path / "matched.json").write_text(json.dumps({"items": {"cse-notice:1": {"rule_name": "채용"}}}))
    settings = {
        "GOOGLE_CLIENT_ID": "client-id-value", "GOOGLE_CLIENT_SECRET": "client-secret-value",
        "GOOGLE_REFRESH_TOKEN": "refresh-token-value", "GOOGLE_CALENDAR_ID": "abc@group.calendar.google.com",
    }
    for name, value in settings.items():
        monkeypatch.setenv(name, value)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "access-token-value"})
        if request.method == "GET":
            return httpx.Response(200, json={"items": []})
        return httpx.Response(200, json={})

    real = httpx.Client
    monkeypatch.setattr(gcal.httpx, "Client", lambda **kwargs: real(transport=httpx.MockTransport(handler)))
    assert gcal.main(tmp_path) == 0
    out = capsys.readouterr()
    assert "넣음 1" in out.out
    assert "token-value" not in out.out + out.err and "secret-value" not in out.out + out.err
