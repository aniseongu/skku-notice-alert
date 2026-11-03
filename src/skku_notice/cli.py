"""Read public boards, judge new notices, deliver, and export snapshots."""

import argparse
import json
import os
import sys
import time
from dataclasses import replace
from datetime import date, datetime, timedelta
from pathlib import Path

import yaml
from dotenv import load_dotenv

from skku_notice.archive import (
    Archive,
    add_notice,
    load_archive,
    mark_image_attempted,
    note_body_change,
    note_list_changes,
    save_archive,
    set_source_deadlines,
    update_ai_deadlines,
    update_detail,
    update_image_text,
    update_translation,
)
from skku_notice.canvas import CanvasError, read_canvas
from skku_notice.canvas_alerts import (
    load_canvas_state,
    mark_sent,
    plan_alerts,
    problem_alert,
    save_canvas_state,
)
from skku_notice.deadline import KST
from skku_notice.deadline_ai import BATCH, read_deadlines
from skku_notice.export import export_site
from skku_notice.fetch import FetchError, UnsafeURL, fetch_detail, fetch_images, fetch_json_post, fetch_list
from skku_notice.interests import (
    is_mine,
    load_interests,
    match_interests,
    muted_from_env,
    refresh_archive_interests,
)
from skku_notice.jobs import COLLECTORS, parse_job_detail
from skku_notice.judge import Judgment, decide_priority, judge_notices
from skku_notice.model import Match, Notice
from skku_notice.notify import has_notification_channel, send_canvas, send_notice
from skku_notice.ocr import read_images
from skku_notice.parse import ParseError, parse_detail, parse_list
from skku_notice.rules import load_rules, match_notice
from skku_notice.state import baseline, is_new, load_state, record_result, save_state
from skku_notice.translate import needs_translation, translate_notice

SOURCES_PATH = Path("config/sources.yaml")
STATE_PATH = Path("state/seen.json")
ARCHIVE_PATH = Path("state/archive.json")
AI_PATH = Path("config/ai.yaml")
PROFILE_PATH = Path("config/profile.yaml")
INTERESTS_PATH = Path("config/interests.yaml")
FIXTURES_PATH = Path("tests/fixtures")
CANVAS_CONFIG_PATH = Path("config/canvas.yaml")
CANVAS_STATE_PATH = Path("state/canvas.json")


def _fixture(source_id: str) -> str:
    candidates = sorted(FIXTURES_PATH.glob(f"{source_id.replace('-', '_')}_list_*.html"))
    if not candidates:
        raise FileNotFoundError(f"fixture not found: {source_id}")
    return candidates[-1].read_text(encoding="utf-8")


def _view_fixture(source_id: str, article_no: str) -> str | None:
    candidates = sorted(FIXTURES_PATH.glob(
        f"{source_id.replace('-', '_')}_view_{article_no}_*.html"
    ))
    return candidates[-1].read_text(encoding="utf-8") if candidates else None


def _fill_details(archive: Archive, state, boards: list[tuple[dict, list]], settings: dict,
                  from_fixtures: bool, now: datetime) -> Archive:
    gap = max(1.0, float(settings.get("request_gap_seconds", 1)))
    for source, notices in boards:
        count = 0
        new = [notice for notice in notices if notice.article_no not in state.sources[source["id"]].seen]
        for notice in new:
            key = f"{source['id']}/{notice.article_no}"
            if key not in archive.items:
                archive = add_notice(archive, notice, now.isoformat())
        recent = sorted(
            (item["notice"] for item in archive.items.values()
             if item["notice"]["source_id"] == source["id"]),
            key=lambda notice: (notice["posted_on"], notice["first_seen"], notice["article_no"]),
            reverse=True,
        )
        new_ids = {f"{source['id']}/{notice.article_no}" for notice in new}
        candidates = [(f"{source['id']}/{notice.article_no}", notice.url, notice.article_no)
                      for notice in new]
        candidates += [(notice["id"], notice["url"], notice["article_no"]) for notice in recent
                       if notice["id"] not in new_ids]
        for key, url, article_no in candidates:
            item = archive.items[key]
            if item.get("body_text") is not None or item.get("body_attempts", 0) >= 3:
                continue
            if count == 5:
                break
            html = _view_fixture(source["id"], article_no) if from_fixtures else None
            if from_fixtures and html is None:
                continue
            if not from_fixtures:
                time.sleep(gap)
            count += 1
            try:
                if html is None:
                    html = fetch_detail(url, settings["user_agent"],
                                        float(settings["timeout_seconds"]))
                detail = (parse_job_detail(html, source["kind"], article_no, url)
                          if source.get("external") else parse_detail(html, url))
            except (FetchError, ParseError) as exc:
                if not isinstance(exc, UnsafeURL):
                    print(f"{key}: 본문 읽기 실패: {exc}", file=sys.stderr)
                archive = update_detail(archive, key, None, (), None)
            else:
                archive = update_detail(archive, key, detail.body_text, detail.attachments,
                                        now.isoformat(), detail.images, detail.body_html)
            save_archive(ARCHIVE_PATH, archive)
    return archive


