# 출처: https://github.com/hg111911190-sketch/skku-notice/blob/main/jobs.py
"""External internship postings (Linkareer, Jasoseol) as notices. One request per site per run (D-026)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from skku_notice.deadline import KST
from skku_notice.model import Notice

LIMIT = 30
LK_API = "https://api.linkareer.com/graphql"
LK_HEADERS = {"Origin": "https://linkareer.com", "Referer": "https://linkareer.com/"}
LK_LIST = (
    "query($f:ActivityFilter,$o:ActivityOrder,$p:Pagination)"
    "{activities(filterBy:$f,orderBy:$o,pagination:$p)"
    "{nodes{id title organizationName recruitStartAt recruitCloseAt"
    " categories{name} distinctInternTypes{name}}}}"
)
JSS_CAL = "https://jasoseol.com/employment/calendar_list.json"

Post = Callable[[str, dict, dict], dict]
Posting = tuple[Notice, str | None]


def _from_ms(value: object) -> datetime | None:
    return datetime.fromtimestamp(value / 1000, KST) if isinstance(value, int | float) and value > 0 else None


def linkareer(post: Post, now: datetime, source_id: str = "linkareer") -> list[Posting]:
    variables = {"f": {"activityTypeID": "5", "jobTypes": ["INTERN"], "status": "OPEN"},
                 "o": {"direction": "DESC", "field": "RECENT"}, "p": {"page": 1, "pageSize": LIMIT}}
    nodes = (post(LK_API, {"query": LK_LIST, "variables": variables}, LK_HEADERS).get("data") or {}) \
        .get("activities", {}).get("nodes", [])
    postings = []
    for node in nodes:
        close, start = _from_ms(node.get("recruitCloseAt")), _from_ms(node.get("recruitStartAt"))
        if not node.get("id") or not node.get("title") or (close and close < now):
            continue
        types = node.get("distinctInternTypes") or []
        kinds = [t["name"] for t in types if t.get("name") and t["name"] != "기타"]
        company = node.get("organizationName") or ""
        title = f"[{company}] {node['title']}" if company and company not in node["title"] else node["title"]
        postings.append((Notice(source_id, str(node["id"]), title, ", ".join(kinds) or "인턴",
                                f"https://linkareer.com/activity/{node['id']}", (start or now).date(), False),
                         close.isoformat() if close else None))
    return postings


def jasoseol(post: Post, now: datetime, source_id: str = "jasoseol") -> list[Posting]:
    def iso(moment: datetime) -> str:
        return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    window = {"start_time": iso(now - timedelta(days=30)), "end_time": iso(now + timedelta(days=90))}
    data = post(JSS_CAL, window, {})
    chosen = {}
    for item in data.get("employment", []):
        divisions = {part.get("division") for part in item.get("employments") or []}
        title = item.get("title") or ""
        end = datetime.fromisoformat(item["end_time"]).astimezone(KST) if item.get("end_time") else None
        # division 3이 인턴이다(참고 코드). 제목에 인턴이 있는 공고도 받는다.
        if not item.get("id") or (3 not in divisions and "인턴" not in title) or (end and end < now):
            continue
        chosen[item["id"]] = (item, end)
    newest = sorted(chosen.values(), key=lambda pair: pair[0].get("start_time") or "", reverse=True)[:LIMIT]
    postings = []
    for item, end in newest:
        start = datetime.fromisoformat(item["start_time"]).astimezone(KST) if item.get("start_time") else now
        company = item.get("name") or ""
        title = f"[{company}] {item['title']}" if company and company not in item["title"] else item["title"]
        postings.append((Notice(source_id, str(item["id"]), title, "인턴",
                                f"https://jasoseol.com/recruit/{item['id']}", start.date(), False),
                         end.isoformat() if end else None))
    return postings


COLLECTORS = {"linkareer": linkareer, "jasoseol": jasoseol}
