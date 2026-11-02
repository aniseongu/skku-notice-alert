import json
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from skku_notice import cli
from skku_notice.archive import Archive, add_notice
from skku_notice.export import export_site
from skku_notice.fetch import FetchError
from skku_notice.judge import SCHEMA, judge_notices
from skku_notice.model import Notice
from skku_notice.parse import ParseError, parse_detail

FIXTURES = Path(__file__).parent / "fixtures"


def make_notice(number: int) -> Notice:
    return Notice("cse-notice", str(number), "모집", None,
                  f"https://cse.skku.edu/cse/notice.do?mode=view&articleNo={number}",
                  date(2026, 11, 2), False)


def test_detail_fixtures() -> None:
    skku = (FIXTURES / "skku_notice01_view_141498_2026-11-02.html").read_text()
    detail = parse_detail(skku, "https://www.skku.edu/skku/campus/skk_comm/notice01.do")
    assert "성균관대 창업지원단" in detail.body_text
    assert len(detail.attachments) == 2
    assert detail.images == ("https://www.skku.edu/_attach/image/2026/11/kZLqHbhAfbssKRHGyaXE.png",)
    assert detail.attachments[0][1].startswith("https://www.skku.edu/")
    assert "\n\n\n" not in detail.body_text
    cse = (FIXTURES / "cse_notice_view_227923_2026-11-02.html").read_text()
    cse_detail = parse_detail(cse, "https://cse.skku.edu/cse/notice.do")
    assert cse_detail.body_text == ""
    assert cse_detail.images == (
        "https://cse.skku.edu/_res/editor_image/2026/11/pUZGIAUXiakYxQErSSXq0.png",)
    with pytest.raises(ParseError):
        parse_detail("<html>missing</html>", "https://example.com")
    assert parse_detail("<dl class='board-write-box'><dd><p>A<script>bad</script> B</p><p>C</p></dd></dl>",
                        "https://example.com").body_text == "A B\nC"


def test_detail_images_are_filtered_deduplicated_and_limited() -> None:
    html = "<dl class='board-write-box'><dd>" + "".join(
        f"<img src='/uploads/{number}.png'>" for number in range(12)
    ) + "<img src='/uploads/0.png'><img src='/_res/cse/img/common/sns_insta.png'>" \
        "<img src='/uploads/ico_share.png'><img src='javascript:bad'></dd></dl>"
    images = parse_detail(html, "https://cse.skku.edu/cse/notice.do").images
    assert len(images) == 10
    assert images == tuple(f"https://cse.skku.edu/uploads/{number}.png" for number in range(10))


def test_detail_limit_retry_and_baseline(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    notices = [make_notice(number) for number in range(10)]
    archive = Archive()
    for notice in notices:
        archive = add_notice(archive, notice, "2026-11-02T00:00:00+09:00")
    seen = {"0": SimpleNamespace(status="baseline")}
    state = SimpleNamespace(sources={"cse-notice": SimpleNamespace(seen=seen)})
    calls = []
    monkeypatch.setattr(cli.time, "sleep", lambda seconds: None)

    def fail(url, user_agent, timeout):
        calls.append(url)
        raise FetchError("offline")

    monkeypatch.setattr(cli, "fetch_detail", fail)
    now = datetime(2026, 11, 2, tzinfo=ZoneInfo("Asia/Seoul"))
    boards = [({"id": "cse-notice"}, notices)]
    settings = {"user_agent": "test", "timeout_seconds": 10}
    for _ in range(3):
        archive = cli._fill_details(archive, state, boards, settings, False, now)
    assert len(calls) == 15
    assert all("articleNo=0" not in url for url in calls)
    assert archive.items["cse-notice/1"]["body_attempts"] == 3
    assert archive.items["cse-notice/5"]["body_attempts"] == 3
    assert archive.items["cse-notice/6"]["body_attempts"] == 0
    archive = cli._fill_details(archive, state, boards, settings, False, now)
    assert len(calls) == 19


def test_fixture_detail_is_fetched_once(tmp_path: Path, monkeypatch) -> None:
    notice = make_notice(227923)
    state = SimpleNamespace(sources={"cse-notice": SimpleNamespace(seen={})})
    now = datetime(2026, 11, 2, tzinfo=ZoneInfo("Asia/Seoul"))
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    archive = cli._fill_details(Archive(), state, [({"id": "cse-notice"}, [notice])], {}, True, now)
    item = archive.items["cse-notice/227923"]
    assert item["body_text"] == ""
    assert item["images"] == [
        "https://cse.skku.edu/_res/editor_image/2026/11/pUZGIAUXiakYxQErSSXq0.png"]
    assert item["body_attempts"] == 1
    again = cli._fill_details(archive, state, [({"id": "cse-notice"}, [notice])], {}, True, now)
    assert again.items["cse-notice/227923"]["body_attempts"] == 1


def test_detail_export_and_gemini_schema(tmp_path: Path) -> None:
    notice = make_notice(123)
    archive = add_notice(Archive(), notice, "2026-11-02T00:00:00+09:00")
    item = archive.items["cse-notice/123"]
    item.update(body_text="본문", attachments=[{"name": "파일", "url": "https://example.com/a"}],
                images=["https://example.com/image.png"],
                summary="지원자는 신청해요.", fetched_at="2026-11-02T01:00:00+09:00")
    export_site(tmp_path, archive, [], datetime.now(ZoneInfo("Asia/Seoul")), web_path=tmp_path / "missing")
    output = json.loads((tmp_path / "api/v1/notices/cse-notice/123.json").read_text())
    assert output == {"version": 1, "id": "cse-notice/123", "summary": "지원자는 신청해요.",
                      "body": "본문", "attachments": [{"name": "파일", "url": "https://example.com/a"}],
                      "images": ["https://example.com/image.png"],
                      "fetched_at": "2026-11-02T01:00:00+09:00"}
    assert "summary" in SCHEMA["properties"]["items"]["items"]["required"]

    class Models:
        def generate_content(self, *, model, contents, config):
            article = json.loads(contents.split("\n", 1)[1])["articles"][0]
            assert article["body"] == "가" * 1500
            result = {"items": [{"id": "cse-notice/123", "verdict": "relevant",
                                 "reason": "지원할 수 있어요", "summary": "신청해요", "interests": []}]}
            return SimpleNamespace(text=json.dumps(result))

    client = SimpleNamespace(models=Models())
    result = judge_notices([notice], {"cse-notice": "학과"}, {}, "test", "unused", client,
                           bodies={"cse-notice/123": "가" * 2000})
    assert result["cse-notice/123"].summary == "신청해요"