# 무료 한도를 아끼려고 실행당 3건만 옮기고, 한 글은 두 번 실패하면 더 시도하지 않는다.
TRANSLATE_PER_RUN = 3
# 본문 마감 읽기는 한 번에 BATCH(8)건, 실행당 3번까지(D-023).
DEADLINE_CALLS = 3


def _translate(archive, ai: dict, api_key: str):
    if not api_key:
        return archive
    done = 0
    for key, item in archive.items.items():
        if done == TRANSLATE_PER_RUN:
            break
        ready = item.get("body_text") is not None or item.get("body_attempts", 0) >= 3
        if (item.get("translation") or item.get("translation_attempts", 0) >= 2 or not ready
                or not needs_translation(item["notice"]["title"], item.get("body_text"))):
            continue
        done += 1
        result = translate_notice(item["notice"]["title"], item.get("body_text"), ai["model"], api_key)
        archive = update_translation(archive, key, result, ai["model"])
        save_archive(ARCHIVE_PATH, archive)
    return archive


# 바뀐 글 다시 확인(D-025): 내 공지와 저장한 공지 중 마감이 남은 글만, 같은 글은 12시간에 한 번, 실행당 3건.
RECHECK_PER_RUN = 3
RECHECK_HOURS = 12


def _important(item: dict, saved_ids: set[str]) -> bool:
    external = ".skku.edu/" not in item["notice"]["url"]
    return item["notice"]["id"] in saved_ids or is_mine(item.get("match"), external)


def _saved_ids() -> set[str]:
    try:
        saved = json.loads(os.environ.get("SAVED_NOTICES") or "[]")
    except ValueError:
        return set()
    return {entry["id"] for entry in saved if isinstance(entry, dict) and isinstance(entry.get("id"), str)}


def _recheck_details(archive, settings: dict, now: datetime):
    saved = _saved_ids()
    done = 0
    for key, item in list(archive.items.items()):
        if done == RECHECK_PER_RUN:
            break
        deadline = item["notice"].get("deadline") or (item.get("ai_deadline") or {}).get("at")
        last = item.get("rechecked_at") or item.get("fetched_at")
        if (not _important(item, saved) or item.get("body_text") is None
                or ".skku.edu/" not in item["notice"]["url"]
                or (deadline and datetime.fromisoformat(deadline) < now)
                or (last and now - datetime.fromisoformat(last) < timedelta(hours=RECHECK_HOURS))):
            continue
        done += 1
        time.sleep(float(settings["request_gap_seconds"]))
        try:
            html = fetch_detail(item["notice"]["url"], settings["user_agent"],
                                float(settings["timeout_seconds"]))
            detail = parse_detail(html, item["notice"]["url"])
        except (FetchError, ParseError):
            archive = note_body_change(archive, key, None, now.isoformat())[0]
            continue
        archive, changed = note_body_change(archive, key, detail.body_text, now.isoformat())
        if changed:
            archive = update_detail(archive, key, detail.body_text, detail.attachments, now.isoformat(),
                                    detail.images, detail.body_html)
            marks = {"changed_at": now.isoformat(), "change_kind": "본문", "rechecked_at": now.isoformat()}
            archive = Archive({**archive.items, key: {**archive.items[key], **marks}})
        save_archive(ARCHIVE_PATH, archive)
    return archive


