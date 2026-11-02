# 출처: https://github.com/tsungmnli/skku-notice-api/blob/main/app/crawler/fetch.py
"""Network access to public list pages, with bounded retries."""

import time

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    """A board page could not be fetched."""


def fetch_list(url: str, user_agent: str, timeout_seconds: float) -> str:
    headers = {"User-Agent": user_agent, "Accept-Language": "ko"}
    with httpx.Client(headers=headers, timeout=timeout_seconds, follow_redirects=True) as client:
        for attempt in range(3):
            try:
                response = client.get(url)
            except httpx.TransportError as exc:
                error = exc
            else:
                if response.status_code == 200:
                    response.encoding = "utf-8"
                    return response.text
                if response.status_code not in RETRY_STATUS:
                    raise FetchError(f"{url}: HTTP {response.status_code}")
                error = FetchError(f"{url}: HTTP {response.status_code}")
            if attempt < 2:
                time.sleep(2**attempt)
    raise FetchError(f"{url}: failed after 3 attempts ({error})") from error


def fetch_detail(url: str, user_agent: str, timeout_seconds: float) -> str:
    headers = {"User-Agent": user_agent, "Accept-Language": "ko"}
    try:
        response = httpx.get(url, headers=headers, timeout=timeout_seconds, follow_redirects=True)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise FetchError(f"{url}: detail fetch failed") from exc
    response.encoding = "utf-8"
    return response.text
