import argparse
import os
from dataclasses import replace
from datetime import datetime, time, timedelta
from pathlib import Path

import httpx

from skku_notice import canvas, cli
from skku_notice.archive import Archive
from skku_notice.canvas_alerts import CanvasState, mark_sent, plan_alerts
from skku_notice.deadline import KST
from skku_notice.export import export_site

FIXTURES = Path("tests/fixtures/canvas")
NOW = datetime(2026, 11, 2, 20, 40, tzinfo=KST)


def test_fixture_filters_completed_and_classifies() -> None:
    items = canvas.read_canvas("", NOW, FIXTURES)
    assert [(item.kind, item.title) for item in items] == [
        ("강의", "그래프 강의"),
        ("과제", "트리 과제"),
        ("퀴즈", "중간 퀴즈"),
    ]


def test_baseline_missed_lead_and_ttl() -> None:
    items = canvas.read_canvas("", NOW, FIXTURES)
    alerts, baseline = plan_alerts(items, CanvasState(), NOW, [1440, 180], time(9))
    assert len(alerts) == 3  # dry-run preview; the CLI suppresses first-run delivery
    assert "101:lecture:301|m180" in baseline.notified
    state = mark_sent(baseline, alerts[0], NOW)
    later = NOW + timedelta(minutes=1)
    alerts, _ = plan_alerts(items, state, later, [1440, 180], time(9))
    assert not alerts
    aged = replace(state, notified={"old|m180": (NOW - timedelta(days=31)).isoformat()})
    _, trimmed = plan_alerts(items, aged, later, [1440, 180], time(9))
    assert "old|m180" not in trimmed.notified


def test_missing_larger_lead_sends_smallest_once() -> None:
    items = canvas.read_canvas("", NOW, FIXTURES)
    alerts, state = plan_alerts(items, CanvasState(initialized=True), NOW, [1440, 180], time(9))
    lecture = next(alert for alert in alerts if "그래프 강의" in alert.body)
    assert lecture.keys == ("101:lecture:301|m180", "101:lecture:301|m1440")
    state = mark_sent(state, lecture, NOW)
    alerts, _ = plan_alerts(items, state, NOW, [1440, 180], time(9))
    assert not any("그래프 강의" in alert.body for alert in alerts)


def test_network_401_has_no_request_details(monkeypatch) -> None:
    request = httpx.Request("GET", "https://canvas.skku.edu/api/v1/users/self/favorites/courses?secret=x")
    client = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(401, request=request)))
    try:
        try:
            canvas._get_pages(client, canvas.FAVORITES, 0)
            raise AssertionError("expected CanvasError")
        except canvas.CanvasError as exc:
            assert str(exc) == "토큰 거절"
            assert "secret" not in str(exc)
    finally:
        client.close()


def test_export_contains_no_canvas_data(tmp_path: Path) -> None:
    export_site(tmp_path, Archive(), [], NOW, tmp_path / "missing-web")
    assert not (tmp_path / "canvas.json").exists()
    assert not (tmp_path / "api/v1/canvas.json").exists()
    assert "assignment" not in (tmp_path / "api/v1/notices.json").read_text()


def test_cli_fixture_dry_run_does_not_write_canvas_state(tmp_path: Path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "CANVAS_STATE_PATH", tmp_path / "canvas.json")
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "load_dotenv", lambda **kwargs: None)
    monkeypatch.delenv("CANVAS_TOKEN", raising=False)
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"),
        dry_run=True,
        all=True,
        from_fixtures=True,
        no_ai=True,
        canvas_fixtures=FIXTURES,
        no_canvas=False,
        export=None,
    )
    assert cli.run(args) == 0
    output = capsys.readouterr().out
    assert "[새 글]" in output
    assert "[Canvas 알림 예정]" in output
    assert "그래프 강의" in output
    assert not cli.CANVAS_STATE_PATH.exists()


def test_rejected_token_problem_is_sent_once(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(cli, "CANVAS_STATE_PATH", tmp_path / "canvas.json")
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "load_dotenv", lambda **kwargs: None)
    monkeypatch.setenv("NOTIFY_URLS", "ntfys://fake-topic")
    monkeypatch.setenv("CANVAS_TOKEN", "fake-token")
    monkeypatch.setattr(
        cli, "read_canvas", lambda *args: (_ for _ in ()).throw(canvas.CanvasError("토큰 거절"))
    )
    sent = []
    monkeypatch.setattr(cli, "send_canvas", lambda *args: sent.append(args) or True)
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"),
        dry_run=False,
        all=False,
        from_fixtures=True,
        no_ai=True,
        canvas_fixtures=None,
        no_canvas=False,
        export=None,
    )
    assert cli.run(args) == 1
    os.utime(cli.CANVAS_STATE_PATH, (0, 0))
    assert cli.run(args) == 1
    assert len(sent) == 1
    assert sent[0][:2] == (
        "아이캠퍼스 연결이 끊겼어요",
        "설정 화면에서 아이캠퍼스 토큰을 새로 넣어 주세요",
    )
    saved = cli.load_canvas_state(cli.CANVAS_STATE_PATH)
    assert saved.problem == {"code": "token-rejected", "notifiedProblem": True}
    assert "fake-token" not in cli.CANVAS_STATE_PATH.read_text()