def _notify_changes(archive, names: dict[str, str]):
    """학교가 고친 중요한 글을 한 번 알린다. 실패하면 다음 실행에 다시 보낸다."""
    saved = _saved_ids()
    for key, item in archive.items.items():
        changed = item.get("changed_at")
        if not changed or item.get("change_notified") == changed or not _important(item, saved):
            continue
        public = item["notice"]
        title = (item.get("translation") or {}).get("title") or public["title"]
        notice = Notice(public["source_id"], public["article_no"], f"[수정] {title}", public.get("category"),
                        public["url"], date.fromisoformat(public["posted_on"]), public.get("pinned", False))
        what = "제목이 바뀌었어요" if item.get("change_kind") == "제목" else "본문이 바뀌었어요"
        if send_notice(notice, names.get(public["source_id"], public["source_id"]), "default", None,
                       f"학교가 글을 고쳤어요. {what}"):
            archive = Archive({**archive.items, key: {**item, "change_notified": changed}})
            save_archive(ARCHIVE_PATH, archive)
    return archive


def _ai_deadlines(archive, ai: dict, api_key: str):
    # 제목에 마감이 없는 글만, 본문을 받은 뒤 한 번 호출에 BATCH개씩 묻는다(D-023).
    if not api_key:
        return archive
    waiting = [
        {"id": key, "title": item["notice"]["title"], "posted_on": item["notice"]["posted_on"],
         "body": item.get("body_text") or item.get("ocr_text") or ""}
        for key, item in archive.items.items()
        if not item["notice"].get("deadline") and not (item.get("ai_deadline") or {}).get("checked")
        and (item.get("body_text") is not None or item.get("body_attempts", 0) >= 3)
    ][:BATCH * DEADLINE_CALLS]
    # 밀린 글도 한 번에 따라잡도록 실행당 몇 번까지 부른다. 실패하면 남은 것은 다음 실행에 맡긴다.
    for start in range(0, len(waiting), BATCH):
        results = read_deadlines(waiting[start:start + BATCH], ai["model"], api_key)
        if results is None:
            break
        archive = update_ai_deadlines(archive, results, ai["model"])
        save_archive(ARCHIVE_PATH, archive)
    return archive


def _profile() -> dict:
    raw = os.environ.get("PROFILE_YAML")
    if raw is None and PROFILE_PATH.exists():
        raw = PROFILE_PATH.read_text(encoding="utf-8")
    parsed = yaml.safe_load(raw) if raw else {}
    if not isinstance(parsed, dict):
        raise ValueError("profile must be a YAML mapping")
    return parsed


def _images_for_judgment(
    archive: Archive, notices: list, now: datetime, user_agent: str,
) -> tuple[Archive, dict]:
    images = {}
    remaining = 10
    for notice in notices:
        key = f"{notice.source_id}/{notice.article_no}"
        item = archive.items.get(key)
        if not item or item.get("image_attempted") or item.get("fetched_at") != now.isoformat():
            continue
        if len((item.get("body_text") or "").strip()) >= 50 or not item.get("images"):
            continue
        if remaining == 0:
            break
        urls = item["images"][:min(3, remaining)]
        archive = mark_image_attempted(archive, key)
        save_archive(ARCHIVE_PATH, archive)
        if remaining < 10:
            time.sleep(1)
        fetched = fetch_images(urls, user_agent, remaining)
        if fetched:
            images[key] = fetched
        remaining -= len(urls)
    return archive, images


def _apply_ocr(archive: Archive, images: dict) -> Archive:
    for notice_id, parts in images.items():
        text = read_images([part.data for part in parts])
        if text:
            archive = update_image_text(archive, notice_id, text)
    return archive


