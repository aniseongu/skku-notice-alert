import json
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import httpx
import pytest

from skku_notice import cli, fetch
from skku_notice.archive import Archive, add_notice
from skku_notice.export import export_site
from skku_notice.fetch import ImageData
from skku_notice.judge import judge_notices
from skku_notice.model import Notice


def notice(number: int) -> Notice:
    return Notice("cse-notice", str(number), "채용", None, "https://example.com", date(2026, 11, 2), False)


@pytest.mark.parametrize("length,expected", [(0, True), (49, True), (50, False)])
def test_image_eligibility_and_one_attempt(tmp_path: Path, monkeypatch, length, expected) -> None:
    now = datetime(2026, 11, 2, tzinfo=ZoneInfo("Asia/Seoul"))
    article = notice(1)
    archive = add_notice(Archive(), article, now.isoformat())
    archive.items["cse-notice/1"].update(body_text="가" * length, images=["https://example.com/1"],
                                         fetched_at=now.isoformat())
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    calls = []
    monkeypatch.setattr(cli, "fetch_images", lambda urls, agent, limit: calls.append(urls) or [])
    archive, _ = cli._images_for_judgment(archive, [article], now, "agent")
    assert bool(calls) is expected
    cli._images_for_judgment(archive, [article], now, "agent")
    assert len(calls) == int(expected)


def test_image_request_limits(tmp_path: Path, monkeypatch) -> None:
    now = datetime(2026, 11, 2, tzinfo=ZoneInfo("Asia/Seoul"))
    articles = [notice(number) for number in range(5)]
    archive = Archive()
    for article in articles:
        archive = add_notice(archive, article, now.isoformat())
        archive.items[f"cse-notice/{article.article_no}"].update(
            body_text="", images=[f"https://example.com/{n}" for n in range(5)],
            fetched_at=now.isoformat(),
        )
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    calls = []
    monkeypatch.setattr(cli, "fetch_images", lambda urls, agent, limit: calls.append(urls) or [])
    archive, _ = cli._images_for_judgment(archive, articles, now, "agent")
    assert [len(urls) for urls in calls] == [3, 3, 3, 1]
    assert archive.items["cse-notice/4"]["image_attempted"] is False


@pytest.mark.parametrize("content_type,chunks,accepted", [
    ("text/html", [b"small"], False),
    ("image/png", [b"x" * (5 * 1024 * 1024), b"x"], False),
    ("image/jpeg; charset=binary", [b"ok"], True),
])
def test_fetch_image_type_and_stream_limit(monkeypatch, content_type, chunks, accepted) -> None:
    def respond(request):
        assert request.headers["User-Agent"] == "test-agent"
        return httpx.Response(200, headers={"Content-Type": content_type},
                              stream=httpx.ByteStream(b"".join(chunks)))

    original_client = httpx.Client
    monkeypatch.setattr(fetch.httpx, "Client", lambda **kwargs: original_client(
        transport=httpx.MockTransport(respond), **kwargs
    ))
    image = fetch.fetch_image("https://example.com/image", "test-agent")
    assert (image is not None) is accepted
    if accepted:
        assert image.mime_type == "image/jpeg"


def test_gemini_image_text_archive_and_export(tmp_path: Path) -> None:
    article = notice(1)
    image = ImageData(b"image bytes", "image/png")

    class Models:
        def generate_content(self, *, model, contents, config):
            assert len(contents) == 3
            assert "cse-notice/1" in contents[1].text
            assert contents[2].inline_data.mime_type == "image/png"
            assert contents[2].inline_data.data == image.data
            return SimpleNamespace(text=json.dumps({"items": [{
                "id": "cse-notice/1", "verdict": "relevant", "reason": "지원 가능해요",
                "summary": "지원해요", "interests": [], "image_text": "그림 속 채용 안내",
            }]}))

    result = judge_notices([article], {"cse-notice": "학과"}, {"year": 4}, "test", "unused",
                           SimpleNamespace(models=Models()), images={"cse-notice/1": [image]})
    archive = add_notice(Archive(), article, "2026-11-02T00:00:00+09:00")
    archive = cli._apply_image_texts(archive, result, {"cse-notice/1": [image]})
    export_site(tmp_path, archive, [], datetime.now(ZoneInfo("Asia/Seoul")), web_path=Path("missing"))
    detail = json.loads((tmp_path / "api/v1/notices/cse-notice/1.json").read_text())
    assert detail["body"] == "그림 속 채용 안내"
    assert detail["body_from_image"] is True
