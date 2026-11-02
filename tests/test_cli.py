import argparse
import json
from datetime import date
from pathlib import Path

import pytest

from skku_notice import cli
from skku_notice.judge import Judgment
from skku_notice.model import Notice


def test_fixture_dry_run_does_not_write_state(tmp_path: Path, monkeypatch, capsys) -> None:
    state_path = tmp_path / "seen.json"
    monkeypatch.setattr(cli, "STATE_PATH", state_path)
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"), dry_run=True, all=True, from_fixtures=True
    )
    assert cli.run(args) == 0
    lines = capsys.readouterr().out.splitlines()
    assert len([line for line in lines if line.startswith("[")]) == 25
    assert sum("state 없음" in line for line in lines) == 2
    assert not state_path.exists()


def test_missing_rules_exits_two(tmp_path: Path, capsys) -> None:
    args = argparse.Namespace(rules=tmp_path / "missing.yaml", dry_run=True, all=False, from_fixtures=True)
    assert cli.run(args) == 2
    assert "config/rules.example.yaml을 복사하세요" in capsys.readouterr().err


@pytest.mark.parametrize("notify_urls", [None, "  , \n "])
def test_missing_notify_urls_exits_before_state_or_fetch(
    tmp_path: Path, monkeypatch, capsys, notify_urls
) -> None:
    if notify_urls is None:
        monkeypatch.delenv("NOTIFY_URLS", raising=False)
    else:
        monkeypatch.setenv("NOTIFY_URLS", notify_urls)
    monkeypatch.setattr(cli, "load_dotenv", lambda **kwargs: None)
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "fetch_list", lambda *args: (_ for _ in ()).throw(AssertionError("fetch")))
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"), dry_run=False, all=False, from_fixtures=False,
        no_ai=True, export=None,
    )
    assert cli.run(args) == 2
    assert capsys.readouterr().err.strip() == "설정 오류: NOTIFY_URLS 없음"
    assert not cli.STATE_PATH.exists()
    assert not cli.ARCHIVE_PATH.exists()


def test_cli_uses_full_notice_id_for_judgment(tmp_path: Path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "_fixture", lambda source_id: "fixture")
    monkeypatch.setattr(
        cli,
        "parse_list",
        lambda html, source_id, url: [
            Notice(source_id, "123", "신규 안내", None, url, date(2026, 11, 2), False)
        ],
    )
    monkeypatch.setattr(cli, "_profile", lambda: {"status": "학부생"})
    monkeypatch.setenv("GEMINI_API_KEY", "placeholder")
    monkeypatch.setattr(
        cli,
        "judge_notices",
        lambda *args, **kwargs: {
            "cse-notice/123": Judgment("relevant", "학과 판정", "test"),
            "skku-notice01/123": Judgment("not_relevant", "전체 판정", "test"),
        },
    )
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"), dry_run=True, all=True, from_fixtures=True,
        no_ai=False, export=None,
    )
    assert cli.run(args) == 0
    output = capsys.readouterr().out
    assert "AI=relevant: 학과 판정" in output
    assert "AI=not_relevant: 전체 판정" in output


def test_fixture_dry_run_shows_interest_and_high_priority(tmp_path: Path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "INTERESTS_PATH", tmp_path / "missing.yaml")
    monkeypatch.setattr(cli, "_fixture", lambda source_id: "fixture")
    monkeypatch.setattr(
        cli, "parse_list",
        lambda html, source_id, url: [
            Notice(source_id, "123", "겨울 방학 현장실습 모집", "일반", url, date(2026, 11, 2), False)
        ],
    )
    monkeypatch.setenv("INTEREST_KEYWORDS", "겨울방학 인턴")
    args = argparse.Namespace(
        rules=Path("config/rules.example.yaml"), dry_run=True, all=True, from_fixtures=True,
        no_ai=True, export=None,
    )
    assert cli.run(args) == 0
    output = capsys.readouterr().out
    assert "[high] 겨울 방학 현장실습 모집" in output
    assert "관심 겨울방학 인턴" in output


def test_notify_all_sends_unmatched_low_and_exports_notified(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(cli, "load_dotenv", lambda **kwargs: None)
    monkeypatch.setenv("NOTIFY_URLS", "ntfys://placeholder-topic")
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "_fixture", lambda source_id: "fixture")
    current = [Notice(
        "cse-notice", "1", "기존 글", "일반", "https://example.com/1", date(2026, 11, 2), False
    )]
    monkeypatch.setattr(cli, "parse_list", lambda html, source_id, url: [
        Notice(source_id, item.article_no, item.title, item.category, item.url, item.posted_on, False)
        for item in current
    ])
    sent = []
    monkeypatch.setattr(cli, "send_notice", lambda item, source, priority, match, reason, interests:
                        sent.append((priority, match)) or True)
    args = argparse.Namespace(rules=Path("config/rules.example.yaml"), dry_run=False, all=False,
                              from_fixtures=True, no_ai=True, no_canvas=True, export=tmp_path / "site")
    assert cli.run(args) == 0
    assert sent == []
    current.append(Notice("cse-notice", "2", "새 일반 공지", "일반",
                          "https://example.com/2", date(2026, 11, 2), False))
    assert cli.run(args) == 0
    assert sent == [("low", None)] * 2
    matched = json.loads((tmp_path / "site/api/v1/matched.json").read_text())
    assert matched["items"]["cse-notice/2"]["rule_name"] is None
    assert matched["items"]["cse-notice/2"]["notified"] is True
