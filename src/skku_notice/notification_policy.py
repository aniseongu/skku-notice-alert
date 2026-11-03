"""Notification eligibility for school posts and Gemini-classified internships."""

from skku_notice.judge import Judgment, decide_priority
from skku_notice.model import Match


def alert_priority(
    *, external: bool, title: str, body: str, match: Match | None,
    judgment: Judgment | None, interests: tuple[str, ...],
) -> str | None:
    """Notify every school post; only Gemini-relevant internships qualify."""
    if external:
        return "default" if judgment and judgment.verdict == "relevant" else None
    return decide_priority(match, judgment, interests) or "low"
