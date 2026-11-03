# 출처: https://github.com/web-push-libs/pywebpush/blob/main/README.md
"""Send private browser subscriptions without exposing their capability URLs."""

import base64
import ipaddress
import json
import os
import sys
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from py_vapid import Vapid
from pywebpush import WebPushException, webpush


@dataclass(frozen=True, repr=False)
class WebPushConfig:
    subscription: dict = field(repr=False)
    private_key: str = field(repr=False)
    subject: str


def _public_endpoint(endpoint: str) -> bool:
    try:
        url = urlsplit(endpoint)
        host = (url.hostname or "").rstrip(".").lower()
        if url.scheme != "https" or not host or url.username or url.password or url.port not in (None, 443):
            return False
        try:
            return ipaddress.ip_address(host).is_global
        except ValueError:
            return "." in host and not host.endswith((".localhost", ".local", ".internal"))
    except ValueError:
        return False


def _decode_key(value: str) -> bytes:
    return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)


def web_push_config() -> WebPushConfig | None:
    """Validate before processing notices, using only safe error messages."""
    raw = os.environ.get("WEB_PUSH_SUBSCRIPTION", "").strip()
    private_key = os.environ.get("WEB_PUSH_PRIVATE_KEY", "").strip()
    if not raw and not private_key:
        return None
    if not raw or not private_key:
        raise ValueError("WEB_PUSH_SUBSCRIPTION과 WEB_PUSH_PRIVATE_KEY를 함께 설정하세요")
    try:
        subscription = json.loads(raw)
        if not isinstance(subscription, dict) or not _public_endpoint(subscription.get("endpoint", "")):
            raise ValueError
        keys = subscription["keys"]
        public = _decode_key(keys["p256dh"])
        auth = _decode_key(keys["auth"])
        if len(public) != 65 or public[0] != 4 or len(auth) != 16:
            raise ValueError
        Vapid.from_string(private_key)
    except Exception:
        # Library exceptions can contain subscription URLs or key material.
        raise ValueError("웹 푸시 구독 정보나 발송 키가 맞지 않아요") from None
    # py_vapid는 경로가 붙은 https 주소를 거부한다. 메일 주소는 공개 코드에 두지 않는다.
    subject = os.environ.get("WEB_PUSH_SUBJECT", "https://aniseongu.github.io").strip()
    if not subject.startswith(("https://", "mailto:")):
        raise ValueError("WEB_PUSH_SUBJECT는 https 또는 mailto 주소로 설정하세요")
    return WebPushConfig(subscription, private_key, subject)


def send_web_push(title: str, body: str, url: str, tag: str, priority: str) -> bool:
    try:
        config = web_push_config()
        if config is None:
            return False
        payload = {"title": title[:180], "body": body[:600], "url": url, "tag": tag,
                   "silent": priority == "low"}
        webpush(
            subscription_info=config.subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=config.private_key,
            vapid_claims={"sub": config.subject},
            timeout=10,
            ttl=86400,
        )
        return True
    except WebPushException as exc:
        # 상태 코드만 남긴다. 구독 주소와 응답 본문은 비밀이다(410은 구독 만료, 403은 발송 키 불일치).
        status = getattr(getattr(exc, "response", None), "status_code", None)
        print(f"웹 푸시 실패: HTTP {status or '응답 없음'}", file=sys.stderr)
        return False
    except Exception as exc:
        # Retain pending state for the next run; never log private endpoints or responses.
        print(f"웹 푸시 실패: {type(exc).__name__}", file=sys.stderr)
        return False
