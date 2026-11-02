"""Preview SKKU notices against local rules."""

import argparse
import sys
import time
from pathlib import Path

import yaml

from skku_notice.fetch import FetchError, fetch_list
from skku_notice.parse import ParseError, parse_list
from skku_notice.rules import load_rules, match_notice
from skku_notice.state import is_new, load_state

SOURCES_PATH = Path("config/sources.yaml")
STATE_PATH = Path("state/seen.json")
FIXTURES_PATH = Path("tests/fixtures")


def _fixture(source_id: str) -> str:
    candidates = sorted(FIXTURES_PATH.glob(f"{source_id.replace('-', '_')}_list_*.html"))
    if not candidates:
        raise FileNotFoundError(f"fixture not found: {source_id}")
    return candidates[-1].read_text(encoding="utf-8")


def run(args: argparse.Namespace) -> int:
    if args.all and not args.dry_run:
        print("--all requires --dry-run", file=sys.stderr)
        return 2
    if not args.dry_run:
        print("M1 supports --dry-run only; notifications arrive in M2", file=sys.stderr)
        return 2
    if not args.rules.exists():
        print(f"{args.rules} 없음: config/rules.example.yaml을 복사하세요", file=sys.stderr)
        return 2
    try:
        rules = load_rules(args.rules)
        settings = yaml.safe_load(SOURCES_PATH.read_text(encoding="utf-8"))
        state = load_state(STATE_PATH)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(f"설정 오류: {exc}", file=sys.stderr)
        return 2
    gap = max(1.0, float(settings.get("request_gap_seconds", 1)))
    previous_network = False
    failed = False
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
        if source_id not in state.sources:
            print(f"{source_id}: state 없음: 실제 첫 실행이면 알림 없이 기준선만 저장")
        for notice in notices:
            new = is_new(state, notice)
            matched = match_notice(notice, rules) if args.all or new else None
            new_label = "새 글" if new else "본 글"
            name = matched.rule_name if matched else "-"
            priority = matched.priority if matched else "-"
            print(f"[{new_label}] [{name}] [{priority}] {notice.title} {notice.url}")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="성균관대 공지 규칙 미리 보기")
    parser.add_argument("--rules", type=Path, default=Path("config/rules.yaml"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--from-fixtures", action="store_true")
    return run(parser.parse_args())
