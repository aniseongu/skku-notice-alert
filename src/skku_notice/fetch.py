# 출처: https://github.com/tsungmnli/skku-notice-api/blob/main/app/crawler/fetch.py
"""Network access to public list pages, with bounded retries."""

import time
from dataclasses import dataclass

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@dataclass(frozen=True)
class ImageData:
    data: bytes
    mime_type: str


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


def fetch_image(url: str, user_agent: str) -> ImageData | None:
    try:
        with httpx.Client(headers={"User-Agent": user_agent}, timeout=10,
                          follow_redirects=True) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                mime_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                if not mime_type.startswith("image/"):
                    return None
                size = response.headers.get("Content-Length")
                if size is not None and int(size) > MAX_IMAGE_BYTES:
                    return None
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_IMAGE_BYTES:
                        return None
                return ImageData(bytes(data), mime_type)
    except (httpx.HTTPError, ValueError):
        return None


def fetch_images(urls: list[str], user_agent: str, limit: int) -> list[ImageData]:
    images = []
    previous_request: float | None = None
    for url in urls[:min(3, max(0, limit))]:
        if previous_request is not None:
            time.sleep(max(0, 1 - (time.monotonic() - previous_request)))
        previous_request = time.monotonic()
        image = fetch_image(url, user_agent)
        if image is not None:
            images.append(image)
    return images
