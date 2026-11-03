import argparse
from datetime import date

import pytest

from skku_notice import cli
from skku_notice.archive import Archive, add_notice, save_archive
from skku_notice.judge import Judgment
from skku_notice.model import Notice
from skku_notice.notification_policy import alert_priority, software_intern_eligible
from skku_notice.state import SeenRecord, SourceState, State, load_state, save_state


@pytest.mark.parametrize("title", [
    "[회사] 백엔드 개발자 인턴", "[회사] 소프트웨어 엔지니어 인턴", "[회사] 데이터 분석 인턴",
    "[회사] Security Analyst 인턴", "[회사] QA 인턴", "[회사] Problem Solver (Engineering Focused) 인턴",
])
def test_software_roles_get_alerts_without_gemini(title):
    assert software_intern_eligible(title)
    assert alert_priority(external=True, title=title, body="", match=None, judgment=None,
                          interests=()) == "default"


@pytest.mark.parametrize("title", [
    "[회사] 법무담당자 인턴", "[회사] AI 콘텐츠 마케팅 인턴", "[회사] 인재개발 HR 인턴",
    "[회사] 백엔드 개발자 경력 3년 이상", "[회사] AI 에이전트 개발자 국비지원 교육 과정",
])
def test_nonsoftware_experienced_and_training_are_excluded(title):
    assert not software_intern_eligible(title, "모집 분야: 백엔드 개발자")


def test_body_requires_job_context_and_ai_does_not_override_eligibility():
    assert software_intern_eligible("[회사] 인턴 모집", "모집 분야: 백엔드 개발자")
    assert not software_intern_eligible("[회사] 인턴 모집", "우리 회사는 백엔드 개발자와 협업합니다")
    assert not software_intern_eligible("[회사] 마케팅 인턴", "모집 분야: 백엔드 개발자", "relevant")
    assert not software_intern_eligible("[회사] 인턴 모집", "모집 직무: 마케팅, 개발자와 협업")
    assert not software_intern_eligible("[회사] 소프트웨어 엔지니어 인턴", "필수: 경력 3년 이상")
    assert software_intern_eligible("[회사] 소프트웨어 엔지니어 인턴", "경력 3년 이상 우대")
    for verdict in ("maybe", "not_relevant"):
        assert not software_intern_eligible("[회사] 소프트웨어 엔지니어 인턴", verdict=verdict)
    assert software_intern_eligible("[회사] 소프트웨어 엔지니어 인턴", verdict="relevant")


def test_school_post_always_notifies_even_when_ai_says_irrelevant():
    judgment = Judgment("not_relevant", "이유", "model")
    assert alert_priority(external=False, title="대학원생 대상", body="", match=None,
                          judgment=judgment, interests=()) == "low"


def test_run_sends_excluded_school_and_never_retries_unsuitable_pending_intern(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "load_dotenv", lambda **kwargs: None)
    monkeypatch.setattr(cli, "_profile", lambda: {})
    monkeypatch.setattr(cli, "has_notification_channel", lambda: True)
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "INTERESTS_PATH", tmp_path / "no-interests.yaml")
    sources = tmp_path / "sources.yaml"
    sources.write_text('''user_agent: test
request_gap_seconds: 1
timeout_seconds: 10
sources:
- {id: school, name: 학교, url: 'https://www.skku.edu/notice'}
- {id: jobs, name: 인턴, url: 'https://linkareer.com/activity', external: true}
''')
    monkeypatch.setattr(cli, "SOURCES_PATH", sources)
    ai = tmp_path / "ai.yaml"
    ai.write_text("enabled: false\n")
    monkeypatch.setattr(cli, "AI_PATH", ai)
    rules = tmp_path / "rules.yaml"
    rules.write_text("notify_all: false\nexclude_title: [대학원생]\nrules: []\n")
    monkeypatch.setenv("MUTED_CATEGORIES", "학사")
    stamp = "2026-11-04T00:00:00+09:00"
    old = Notice("jobs", "1", "[회사] 마케팅 인턴", "인턴", "https://linkareer.com/activity/1",
                 date(2026, 11, 4), False)
    school = Notice("school", "2", "대학원생 대상 공지", "학사", "https://www.skku.edu/2",
                    date(2026, 11, 4), False)
    dev = Notice("jobs", "3", "[회사] 백엔드 개발자 인턴", "인턴", "https://linkareer.com/activity/3",
                 date(2026, 11, 4), False)
    save_state(cli.STATE_PATH, State({"school": SourceState(stamp, {}),
                                      "jobs": SourceState(stamp, {"1": SeenRecord(stamp, "pending", 1)})}))
    save_archive(cli.ARCHIVE_PATH, add_notice(Archive(), old, stamp, priority="default"))
    monkeypatch.setattr(cli, "_fixture", lambda _: "fixture")
    monkeypatch.setattr(cli, "parse_list",
                        lambda _html, source, _url: [school] if source == "school" else [old, dev])
    sent = []
    monkeypatch.setattr(cli, "send_notice", lambda notice, *args: sent.append(notice.article_no) or True)
    args = argparse.Namespace(rules=rules, dry_run=False, all=False, from_fixtures=True,
                              no_ai=True, no_canvas=True, export=None)
    assert cli.run(args) == 0
    assert sent == ["2", "3"]
    assert load_state(cli.STATE_PATH).sources["jobs"].seen["1"].status == "skipped"


