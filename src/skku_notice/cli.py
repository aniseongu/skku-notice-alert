"""Read public boards, judge new notices, deliver, and export snapshots."""

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import yaml
from dotenv import load_dotenv

from skku_notice.archive import Archive, add_notice, load_archive, save_archive
from skku_notice.canvas import CanvasError, read_canvas
from skku_notice.canvas_alerts import (
    load_canvas_state,
    mark_sent,
    plan_alerts,
    problem_alert,
    save_canvas_state,
)
from skku_notice.deadline import KST
from skku_notice.export import export_site
from skku_notice.fetch import FetchError, fetch_list
from skku_notice.interests import load_interests, match_interests
from skku_notice.judge import Judgment, decide_priority, judge_notices
from skku_notice.model import Match
from skku_notice.notify import send_canvas, send_notice
from skku_notice.parse import ParseError, parse_list
from skku_notice.rules import load_rules, match_notice
from skku_notice.state import baseline, is_new, load_state, record_result, save_state

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


def _profile() -> dict:
    raw = os.environ.get("PROFILE_YAML")
    if raw is None and PROFILE_PATH.exists():
        raw = PROFILE_PATH.read_text(encoding="utf-8")
    parsed = yaml.safe_load(raw) if raw else {}
    if not isinstance(parsed, dict):
        raise ValueError("profile must be a YAML mapping")
    return parsed


def run(args: argparse.Namespace) -> int:
    if args.all and not args.dry_run:
        print("--all requires --dry-run", file=sys.stderr)
        return 2
    if not args.rules.exists():
        print(f"{args.rules} 없음: config/rules.example.yaml을 복사하세요", file=sys.stderr)
        return 2
    load_dotenv(override=False)
    notify_urls = os.environ.get("NOTIFY_URLS", "").split(",")
    if not args.dry_run and not any(url.strip() for url in notify_urls):
        print("설정 오류: NOTIFY_URLS 없음", file=sys.stderr)
        return 2
    try:
        rules = load_rules(args.rules)
        interests = load_interests(INTERESTS_PATH, os.environ.get("INTEREST_KEYWORDS", ""))
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
    for source in settings["sources"]:
        source_id = source["id"]
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
    candidates = []
    for source, notices in boards:
        for notice in notices:
            record = state.sources.get(source["id"])
            seen = record.seen.get(notice.article_no) if record else None
            if (args.dry_run and (args.all or is_new(state, notice))) or (
                not args.dry_run and record is not None and seen is None
            ):
                if not any(
                    word.strip().casefold() in notice.title.casefold() for word in rules.exclude_title
                ):
                    candidates.append(notice)
    judgments = {}
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
            text_interests = match_interests(notice, interests) if process and not excluded else ()
            shown_interests = tuple(
                word for word in interests
                if word in text_interests or (judgment and word in judgment.interests)
            )
            priority = decide_priority(match, judgment, shown_interests) if process and not excluded else None
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
            sent = send_notice(
                notice, source["name"], priority, match, judgment.reason if judgment else None,
                shown_interests,
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
                    print("[Canvas 알림 예정] 아이캠퍼스 토큰 거절")
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
