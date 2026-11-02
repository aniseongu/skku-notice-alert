import argparse
import json
from datetime import date, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import pytest
from apprise import Apprise

from skku_notice import cli
from skku_notice.archive import Archive, add_notice
from skku_notice.export import export_site
from skku_notice.judge import Judgment, decide_priority, judge_notices
from skku_notice.model import Match, Notice
from skku_notice.notify import _url_for_notice
from skku_notice.state import load_state


@pytest.fixture
def notice() -> Notice:
    return Notice(
        "cse-notice",
        "123",
        "인턴 모집(~11.12(목))",
        "채용/모집",
        "https://example.com/view?articleNo=123",
        date(2026, 11, 2),
        False,
    )


@pytest.mark.parametrize(
    ("matched", "verdict", "expected"),
    [
        (True, "relevant", "high"),
        (True, "maybe", "high"),
        (True, "not_relevant", "low"),
        (True, None, "high"),
        (False, "relevant", "default"),
        (False, "maybe", "low"),
        (False, "not_relevant", None),
        (False, None, None),
    ],
)
def test_decision_table(notice, matched, verdict, expected) -> None:
    match = Match(notice, "장학", "high", ()) if matched else None
    ai = Judgment(verdict, "이유", "test-model") if verdict else None
    assert decide_priority(match, ai) == expected


def test_judge_batches_and_retries(notice) -> None:
    class Models:
        calls = 0

        def generate_content(self, *, model, contents, config):
            self.calls += 1
            assert model == "test-model"
            assert "학부생" in contents and "123" in contents
            assert config.response_mime_type == "application/json"
            assert config.response_schema["required"] == ["items"]
            if self.calls == 1:
                raise ConnectionError("offline")
            return type(
                "Response",
                (),
                {
                    "text": json.dumps(
                        {
                            "items": [
                                {"article_no": "123", "verdict": "relevant", "reason": "학부생 지원 가능"}
                            ]
                        }
                    )
                },
            )()

    client = type("Client", (), {"models": Models()})()
    assert (
        judge_notices([notice], {"cse-notice": "학과"}, {"status": "학부생"}, "test-model", "unused", client)[
            "123"
        ].verdict
        == "relevant"
    )
    assert client.models.calls == 2


def test_ntfy_url_has_click_and_numeric_priority(notice) -> None:
    result = _url_for_notice("ntfys://placeholder-topic", notice, "high")
    query = parse_qs(urlsplit(result).query)
    assert query == {"click": [notice.url], "priority": ["4"]}
    sender = Apprise()
    assert sender.add(result)
    plugin = next(iter(sender))
    assert plugin.click == notice.url
    assert plugin.priority == "high"  # Apprise normalizes 4 to ntfy's high level.
    assert parse_qs(urlsplit(_url_for_notice("ntfys://topic", notice, "low")).query)["priority"] == ["2"]


def test_export_api_v1_shape_and_web_copy(tmp_path: Path, notice) -> None:
    now = datetime(2026, 11, 2, 19, tzinfo=ZoneInfo("Asia/Seoul"))
    match = Match(notice, "인턴", "default", ("title_any:인턴",))
    archive = add_notice(
        Archive(),
        notice,
        now.isoformat(),
        match,
        Judgment("relevant", "지원 가능", "test-model"),
        "default",
        True,
    )
    web = tmp_path / "web"
    (web / "sample").mkdir(parents=True)
    (web / "index.html").write_text("ok")
    (web / "sample/example.json").write_text("{}")
    output = tmp_path / "site"
    export_site(
        output, archive, [{"id": "cse-notice", "name": "학과", "url": "https://example.com"}], now, web
    )
    public = json.loads((output / "api/v1/notices.json").read_text())
    private = json.loads((output / "api/v1/matched.json").read_text())
    assert set(public) == {"version", "generated_at", "sources", "notices"}
    assert set(public["notices"][0]) == {
        "id",
        "source_id",
        "article_no",
        "title",
        "category",
        "url",
        "posted_on",
        "pinned",
        "deadline",
        "first_seen",
    }
    assert set(private) == {"version", "generated_at", "items"}
    assert set(private["items"]["cse-notice/123"]) == {"rule_name", "priority", "reasons", "ai", "notified"}
    assert set(private["items"]["cse-notice/123"]["ai"]) == {"verdict", "reason", "model"}
    assert public["notices"][0]["deadline"] == "2026-11-12T23:59:00+09:00"
    assert (output / "index.html").exists()
    assert not (output / "sample").exists()


def test_actual_run_baseline_then_retry(tmp_path: Path, monkeypatch, notice) -> None:
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "_fixture", lambda source_id: "fixture")
    current = [notice]
    monkeypatch.setattr(
        cli,
        "parse_list",
        lambda html, source_id, url: [
            Notice(
                source_id, item.article_no, item.title, item.category, item.url, item.posted_on, item.pinned
            )
            for item in current
        ],
    )
    sends = []
    attempts = {}

    def fake_send(item, source_name, priority, match, reason):
        sends.append(item.article_no)
        attempts[source_name] = attempts.get(source_name, 0) + 1
        return attempts[source_name] > 1

    monkeypatch.setattr(cli, "send_notice", fake_send)
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"),
        dry_run=False,
        all=False,
        from_fixtures=True,
        no_ai=True,
        export=None,
    )
    assert cli.run(args) == 0
    assert sends == []
    assert load_state(cli.STATE_PATH).sources["cse-notice"].seen["123"].status == "baseline"
    current.append(
        Notice("cse-notice", "124", "새 인턴 모집", "채용/모집", notice.url, notice.posted_on, False)
    )
    assert cli.run(args) == 1
    assert load_state(cli.STATE_PATH).sources["cse-notice"].seen["124"].status == "pending"
    changed_rules = tmp_path / "changed-rules.yaml"
    changed_rules.write_text("exclude_title: [인턴]\nrules: []\n", encoding="utf-8")
    args.rules = changed_rules
    assert cli.run(args) == 0
    assert load_state(cli.STATE_PATH).sources["cse-notice"].seen["124"].status == "notified"
    assert sends == ["124"] * 4