def test_generic_intern_waits_without_delivery_attempts_then_rejudges_after_body(tmp_path, monkeypatch):
    from skku_notice.archive import update_detail

    monkeypatch.setattr(cli, "load_dotenv", lambda **kwargs: None)
    monkeypatch.setattr(cli, "_profile", lambda: {"major": "test"})
    monkeypatch.setattr(cli, "has_notification_channel", lambda: True)
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "INTERESTS_PATH", tmp_path / "no-interests.yaml")
    sources = tmp_path / "sources.yaml"
    sources.write_text('''user_agent: test
request_gap_seconds: 1
timeout_seconds: 10
sources:
- {id: jobs, name: 인턴, url: 'https://linkareer.com/activity', external: true}
''')
    monkeypatch.setattr(cli, "SOURCES_PATH", sources)
    ai = tmp_path / "ai.yaml"
    ai.write_text("enabled: true\nmodel: test\nmax_per_run: 30\n")
    monkeypatch.setattr(cli, "AI_PATH", ai)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    rules = tmp_path / "rules.yaml"
    rules.write_text("rules: []\n")
    stamp = "2026-11-04T00:00:00+09:00"
    saved = Notice("jobs", "1", "[회사] 채용연계형 인턴 모집", "인턴", "https://linkareer.com/activity/1",
                   date(2026, 11, 4), False)
    save_state(cli.STATE_PATH, State({"jobs": SourceState(stamp, {})}))
    monkeypatch.setattr(cli, "_fixture", lambda _: "fixture")
    monkeypatch.setattr(cli, "parse_list", lambda *_args: [saved])
    loaded = {"value": False}

    def fill(archive, _state, _boards, _settings, _fixtures, now):
        if "jobs/1" not in archive.items:
            archive = add_notice(archive, saved, now.isoformat())
        if loaded["value"]:
            return update_detail(archive, "jobs/1", "모집 분야: 백엔드 개발자", (), now.isoformat())
        return archive

    monkeypatch.setattr(cli, "_fill_details", fill)
    ai_bodies = []

    def judge(_notices, _names, _profile, _model, _key, **kwargs):
        body = kwargs["bodies"]["jobs/1"]
        ai_bodies.append(body)
        return {"jobs/1": Judgment("relevant" if body else "maybe", "이유", "test")}

    monkeypatch.setattr(cli, "judge_notices", judge)
    sent = []
    monkeypatch.setattr(cli, "send_notice", lambda notice, *args: sent.append(notice.article_no) or True)
    args = argparse.Namespace(rules=rules, dry_run=False, all=False, from_fixtures=True,
                              no_ai=False, no_canvas=True, export=None)
    for _ in range(5):
        assert cli.run(args) == 0
        seen = load_state(cli.STATE_PATH).sources["jobs"].seen["1"]
        assert seen.status == "pending" and seen.attempts == 0
    assert sent == [] and ai_bodies == [""]
    loaded["value"] = True
    assert cli.run(args) == 0
    assert sent == ["1"] and ai_bodies[-1] == "모집 분야: 백엔드 개발자"
    assert load_state(cli.STATE_PATH).sources["jobs"].seen["1"].status == "notified"
    assert cli.run(args) == 0 and sent == ["1"]


def test_deferred_pending_with_three_failed_details_is_skipped(tmp_path, monkeypatch):
    from skku_notice.archive import update_detail

    monkeypatch.setattr(cli, "load_dotenv", lambda **kwargs: None)
    monkeypatch.setattr(cli, "_profile", lambda: {})
    monkeypatch.setattr(cli, "has_notification_channel", lambda: True)
    monkeypatch.setattr(cli, "STATE_PATH", tmp_path / "seen.json")
    monkeypatch.setattr(cli, "ARCHIVE_PATH", tmp_path / "archive.json")
    monkeypatch.setattr(cli, "INTERESTS_PATH", tmp_path / "no-interests.yaml")
    sources = tmp_path / "sources.yaml"
    sources.write_text('''user_agent: test
request_gap_seconds: 1
timeout_seconds: 10
sources:
- {id: jobs, name: 인턴, url: 'https://linkareer.com/activity', external: true}
''')
    monkeypatch.setattr(cli, "SOURCES_PATH", sources)
    ai = tmp_path / "ai.yaml"
    ai.write_text("enabled: false\n")
    monkeypatch.setattr(cli, "AI_PATH", ai)
    rules = tmp_path / "rules.yaml"
    rules.write_text("rules: []\n")
    stamp = "2026-11-04T00:00:00+09:00"
    notice = Notice("jobs", "1", "[회사] 인턴 모집", "인턴", "https://linkareer.com/activity/1",
                    date(2026, 11, 4), False)
    save_state(cli.STATE_PATH, State({"jobs": SourceState(stamp, {})}))
    monkeypatch.setattr(cli, "_fixture", lambda _: "fixture")
    monkeypatch.setattr(cli, "parse_list", lambda *_args: [notice])

    def fail_detail(archive, _state, _boards, _settings, _fixtures, now):
        if "jobs/1" not in archive.items:
            archive = add_notice(archive, notice, now.isoformat())
        return update_detail(archive, "jobs/1", None, (), None)

    monkeypatch.setattr(cli, "_fill_details", fail_detail)
    monkeypatch.setattr(cli, "send_notice", lambda *_args: pytest.fail("should not send"))
    args = argparse.Namespace(rules=rules, dry_run=False, all=False, from_fixtures=True,
                              no_ai=True, no_canvas=True, export=None)
    for _ in range(2):
        assert cli.run(args) == 0
        assert load_state(cli.STATE_PATH).sources["jobs"].seen["1"].status == "pending"
    assert cli.run(args) == 0
    assert load_state(cli.STATE_PATH).sources["jobs"].seen["1"].status == "skipped"
