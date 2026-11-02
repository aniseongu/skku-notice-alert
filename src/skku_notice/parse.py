# 출처: https://github.com/tsungmnli/skku-notice-api/blob/main/app/crawler/parser.py
"""Parse one SKKU CMS list page without network access."""

import re
from datetime import date
from urllib.parse import parse_qs, urljoin, urlsplit

from selectolax.lexbor import LexborHTMLParser, LexborNode

from skku_notice.model import Notice

ROW_SELECTOR = "ul.board-list-wrap > li"
TITLE_SELECTOR = "dt.board-list-content-title"
LINK_SELECTOR = "a[href]"
CATEGORY_SELECTOR = ".c-board-list-category"
INFO_SELECTOR = "dd.board-list-content-info li"
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


class ParseError(ValueError):
    """The board list has unexpected markup or missing required data."""


def _clean(node: LexborNode) -> str:
    return " ".join(node.text(separator=" ").replace("\ufeff", "").replace("\u200b", "").split())


def _parse_row(row: LexborNode, source_id: str, board_url: str) -> Notice:
    title_node = row.css_first(TITLE_SELECTOR)
    link = title_node.css_first(LINK_SELECTOR) if title_node else None
    if link is None:
        raise ParseError("row without title link")
    href = link.attributes.get("href", "")
    article_no = parse_qs(urlsplit(urljoin(board_url, href)).query).get("articleNo", [""])[0]
    title = _clean(link)
    if not article_no.isdecimal() or not title:
        raise ParseError("row without articleNo or title")
    info = row.css(INFO_SELECTOR)
    if len(info) < 3:
        raise ParseError(f"article {article_no}: missing date column")
    date_text = _clean(info[2])
    found = DATE_RE.search(date_text)
    if not found:
        raise ParseError(f"article {article_no}: invalid date {date_text!r}")
    try:
        posted_on = date.fromisoformat(found.group())
    except ValueError as exc:
        raise ParseError(f"article {article_no}: invalid date {date_text!r}") from exc
    category_node = title_node.css_first(CATEGORY_SELECTOR)
    category = _clean(category_node).strip("[] ") if category_node else None
    pinned = "board-list-content-top" in title_node.attributes.get("class", "").split()
    base = board_url.split("?", 1)[0]
    return Notice(
        source_id, article_no, title, category, f"{base}?mode=view&articleNo={article_no}", posted_on, pinned
    )


def parse_list(html: str, source_id: str, board_url: str) -> list[Notice]:
    tree = LexborHTMLParser(html)
    if tree.css_first("ul.board-list-wrap") is None:
        raise ParseError("ul.board-list-wrap not found")
    rows = [row for row in tree.css(ROW_SELECTOR) if row.css_first("dl.board-list-content-wrap")]
    if not rows:
        raise ParseError("board list has no articles")
    return [_parse_row(row, source_id, board_url) for row in rows]
