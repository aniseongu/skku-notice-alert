from datetime import date

from skku_notice import cli
from skku_notice.archive import Archive, add_notice, note_body_change, note_list_changes, refresh_media
from skku_notice.export import _public_notice
from skku_notice.model import Notice


def notice(title: str) -> Notice:
    return Notice("cse-notice", "1", title, "채용", "https://cse.skku.edu/cse/notice.do?mode=view&articleNo=1",
                  date(2026, 11, 2), False)


def test_add_notice_keeps_translation_and_ai_deadline():
    archive = add_notice(Archive(), notice("Seminar"), "2026-11-02T00:00:00+09:00")
    key = "cse-notice/1"
    archive = Archive({key: {**archive.items[key], "translation": {"title": "세미나"},
                             "ai_deadline": {"checked": True}}})
    again = add_notice(archive, notice("Seminar"), "2026-11-02T00:00:00+09:00")
    assert again.items[key]["translation"] == {"title": "세미나"}
    assert again.items[key]["ai_deadline"] == {"checked": True}


def test_title_change_is_recorded_and_redoes_derived_fields():
    archive = add_notice(Archive(), notice("인턴 모집 (~11/10)"), "2026-11-02T00:00:00+09:00")
    key = "cse-notice/1"
    extra = {"translation": {"title": "x"}, "ai_deadline": {"checked": True}}
    archive = Archive({key: {**archive.items[key], **extra}})
    edited = [notice("인턴 모집 (마감 연장 ~11/20)")]
    changed, keys = note_list_changes(archive, edited, "2026-11-03T09:00:00+09:00")
    item = changed.items[key]
    assert keys == [key]
    assert item["previous_title"] == "인턴 모집 (~11/10)" and item["change_kind"] == "제목"
    assert "translation" not in item and "ai_deadline" not in item
    assert item["notice"]["deadline"].startswith("2026-11-20")
    assert note_list_changes(changed, [notice("인턴 모집 (마감 연장 ~11/20)")], "x")[1] == []


def test_body_change_only_when_text_differs():
    archive = Archive({"a/1": {"notice": {"id": "a/1"}, "body_text": "본문"}})
    same, changed = note_body_change(archive, "a/1", " 본문 ", "t1")
    assert not changed and same.items["a/1"]["rechecked_at"] == "t1" and "changed_at" not in same.items["a/1"]
    new, changed = note_body_change(archive, "a/1", "고친 본문", "t2")
    assert changed and new.items["a/1"]["changed_at"] == "t2" and new.items["a/1"]["change_kind"] == "본문"


def test_swapped_image_counts_as_edit_and_redoes_summary():
    old = "https://www.skku.edu/_attach/image/2026/11/old.jpg"
    new = "https://www.skku.edu/_attach/image/2026/11/new.jpg"
    files = [{"name": "포스터.pdf", "url": "https://x/1", "type": "PDF", "size": None}]
    archive = Archive({"a/1": {"notice": {"id": "a/1"}, "body_text": "본문", "images": [old],
                               "body_html": f'<img src="{old}">', "attachments": files, "body_attempts": 1,
                               "summary": "옛 요약"}})
    pdf = (("포스터.pdf", "https://x/1", "PDF", None),)
    same, changed = refresh_media(archive, "a/1", pdf, (old,), f'<img src="{old}">', "t1")
    assert same is archive and not changed
    swapped, changed = refresh_media(archive, "a/1", pdf, (new,), f'<img src="{new}">', "t1")
    item = swapped.items["a/1"]
    assert changed and item["images"] == [new] and new in item["body_html"]
    assert item["changed_at"] == "t1" and item["change_kind"] == "본문" and item["body_attempts"] == 1
    assert "summary" not in item
    assert refresh_media(archive, "a/1", (), (), "<p>본문</p>", "t1") == (archive, False)
    html_only, changed = refresh_media(archive, "a/1", pdf, (old,), f'<p>본문</p><img src="{old}">', "t1")
    assert not changed and "changed_at" not in html_only.items["a/1"]
    assert html_only.items["a/1"]["body_html"].startswith("<p>")


