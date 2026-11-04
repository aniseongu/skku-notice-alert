# 출처: https://github.com/aniseongu/icampus-plus/blob/master/notify.js
"""Create an isolated, temporary LearningX session through Canvas' official LTI API."""

import json
import re
import time
from urllib.parse import unquote, urljoin, urlsplit

import httpx
from selectolax.lexbor import LexborHTMLParser

BASE = "https://canvas.skku.edu"


class LearningXError(Exception):
    """Contains only a fixed message, never launch URLs, forms or credentials."""


def _safe_url(url: str, pattern: str) -> str:
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.netloc != "canvas.skku.edu"
            or parts.fragment or not re.fullmatch(pattern, parts.path)):
        raise LearningXError("강의 인증 경로를 확인할 수 없어요")
    return url


def _json(response: httpx.Response):
    if not response.is_success:
        raise LearningXError(f"강의 API HTTP {response.status_code}")
    try:
        return json.loads(response.text.removeprefix("while(1);"))
    except ValueError:
        raise LearningXError("강의 API 응답 형식 오류") from None


class LearningXSession:
    """Never shares the Canvas PAT client's cookie jar or persists the issued token."""

    def __init__(self, client: httpx.Client | None = None):
        self.client = client or httpx.Client(timeout=10, follow_redirects=False)
        self._token: str | None = None

    def close(self) -> None:
        self._token = None
        self.client.cookies.clear()
        self.client.close()

    def _cookie_token(self) -> str | None:
        values = {cookie.value for cookie in self.client.cookies.jar
                  if cookie.name == "xn_api_token" and cookie.domain.lstrip(".") == "canvas.skku.edu"}
        return unquote(values.pop()) if len(values) == 1 else None

    def authenticate(self, canvas_client: httpx.Client, courses: list[dict], gap: float = 1) -> bool:
        """Try the first favorite's current course navigation tool exactly once per scan."""
        self._token = None
        self.client.cookies.clear()
        course = next((str(row.get("id")) for row in courses
                       if isinstance(row, dict) and str(row.get("id", "")).isdigit()), None)
        if not course:
            return False
        try:
            tabs = _json(canvas_client.get(f"{BASE}/api/v1/courses/{course}/tabs"))
            if not isinstance(tabs, list):
                raise LearningXError("강의 도구 목록 형식 오류")
            tool = next((row["id"].removeprefix("context_external_tool_") for row in tabs
                         if isinstance(row, dict) and isinstance(row.get("label"), str)
                         and "강의콘텐츠" in row["label"] and "(구)" not in row["label"]
                         and re.fullmatch(r"context_external_tool_\d+", str(row.get("id", "")))), None)
            if not tool:
                return False
            time.sleep(gap)
            launch = _json(canvas_client.get(
                f"{BASE}/api/v1/courses/{course}/external_tools/sessionless_launch?id={tool}"))
            if not isinstance(launch, dict) or not isinstance(launch.get("url"), str):
                raise LearningXError("강의 도구 응답 형식 오류")
            url = _safe_url(launch["url"], rf"/courses/{course}/external_tools/{tool}/?")
            # A brand-new client carries neither browser cookies nor Canvas PAT headers.
            page = self.client.get(url)
            for _ in range(3):
                if not page.is_redirect:
                    break
                url = urljoin(str(page.url), page.headers.get("location", ""))
                _safe_url(url, rf"/courses/{course}/external_tools/{tool}/?")
                page = self.client.get(url)
            if not page.is_success:
                raise LearningXError("강의 인증 양식을 받지 못했어요")
            form = LexborHTMLParser(page.text).css_first("form")
            if form is None or form.attributes.get("method", "post").lower() != "post":
                raise LearningXError("강의 인증 양식을 확인할 수 없어요")
            action = urljoin(url, form.attributes.get("action", ""))
            _safe_url(action, r"/learningx/(?:lti(?:/[A-Za-z0-9_-]+)*|launch|sso)/?")
            data = {node.attributes["name"]: node.attributes.get("value", "")
                    for node in form.css('input[type="hidden"]') if node.attributes.get("name")}
            if not data:
                raise LearningXError("강의 인증 양식이 비어 있어요")
            response = self.client.post(action, data=data)
            for _ in range(5):
                token = self._cookie_token()
                if token and (response.is_success or response.is_redirect):
                    self._token = token
                    return True
                if not response.is_redirect:
                    break
                destination = urljoin(str(response.url), response.headers.get("location", ""))
                _safe_url(destination, r"/learningx/(?:lti(?:/[A-Za-z0-9_-]+)*|launch|sso|courses/\d+)/?")
                response = self.client.get(destination)
            raise LearningXError("임시 강의 인증을 받지 못했어요")
        except (httpx.RequestError, httpx.InvalidURL):
            raise LearningXError("강의 인증 연결 실패") from None
        except (ValueError, TypeError, KeyError):
            raise LearningXError("강의 인증 응답 형식 오류") from None

    def read_modules(self, course_id: str, gap: float = 1) -> list[dict]:
        if not self._token or not str(course_id).isdigit():
            raise LearningXError("임시 강의 인증이 필요해요")
        path = f"/learningx/api/v1/courses/{course_id}/modules"
        url, rows, visited = BASE + path, [], set()
        try:
            while url and len(visited) < 25:
                _safe_url(url, re.escape(path))
                if url in visited:
                    raise LearningXError("강의 페이지 링크가 반복돼요")
                visited.add(url)
                response = self.client.get(url, headers={"Accept": "application/json",
                                                         "Authorization": f"Bearer {self._token}"})
                data = _json(response)
                if not isinstance(data, list) or any(not isinstance(row, dict) for row in data):
                    raise LearningXError("강의 목록 형식 오류")
                rows.extend(data)
                next_url = response.links.get("next", {}).get("url")
                url = urljoin(url, next_url) if next_url else ""
                if url:
                    time.sleep(gap)
            if url:
                raise LearningXError("강의 페이지 제한 초과")
            return rows
        except (httpx.RequestError, httpx.InvalidURL):
            raise LearningXError("강의 목록 연결 실패") from None