def run(args: argparse.Namespace) -> int:
    if args.all and not args.dry_run:
        print("--all requires --dry-run", file=sys.stderr)
        return 2
    if not args.rules.exists():
        print(f"{args.rules} 없음: config/rules.example.yaml을 복사하세요", file=sys.stderr)
        return 2
    load_dotenv(override=False)
    if not args.dry_run:
        try:
            if not has_notification_channel():
                print("설정 오류: NOTIFY_URLS 또는 웹 푸시 설정이 필요해요", file=sys.stderr)
                return 2
        except ValueError as exc:
            print(f"설정 오류: {exc}", file=sys.stderr)
            return 2
    try:
        rules = load_rules(args.rules)
        interests = load_interests(INTERESTS_PATH, os.environ.get("INTEREST_KEYWORDS", ""))
        muted_categories = muted_from_env(os.environ.get("MUTED_CATEGORIES", ""))
        settings = yaml.safe_load(SOURCES_PATH.read_text(encoding="utf-8"))
        ai = yaml.safe_load(AI_PATH.read_text(encoding="utf-8"))
        state = load_state(STATE_PATH)
        archive = Archive() if args.dry_run else load_archive(ARCHIVE_PATH)
        profile = _profile() if ai.get("enabled") and not getattr(args, "no_ai", False) else {}
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(f"설정 오류: {exc}", file=sys.stderr)
        return 2
    now = datetime.now(KST)
    gap = max(1.0, float(settings.get("request_gap_seconds", 1)))
    previous_network = False
    failed = False
    boards: list[tuple[dict, list]] = []
    external_deadlines: dict[str, str] = {}
    for source in settings["sources"]:
        source_id = source["id"]
        if source.get("kind") in COLLECTORS:
            # 외부 인턴 공고 목록: 사이트마다 한 번 요청한다. fixture 실행에서는 건너뛴다.
            if args.from_fixtures:
                continue
            if previous_network:
                time.sleep(gap)
            previous_network = True
            try:
                postings = COLLECTORS[source["kind"]](
                    lambda url, body, headers: fetch_json_post(
                        url, body, settings["user_agent"], float(settings["timeout_seconds"]), headers),
                    now, source_id)
            except (FetchError, KeyError, TypeError, ValueError) as exc:
                print(f"{source_id}: 외부 공고 읽기 실패: {type(exc).__name__}", file=sys.stderr)
                continue
            external_deadlines.update({f"{source_id}/{n.article_no}": d for n, d in postings if d})
            if postings:
                boards.append((source, [notice for notice, _ in postings]))
            continue
        try:
            if args.from_fixtures:
                html = _fixture(source_id)
            else:
                if previous_network:
                    time.sleep(gap)
                previous_network = True
                html = fetch_list(source["url"], settings["user_agent"], float(settings["timeout_seconds"]))
            notices = parse_list(html, source_id, source["url"])
        except (FileNotFoundError, FetchError, ParseError) as exc:
            print(f"{source_id}: {exc}", file=sys.stderr)
            failed = True
            continue
        if not notices:
            print(f"{source_id}: 파싱 결과 0건", file=sys.stderr)
            failed = True
            continue
        boards.append((source, notices))
    if not args.dry_run:
        for source, notices in boards:
            if source["id"] not in state.sources:
                state = baseline(state, source["id"], notices, now)
                save_state(STATE_PATH, state)
                for notice in notices:
                    archive = add_notice(archive, notice, now.isoformat())
                save_archive(ARCHIVE_PATH, archive)
        archive = set_source_deadlines(archive, external_deadlines)
        for _source, notices in boards:
            archive, title_changes = note_list_changes(archive, notices, now.isoformat())
            if title_changes:
                save_archive(ARCHIVE_PATH, archive)
        archive = _fill_details(archive, state, boards, settings, args.from_fixtures, now)
        archive = set_source_deadlines(archive, external_deadlines)
        save_archive(ARCHIVE_PATH, archive)
        if not args.from_fixtures:
            archive = _recheck_details(archive, settings, now)
        if ai.get("enabled") and not getattr(args, "no_ai", False) and not args.from_fixtures:
            archive = _translate(archive, ai, os.environ.get("GEMINI_API_KEY", ""))
            archive = _ai_deadlines(archive, ai, os.environ.get("GEMINI_API_KEY", ""))
    candidates = []
    image_candidates = []
    for source, notices in boards:
        for notice in notices:
            record = state.sources.get(source["id"])
            seen = record.seen.get(notice.article_no) if record else None
            if (args.dry_run and (args.all or is_new(state, notice))) or (
                not args.dry_run and record is not None and seen is None
            ):
                if not source.get("external"):
                    image_candidates.append(notice)
                if not any(
                    word.strip().casefold() in notice.title.casefold() for word in rules.exclude_title
                ):
                    candidates.append(notice)
    judgments = {}
    image_parts = {}
    if image_candidates and not args.dry_run and not args.from_fixtures:
        archive, image_parts = _images_for_judgment(
            archive, image_candidates, now, settings["user_agent"]
        )
        archive = _apply_ocr(archive, image_parts)
        if image_parts:
            save_archive(ARCHIVE_PATH, archive)
    if candidates and ai.get("enabled") and not getattr(args, "no_ai", False):
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            print("GEMINI_API_KEY 없음: 규칙만 적용")
        elif not profile and not interests:
            print("프로필 없음: 규칙만 적용")
        else:
            selected = candidates[: max(0, int(ai.get("max_per_run", 30)))]
            judgments = judge_notices(
                selected,
                {source["id"]: source["name"] for source in settings["sources"]},
                profile,
                ai["model"],
                key,
                interests=interests,
                bodies={key: "\n".join(filter(None, (
                    item.get("body_text") or "", item.get("ocr_text") or ""
                ))) for key, item in archive.items.items()},
                images=image_parts,
            )
    for source, notices in boards:
        if args.dry_run and source["id"] not in state.sources:
            print(f"{source['id']}: state 없음: 실제 첫 실행이면 알림 없이 기준선만 저장")
        for notice in notices:
            record = state.sources.get(source["id"])
            seen = record.seen.get(notice.article_no) if record else None
            new = seen is None
            process = (
                (args.all or new)
                if args.dry_run
                else (record is not None and (new or seen.status == "pending"))
            )
            excluded = any(word.strip().casefold() in notice.title.casefold() for word in rules.exclude_title)
            match = match_notice(notice, rules) if process and not excluded else None
            judgment = (
                judgments.get(f"{source['id']}/{notice.article_no}") if process and not excluded else None
            )
            item = archive.items.get(f"{source['id']}/{notice.article_no}", {})
            text_interests = (
                match_interests(notice, interests,
                                f"{item.get('body_text') or ''} {item.get('ocr_text') or ''}")
                if process and not excluded else ()
            )
            shown_interests = tuple(
                word for word in interests
                if word in text_interests
            )
            # 외부 인턴 공고는 모두 '인턴'이라 키워드만으로 알리지 않는다(D-026).
            priority = (decide_priority(match, judgment, () if source.get("external") else text_interests)
                        if process and not excluded else None)
            # 꺼 둔 분류는 "모두 알림"만 빠진다. 기준, 관심 키워드, Gemini 해당은 그대로 알린다(D-018).
            # 외부 인턴 공고는 하루에도 수십 건이라 "모두 알림"에서 뺀다(D-026). 맞는 공고만 알린다.
            if (process and priority is None and rules.notify_all and not source.get("external")
                    and notice.category not in muted_categories):
                priority = "low"
            if not args.dry_run and seen is not None and seen.status == "pending":
                previous = archive.items.get(f"{source['id']}/{notice.article_no}", {}).get("match", {})
                if previous.get("rule_name"):
                    match = Match(
                        notice,
                        previous["rule_name"],
                        previous["priority"],
                        tuple(previous.get("reasons", [])),
                    )
                ai_data = previous.get("ai")
                judgment = Judgment(**ai_data) if ai_data else None
                shown_interests = tuple(previous.get("interests", [])) or shown_interests
                priority = previous.get("priority") or priority or "default"
            if args.dry_run:
                name = match.rule_name if match else "-"
                ai_text = f" AI={judgment.verdict}: {judgment.reason}" if judgment else ""
                interest_text = f" 관심 {', '.join(shown_interests)}" if shown_interests else ""
                label = "새 글" if new else "본 글"
                print(
                    f"[{label}] [{name}] [{priority or '-'}] "
                    f"{notice.title} {notice.url}{interest_text}{ai_text}"
                )
                first_seen = seen.first_seen if seen else now.isoformat()
                archive = add_notice(
                    archive, notice, first_seen, match, judgment, priority,
                    interests=shown_interests,
                )
                continue
            if not process:
                continue
            if priority is None:
                state = record_result(state, notice, "skipped", now)
                save_state(STATE_PATH, state)
                archive = add_notice(
                    archive,
                    notice,
                    state.sources[source["id"]].seen[notice.article_no].first_seen,
                    match,
                    judgment,
                    priority,
                    interests=shown_interests,
                )
                save_archive(ARCHIVE_PATH, archive)
                continue
            # 영어 공지는 옮긴 제목으로 알린다.
            translated = archive.items.get(f"{source['id']}/{notice.article_no}", {}).get("translation") or {}
            korean = translated.get("title")
            sent = send_notice(
                replace(notice, title=korean) if korean else notice, source["name"], priority, match,
                judgment.reason if judgment else None, shown_interests,
            )
            state = record_result(state, notice, "notified" if sent else "pending", now)
            save_state(STATE_PATH, state)
            archive = add_notice(
                archive,
                notice,
                state.sources[source["id"]].seen[notice.article_no].first_seen,
                match,
                judgment,
                priority,
                sent,
                shown_interests,
            )
            save_archive(ARCHIVE_PATH, archive)
            if not sent:
                failed = True
                print(f"{source['id']}/{notice.article_no}: 알림 실패", file=sys.stderr)
    if not args.dry_run:
        archive = _notify_changes(archive, {s["id"]: s["name"] for s in settings["sources"]})
    if not getattr(args, "no_canvas", False):
        try:
            canvas_config = yaml.safe_load(CANVAS_CONFIG_PATH.read_text(encoding="utf-8"))
            fixture_dir = getattr(args, "canvas_fixtures", None)
            token = os.environ.get("CANVAS_TOKEN", "")
            if canvas_config.get("enabled") and (token or fixture_dir):
                canvas_state = load_canvas_state(CANVAS_STATE_PATH)
                minimum = max(30, int(canvas_config.get("min_refresh_minutes", 30)))
                recently_refreshed = (
                    not args.dry_run
                    and CANVAS_STATE_PATH.exists()
                    and time.time() - CANVAS_STATE_PATH.stat().st_mtime < minimum * 60
                )
                if not recently_refreshed:
                    items = read_canvas(token, now, fixture_dir)
                    summary_time = datetime.strptime(canvas_config["summary_time"], "%H:%M").time()
                    alerts, next_state = plan_alerts(
                        items, canvas_state, now, canvas_config["leads"], summary_time
                    )
                    if canvas_state.problem:
                        from dataclasses import replace

                        next_state = replace(next_state, problem=None)
                    if args.dry_run:
                        for alert in alerts:
                            print(f"[Canvas 알림 예정] {alert.title} | {alert.body} | {alert.url}")
                    elif not canvas_state.initialized:
                        for alert in alerts:
                            next_state = mark_sent(next_state, alert, now)
                        save_canvas_state(CANVAS_STATE_PATH, next_state)
                    else:
                        for alert in alerts:
                            if send_canvas(alert.title, alert.body, alert.url, alert.priority):
                                next_state = mark_sent(next_state, alert, now)
                                save_canvas_state(CANVAS_STATE_PATH, next_state)
                            else:
                                failed = True
                                print("Canvas 알림 실패", file=sys.stderr)
                        save_canvas_state(CANVAS_STATE_PATH, next_state)
            elif canvas_config.get("enabled"):
                print("CANVAS_TOKEN 없음: Canvas 건너뜀")
        except CanvasError as exc:
            if str(exc) == "토큰 거절":
                from dataclasses import replace

                current = load_canvas_state(CANVAS_STATE_PATH)
                problem = current.problem or {"code": "token-rejected", "notifiedProblem": False}
                current = replace(current, problem=problem)
                alert = problem_alert(current)
                if args.dry_run:
                    print(f"[Canvas 알림 예정] {alert.title}")
                else:
                    save_canvas_state(CANVAS_STATE_PATH, current)
                    if alert and send_canvas(alert.title, alert.body, alert.url, alert.priority):
                        save_canvas_state(
                            CANVAS_STATE_PATH, replace(current, problem={**problem, "notifiedProblem": True})
                        )
                failed = True
            else:
                print(f"Canvas: {exc}", file=sys.stderr)
                failed = True
        except (OSError, ValueError, KeyError, yaml.YAMLError) as exc:
            print(f"Canvas 설정 또는 fixture 오류: {type(exc).__name__}", file=sys.stderr)
            failed = True
    if getattr(args, "export", None):
        # 예전 규칙(비슷한 말)으로 저장된 관심 표시도 지금 키워드와 글자 그대로 다시 맞춘다(D-024).
        archive = Archive(refresh_archive_interests(archive.items, interests))
        export_site(args.export, archive, settings["sources"], now)
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="성균관대 공지 알림")
    parser.add_argument("--rules", type=Path, default=Path("config/rules.yaml"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--from-fixtures", action="store_true")
    parser.add_argument("--no-ai", action="store_true")
    parser.add_argument("--export", type=Path)
    parser.add_argument("--no-canvas", action="store_true")
    parser.add_argument("--canvas-fixtures", type=Path)
    return run(parser.parse_args())