def test_changed_important_notice_is_announced_once(monkeypatch, tmp_path):
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.delenv("SAVED_NOTICES", raising=False)
    sent = []
    monkeypatch.setattr(cli, "send_notice", lambda n, *args: sent.append(n.title) or True)
    base = add_notice(Archive(), notice("인턴 모집"), "2026-11-02T00:00:00+09:00")
    key = "cse-notice/1"
    item = {**base.items[key], "changed_at": "t", "change_kind": "제목"}
    mine = Archive({key: {**item, "match": {**item["match"], "rule_name": "인턴"}}})
    other = Archive({key: item})
    after = cli._notify_changes(mine, {"cse-notice": "소프트웨어학과"})
    assert sent == ["[수정] 인턴 모집"]
    cli._notify_changes(after, {})
    cli._notify_changes(other, {})
    assert sent == ["[수정] 인턴 모집"]
    assert _public_notice(after.items[key]).get("changed_at") == "t"


def test_external_title_change_does_not_send_school_change_alert(monkeypatch):
    monkeypatch.delenv('SAVED_NOTICES', raising=False)
    sent = []
    monkeypatch.setattr(cli, 'send_notice', lambda *args: sent.append(args) or True)
    base = add_notice(Archive(), notice('인턴 모집'), '2026-11-02T00:00:00+09:00')
    item = base.items['cse-notice/1']
    archive = Archive({'cse-notice/1': {**item, 'changed_at': 't',
                       'match': {**item['match'], 'rule_name': '인턴'}}})
    cli._notify_changes(archive, {}, frozenset({'cse-notice'}))
    assert not sent


def _image_item(**extra):
    return {"notice": {"id": "a/1"}, "body_text": "포스터에서 읽은 글자", "body_from_image": True,
            "images": ["https://www.skku.edu/x.jpg"], "body_html": "<img>", **extra}


def test_image_notice_same_page_text_is_not_a_change():
    archive = Archive({"a/1": _image_item(page_text="첨부 참조")})
    result, changed = note_body_change(archive, "a/1", "첨부 참조", "t1")
    item = result.items["a/1"]
    assert not changed and "changed_at" not in item and item["body_text"] == "포스터에서 읽은 글자"


def test_image_notice_real_page_change_is_a_change():
    archive = Archive({"a/1": _image_item(page_text="첨부 참조")})
    result, changed = note_body_change(archive, "a/1", "마감이 연장되었습니다", "t1")
    item = result.items["a/1"]
    assert changed and item["change_kind"] == "본문" and item["page_text"] == "마감이 연장되었습니다"


def test_legacy_image_notice_records_baseline_without_change():
    archive = Archive({"a/1": _image_item()})
    result, changed = note_body_change(archive, "a/1", "첨부 참조", "t1")
    item = result.items["a/1"]
    assert not changed and "changed_at" not in item
    assert item["page_text"] == "첨부 참조" and item["body_text"] == "포스터에서 읽은 글자"
    again, changed = note_body_change(result, "a/1", "첨부 참조", "t2")
    assert not changed


