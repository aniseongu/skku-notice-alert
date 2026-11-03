"""Notification eligibility for public school posts and software internships."""

import re

from skku_notice.judge import Judgment, decide_priority
from skku_notice.model import Match

# 구체적 기술 직무만 긍정한다. AI를 쓰는 마케팅이나 일반 기획은 별도 직무로 본다.
_TECH = re.compile(
    r"소프트웨어|프로그래머|프로그래밍|개발자|개발\s*(?:인턴|직무|직군|엔지니어|부문|팀)|"
    r"(?:백엔드|프론트엔드|풀스택|서버|웹|앱|모바일|시스템|보안|데이터|인공지능|머신러닝|딥러닝)\s*"
    r"(?:개발|엔지니어|분석|과학|사이언티스트|보안|인턴|직무|직군)|"
    r"정보보안|사이버보안|보안\s*(?:분석|관제)|보안관제|"
    r"(?<![a-z])(?:software|backend|back-end|frontend|front-end|fullstack|full-stack|"
    r"devops|security\s+analyst|data\s+(?:engineer|scientist|analyst)|"
    r"(?:ai|ml)\s+engineer|engineering\s+focused|developer|programmer|qa)(?![a-z])",
    re.I,
)
_NONTECH = re.compile(
    r"마케팅|마케터|영업|세일즈|법무|인사(?:팀|담당|관리|직무|인턴|[ /·,–-]|$)|인재개발|"
    r"채용\s*(?:담당|코디네이터)|총무|"
    r"회계|재무|패션|디자이너|디자인|영상|콘텐츠\s*(?:제작|운영)|행정|물류|"
    r"(?<![a-z])(?:marketing|marketer|sales|recruiting|legal|finance|designer)(?![a-z])",
    re.I,
)
_EXPERIENCED_ONLY = re.compile(r"경력\s*(?:직|필수|\d+\s*년\s*이상)|(?<!\d)[3-9]\s*년\s*이상\s*경력", re.I)
_TRAINING = re.compile(r"국비\s*지원|교육\s*(?:과정|캠프|생)|부트\s*캠프")
_JOB_CONTEXT = re.compile(r"모집\s*(?:부문|분야|직무|직군)|채용\s*(?:분야|직무|직군)|담당\s*업무|지원\s*분야")


def _needs_experience(text: str) -> bool:
    for line in text.splitlines():
        for match in _EXPERIENCED_ONLY.finditer(line):
            if re.search(r"신입\s*[/·,및과와]\s*경력|경력\s*[/·,및과와]\s*신입", line):
                continue
            if re.search(r"우대|선호", line[match.end():match.end() + 15]):
                continue
            return True
    return False


def internship_title_ineligible(title: str) -> bool:
    """Only conditions that further body text cannot turn into a software internship."""
    job_title = re.sub(r"^\s*\[[^\]]+\]\s*", "", title, count=1)
    return bool(_needs_experience(job_title) or _TRAINING.search(job_title) or _NONTECH.search(job_title))


def software_intern_eligible(title: str, body: str = "", verdict: str | None = None) -> bool:
    """Require direct software job evidence; AI alone cannot qualify an external post."""
    if verdict in {"maybe", "not_relevant"}:
        return False
    # 첫 대괄호는 회사 이름이다. 회사 업종만 보고 직무로 오인하지 않는다.
    job_title = re.sub(r"^\s*\[[^\]]+\]\s*", "", title, count=1)
    if internship_title_ineligible(title) or _needs_experience(body):
        return False
    if _TECH.search(job_title):
        return True
    # 본문에 제품이나 회사의 기술이 나오는 것만으로는 직무 근거가 아니다.
    # 명시적인 모집 분야나 담당 업무 항목 주변에 기술 직무가 있어야 한다.
    for heading in _JOB_CONTEXT.finditer(body):
        section = body[heading.end():heading.end() + 160]
        technology = _TECH.search(section)
        other_role = _NONTECH.search(section)
        if technology and (not other_role or technology.start() < other_role.start()):
            return True
    return False


def alert_priority(
    *, external: bool, title: str, body: str, match: Match | None,
    judgment: Judgment | None, interests: tuple[str, ...],
) -> str | None:
    """School posts always notify; internships need software eligibility."""
    if external:
        if not software_intern_eligible(title, body, judgment.verdict if judgment else None):
            return None
        return decide_priority(match, judgment) or "default"
    return decide_priority(match, judgment, interests) or "low"