def test_unchanged_recheck_sends_nothing(monkeypatch, tmp_path):
    from datetime import datetime
    from types import SimpleNamespace
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.delenv("SAVED_NOTICES", raising=False)
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    sent = []
    monkeypatch.setattr(cli, "send_notice", lambda n, *args: sent.append(n.title) or True)
    img = "https://www.skku.edu/x.jpg"
    key = "cse-notice/1"
    base = add_notice(Archive(), notice("인턴 모집"), "2026-11-02T00:00:00+09:00")
    item = {**base.items[key], "match": {**base.items[key]["match"], "rule_name": "인턴"},
            "body_text": "포스터에서 읽은 글자", "body_from_image": True, "page_text": "첨부 참조",
            "images": [img], "body_html": "<img>", "attachments": [],
            "fetched_at": "2026-11-01T00:00:00+09:00"}
    archive = Archive({key: item})
    detail = SimpleNamespace(body_text="첨부 참조", attachments=(), images=(img,), body_html="<img>")
    monkeypatch.setattr(cli, "fetch_detail", lambda *a: "")
    monkeypatch.setattr(cli, "parse_detail", lambda *a: detail)
    settings = {"sources": [], "request_gap_seconds": 0, "user_agent": "t", "timeout_seconds": 1}
    now = datetime.fromisoformat("2026-11-09T00:00:00+09:00")
    result = cli._recheck_details(archive, settings, now)
    assert "changed_at" not in result.items[key] and result.items[key]["body_text"] == "포스터에서 읽은 글자"
    cli._notify_changes(result, {"cse-notice": "소프트웨어학과"})
    assert sent == []


def _recheck_setup(monkeypatch, tmp_path, specs):
    """specs: (번호, 처음 본 시각, 마지막 받은 시각, 내 공지 여부). 받아 간 글 번호 목록을 돌려준다."""
    from datetime import datetime
    from types import SimpleNamespace
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.delenv("SAVED_NOTICES", raising=False)
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    items = {}
    for no, seen, fetched, mine in specs:
        n = Notice("cse-notice", no, "공지", "채용", f"https://cse.skku.edu/cse/notice.do?articleNo={no}",
                   date(2026, 11, 9), False)
        base = add_notice(Archive(), n, seen).items[f"cse-notice/{no}"]
        match = {**base["match"], "rule_name": "인턴" if mine else None}
        items[f"cse-notice/{no}"] = {**base, "match": match, "body_text": "본문", "images": [],
                                     "body_html": "", "attachments": [], "fetched_at": fetched}
    fetched_urls = []
    detail = SimpleNamespace(body_text="본문", attachments=(), images=(), body_html="")
    monkeypatch.setattr(cli, "fetch_detail", lambda url, *a: fetched_urls.append(url) or "")
    monkeypatch.setattr(cli, "parse_detail", lambda *a: detail)
    settings = {"sources": [], "request_gap_seconds": 0, "user_agent": "t", "timeout_seconds": 1}
    now = datetime.fromisoformat("2026-11-09T12:00:00+09:00")
    cli._recheck_details(Archive(items), settings, now)
    return [url.rsplit("=", 1)[1] for url in fetched_urls]


def test_recent_notice_is_rechecked_every_three_hours(monkeypatch, tmp_path):
    got = _recheck_setup(monkeypatch, tmp_path, [
        ("1", "2026-11-09T02:00:00+09:00", "2026-11-09T08:00:00+09:00", False)])
    assert got == ["1"]


def test_old_or_just_fetched_notice_is_not_rechecked(monkeypatch, tmp_path):
    got = _recheck_setup(monkeypatch, tmp_path, [
        ("1", "2026-11-06T02:00:00+09:00", "2026-11-06T08:00:00+09:00", False),
        ("2", "2026-11-09T02:00:00+09:00", "2026-11-09T11:00:00+09:00", False)])
    assert got == []


def test_recheck_cap_puts_important_first(monkeypatch, tmp_path):
    old = "2026-11-08T01:00:00+09:00"
    got = _recheck_setup(monkeypatch, tmp_path, [
        ("1", "2026-11-09T02:00:00+09:00", old, False),
        ("2", "2026-11-09T04:00:00+09:00", old, False),
        ("3", "2026-11-09T01:00:00+09:00", old, False),
        ("4", "2026-11-05T01:00:00+09:00", "2026-11-05T01:00:00+09:00", True),
        ("5", "2026-11-04T01:00:00+09:00", "2026-11-04T01:00:00+09:00", True)])
    assert got == ["4", "5", "2"]
