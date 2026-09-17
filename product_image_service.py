"""Automatic product image + product-page lookup with local caching.

The stock app never depends on this enrichment to function. Existing local images
are reused first. When an image is missing, public image-search results are used
to find a likely product image and its originating product webpage. A lightweight
match score is stored so the UI can show whether the source link is a verified,
strong, possible, or unverified match instead of presenting every web result as
certainly correct.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse
import hashlib
import html
import json
import re
import threading

import requests

from runtime_paths import AUTO_IMAGE_DIR


BASE_DIR = Path(__file__).resolve().parent
PRODUCT_IMAGE_DIR = BASE_DIR / "static" / "product_images"
CACHE_INDEX_FILE = AUTO_IMAGE_DIR / "image_cache.json"

PRODUCT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
AUTO_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

_LOCK = threading.Lock()

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/152.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def _clean(value):
    return " ".join(str(value or "").strip().split())


def _key(product_name, brand="", model=""):
    raw = "|".join(
        part.lower()
        for part in (_clean(product_name), _clean(brand), _clean(model))
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _slug(value):
    text = re.sub(r"[^a-z0-9]+", "_", _clean(value).lower()).strip("_")
    return text[:80] or "product"


def _tokens(value):
    return [
        token
        for token in re.findall(r"[a-z0-9]+", _clean(value).lower())
        if len(token) >= 3
        and token not in {"the", "and", "for", "with", "instrument", "product"}
    ]


def _read_index():
    try:
        data = json.loads(CACHE_INDEX_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_index(data):
    temporary = CACHE_INDEX_FILE.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary.replace(CACHE_INDEX_FILE)


def _static_url_for(path):
    path = Path(path)
    try:
        relative = path.relative_to(BASE_DIR / "static").as_posix()
        return f"/static/{relative}"
    except ValueError:
        try:
            relative = path.relative_to(AUTO_IMAGE_DIR).as_posix()
            return f"/data-product-images/{relative}"
        except ValueError:
            return ""


def _find_existing_named_image(product_name):
    slug = _slug(product_name)
    for extension in ("jpg", "jpeg", "png", "webp", "gif"):
        candidate = PRODUCT_IMAGE_DIR / f"{slug}.{extension}"
        if candidate.exists():
            return candidate
    return None


def _manual_info(product_name):
    path = _find_existing_named_image(product_name)
    if not path:
        return None
    return {
        "success": True,
        "image_url": _static_url_for(path),
        "product_url": "",
        "source_url": "",
        "source_name": "Local product image",
        "match_status": "Local image",
        "match_score": 100,
        "page_status": "Local image",
        "http_status": None,
        "cached": True,
        "verified": False,
    }


def _status_from_score(score, has_product_url, exact_model=False):
    if not has_product_url:
        return "Image only"
    if exact_model and score >= 68:
        return "Verified match"
    if score >= 55:
        return "Strong match"
    if score >= 32:
        return "Possible match"
    return "Link not verified"


def _strict_preview_match(info, product_name, brand="", model=""):
    """Return True only when the source metadata strongly identifies the product.

    This is intentionally stricter than the normal enrichment flow because the
    storage preview must never present a loosely related image as the selected
    product. Generic image-only/CDN results are rejected.
    """
    if not info:
        return False

    image_url = _clean(info.get("image_url") or info.get("source_url"))
    product_url = _clean(info.get("product_url"))
    if not image_url or not product_url:
        return False

    host = urlparse(product_url).netloc.lower()
    if not host or any(
        bad in host
        for bad in ("bing.com", "duckduckgo.com", "google.com", "googleusercontent.com", "gstatic.com")
    ):
        return False

    title = _clean(info.get("title"))
    source = _clean(info.get("source_name"))
    haystack = " ".join((title, product_url, source)).lower()

    tokens = _tokens(product_name)
    if tokens:
        matched = sum(1 for token in tokens if token in haystack)
        coverage = matched / len(tokens)
        if coverage < 0.80:
            return False

    brand_clean = _clean(brand).lower()
    if brand_clean and brand_clean not in haystack:
        return False

    model_clean = _clean(model).lower()
    if model_clean and model_clean not in haystack:
        return False

    score = int(info.get("match_score") or 0)
    minimum_score = 68 if model_clean else 40
    if score < minimum_score:
        return False

    return True


def _score_candidate(candidate, product_name, brand="", model=""):
    title = _clean(candidate.get("title"))
    product_url = _clean(candidate.get("product_url"))
    source = _clean(candidate.get("source_name"))
    haystack = " ".join((title, product_url, source)).lower()

    product_tokens = _tokens(product_name)
    matched_tokens = sum(1 for token in product_tokens if token in haystack)
    coverage = matched_tokens / max(1, len(product_tokens))

    score = int(round(coverage * 38))

    brand_clean = _clean(brand).lower()
    if brand_clean and brand_clean in haystack:
        score += 18

    model_clean = _clean(model).lower()
    exact_model = bool(model_clean and model_clean in haystack)
    if exact_model:
        score += 42

    if product_url:
        score += 5

    # Prefer real webpages over image CDNs/search-engine cache pages.
    host = urlparse(product_url).netloc.lower() if product_url else ""
    if host and not any(
        bad in host
        for bad in ("bing.com", "duckduckgo.com", "googleusercontent.com", "gstatic.com")
    ):
        score += 4

    score = min(100, score)
    return score, exact_model


def _normalize_candidate(item, product_name, brand="", model=""):
    image_url = _clean(item.get("image_url") or item.get("image"))
    product_url = _clean(item.get("product_url") or item.get("url"))
    if not image_url.startswith(("http://", "https://")):
        return None
    if product_url and not product_url.startswith(("http://", "https://")):
        product_url = ""

    candidate = {
        "image_url": image_url,
        "product_url": product_url,
        "title": _clean(item.get("title")),
        "source_name": _clean(item.get("source_name") or item.get("source")),
    }
    score, exact_model = _score_candidate(candidate, product_name, brand, model)
    candidate["match_score"] = score
    candidate["exact_model"] = exact_model
    candidate["match_status"] = _status_from_score(score, bool(product_url), exact_model)
    return candidate


def _duckduckgo_candidates(session, query, product_name, brand="", model=""):
    try:
        search = session.get(
            "https://duckduckgo.com/",
            params={"q": query},
            headers=_HEADERS,
            timeout=8,
        )
        search.raise_for_status()

        match = re.search(r'vqd=["\']?([\d-]+)', search.text)
        if not match:
            match = re.search(r'vqd=([^&"\']+)', search.text)
        if not match:
            return []

        response = session.get(
            "https://duckduckgo.com/i.js",
            params={
                "l": "us-en",
                "o": "json",
                "q": query,
                "vqd": match.group(1),
                "f": ",,,",
                "p": "1",
            },
            headers={**_HEADERS, "Referer": search.url},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()

        candidates = []
        for item in payload.get("results", [])[:18]:
            candidate = _normalize_candidate(
                {
                    "image_url": item.get("image") or item.get("thumbnail"),
                    "product_url": item.get("url"),
                    "title": item.get("title"),
                    "source_name": item.get("source"),
                },
                product_name,
                brand,
                model,
            )
            if candidate:
                candidates.append(candidate)
        return candidates
    except Exception:
        return []


def _bing_candidates(session, query, product_name, brand="", model=""):
    try:
        response = session.get(
            "https://www.bing.com/images/search",
            params={"q": query, "form": "HDRSC2", "first": 1},
            headers=_HEADERS,
            timeout=10,
        )
        response.raise_for_status()

        candidates = []
        # Bing image-result anchors normally contain an HTML-escaped JSON "m"
        # attribute with murl (image) and purl (source product/page URL).
        for raw_meta in re.findall(r'\sm="({.*?})"', response.text, flags=re.IGNORECASE):
            try:
                metadata = json.loads(html.unescape(raw_meta))
            except Exception:
                continue

            candidate = _normalize_candidate(
                {
                    "image_url": metadata.get("murl") or metadata.get("turl"),
                    "product_url": metadata.get("purl"),
                    "title": metadata.get("t") or metadata.get("desc"),
                    "source_name": metadata.get("surl") or metadata.get("site"),
                },
                product_name,
                brand,
                model,
            )
            if candidate:
                candidates.append(candidate)
            if len(candidates) >= 18:
                break

        if candidates:
            return candidates

        # Fallback for Bing markup variants where only direct image URLs can be
        # extracted. These are deliberately marked as unverified/image-only.
        text = html.unescape(response.text)
        for value in re.findall(r'"murl":"(https?://[^"\\]+)', text, flags=re.IGNORECASE):
            candidate = _normalize_candidate(
                {"image_url": value.replace("\\/", "/")},
                product_name,
                brand,
                model,
            )
            if candidate:
                candidates.append(candidate)
            if len(candidates) >= 12:
                break
        return candidates
    except Exception:
        return []


def _detect_extension(data):
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(data) > 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ""


def _check_product_page(session, product_url):
    """Best-effort source-page health/availability check. Never blocks stock logic."""
    product_url = _clean(product_url)
    if not product_url:
        return {"page_status": "No product link", "http_status": None}

    try:
        response = session.get(
            product_url,
            headers=_HEADERS,
            timeout=8,
            allow_redirects=True,
            stream=True,
        )
        http_status = int(response.status_code)

        if http_status >= 400:
            response.close()
            return {"page_status": "Link unavailable", "http_status": http_status}

        chunks = []
        total = 0
        max_bytes = 700 * 1024
        for chunk in response.iter_content(chunk_size=32 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                break
            chunks.append(chunk)
        encoding = response.encoding or "utf-8"
        response.close()

        text = b"".join(chunks).decode(encoding, errors="ignore")
        plain = re.sub(r"<script.*?</script>|<style.*?</style>", " ", text, flags=re.I | re.S)
        plain = re.sub(r"<[^>]+>", " ", plain)
        plain = html.unescape(plain)
        plain = " ".join(plain.lower().split())

        if re.search(r"\b(discontinued|no longer available|end of life|eol product)\b", plain):
            page_status = "Discontinued"
        elif re.search(r"\b(out of stock|currently unavailable|sold out|not in stock)\b", plain):
            page_status = "Out of stock"
        elif re.search(r"\b(in stock|available now|ready to ship|available for order)\b", plain):
            page_status = "Available"
        else:
            page_status = "Page active"

        return {
            "page_status": page_status,
            "http_status": http_status,
            "resolved_product_url": _clean(response.url) if getattr(response, "url", None) else product_url,
        }
    except Exception:
        return {"page_status": "Status not confirmed", "http_status": None}


def _download_candidate(session, url):
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return None

        response = session.get(
            url,
            headers=_HEADERS,
            timeout=10,
            stream=True,
            allow_redirects=True,
        )
        response.raise_for_status()

        content_type = str(response.headers.get("Content-Type") or "").lower()
        if content_type and not content_type.startswith("image/"):
            return None
        if "svg" in content_type:
            return None

        chunks = []
        total = 0
        max_bytes = 5 * 1024 * 1024
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                return None
            chunks.append(chunk)

        data = b"".join(chunks)
        if len(data) < 1200:
            return None

        extension = _detect_extension(data)
        if not extension:
            return None

        return data, extension, response.url
    except Exception:
        return None


def get_cached_product_image_info(product_name, brand="", model=""):
    product_name = _clean(product_name)
    if not product_name:
        return {
            "success": False,
            "image_url": "",
            "product_url": "",
            "source_url": "",
            "match_status": "No image",
            "match_score": 0,
            "page_status": "Not checked",
            "http_status": None,
            "cached": False,
            "verified": False,
        }

    manual = _manual_info(product_name)

    cache_key = _key(product_name, brand, model)
    with _LOCK:
        record = dict(_read_index().get(cache_key) or {})

    filename = _clean(record.get("filename"))
    path = AUTO_IMAGE_DIR / Path(filename).name if filename else None
    cached_auto_image = bool(path and path.exists())

    # A manually supplied image stays visually authoritative, but online
    # source-page metadata may still be attached to it. This lets users keep
    # their preferred product photo while still seeing the verified/source link.
    if manual:
        if not record:
            manual["match_status"] = "Source not checked"
            manual["match_score"] = 0
            manual["page_status"] = "Not checked"
            return manual

        product_url = _clean(record.get("product_url"))
        score = int(record.get("match_score") or 0)
        status = _clean(record.get("match_status")) or (
            _status_from_score(score, bool(product_url)) if product_url else "Link not verified"
        )
        manual.update({
            "product_url": product_url,
            "source_url": _clean(record.get("source_url")),
            "source_name": _clean(record.get("source_name")),
            "title": _clean(record.get("title")),
            "query": _clean(record.get("query")),
            "match_status": status,
            "match_score": score,
            "page_status": _clean(record.get("page_status")) or "Not checked",
            "http_status": record.get("http_status"),
            "verified": status == "Verified match",
        })
        return manual

    if not filename or not cached_auto_image:
        return {
            "success": False,
            "image_url": "",
            "product_url": "",
            "source_url": "",
            "match_status": "Not checked",
            "match_score": 0,
            "page_status": "Not checked",
            "http_status": None,
            "cached": False,
            "verified": False,
        }

    product_url = _clean(record.get("product_url"))
    score = int(record.get("match_score") or 0)
    status = _clean(record.get("match_status"))

    # Compatibility with V3 cache records: they stored only the downloaded
    # image URL, which is not a product-page verification link.
    if not status:
        status = "Link not verified" if not product_url else _status_from_score(score, True)

    return {
        "success": True,
        "image_url": _static_url_for(path),
        "product_url": product_url,
        "source_url": _clean(record.get("source_url")),
        "source_name": _clean(record.get("source_name")),
        "title": _clean(record.get("title")),
        "query": _clean(record.get("query")),
        "match_status": status,
        "match_score": score,
        "page_status": _clean(record.get("page_status")) or "Not checked",
        "http_status": record.get("http_status"),
        "cached": True,
        "verified": status == "Verified match",
    }


def get_cached_product_image_url(product_name, brand="", model=""):
    return get_cached_product_image_info(product_name, brand, model).get("image_url", "")


def _get_cached_auto_product_image_info(product_name, brand="", model=""):
    """Return only an automatically downloaded web image, never a manual/local override."""
    product_name = _clean(product_name)
    if not product_name:
        return {"success": False}

    cache_key = _key(product_name, brand, model)
    with _LOCK:
        record = dict(_read_index().get(cache_key) or {})

    filename = _clean(record.get("filename"))
    path = AUTO_IMAGE_DIR / Path(filename).name if filename else None
    if not path or not path.exists():
        return {"success": False}

    product_url = _clean(record.get("product_url"))
    score = int(record.get("match_score") or 0)
    status = _clean(record.get("match_status")) or (
        _status_from_score(score, bool(product_url)) if product_url else "Link not verified"
    )

    return {
        "success": True,
        "image_url": _static_url_for(path),
        "product_url": product_url,
        "source_url": _clean(record.get("source_url")),
        "source_name": _clean(record.get("source_name")),
        "title": _clean(record.get("title")),
        "query": _clean(record.get("query")),
        "match_status": status,
        "match_score": score,
        "page_status": _clean(record.get("page_status")) or "Not checked",
        "http_status": record.get("http_status"),
        "cached": True,
        "verified": status == "Verified match",
    }


def search_and_cache_product_image(product_name, brand="", model="", force=False, strict=False):
    product_name = _clean(product_name)
    brand = _clean(brand)
    model = _clean(model)

    if not product_name:
        return {
            "success": False,
            "image_url": "",
            "product_url": "",
            "source_url": "",
            "match_status": "No image",
            "match_score": 0,
        }

    if not force:
        cached = (
            _get_cached_auto_product_image_info(product_name, brand, model)
            if strict
            else get_cached_product_image_info(product_name, brand, model)
        )
        if cached.get("success"):
            if not strict or _strict_preview_match(cached, product_name, brand, model):
                if strict:
                    cached = dict(cached)
                    cached["preview_verified"] = True
                return cached

    query_parts = [product_name]
    if brand and brand.lower() not in product_name.lower():
        query_parts.append(brand)
    if model and model.lower() not in product_name.lower():
        query_parts.append(model)
    query_parts.extend(["instrument", "product"])
    query = " ".join(query_parts)

    session = requests.Session()
    candidates = _duckduckgo_candidates(session, query, product_name, brand, model)
    if strict:
        # Only consult the second engine when the first engine has no strict
        # identity match. This keeps repeat preview loads fast while preserving
        # accuracy when a broader search is genuinely needed.
        if not any(
            _strict_preview_match(candidate, product_name, brand, model)
            for candidate in candidates
        ):
            candidates.extend(_bing_candidates(session, query, product_name, brand, model))
    elif not candidates:
        candidates = _bing_candidates(session, query, product_name, brand, model)

    # Best match first, but still try lower candidates if an image host rejects
    # the actual download.
    candidates.sort(key=lambda item: int(item.get("match_score") or 0), reverse=True)
    cache_key = _key(product_name, brand, model)

    for candidate in candidates[:12]:
        if strict and not _strict_preview_match(candidate, product_name, brand, model):
            continue

        downloaded = _download_candidate(session, candidate.get("image_url"))
        if not downloaded:
            continue

        data, extension, downloaded_image_url = downloaded
        filename = f"{_slug(product_name)}_{cache_key}{extension}"
        path = AUTO_IMAGE_DIR / filename

        page_check = _check_product_page(
            session,
            candidate.get("product_url"),
        )

        record = {
            "product_name": product_name,
            "brand": brand,
            "model": model,
            "filename": filename,
            "source_url": downloaded_image_url,
            "product_url": _clean(page_check.get("resolved_product_url")) or _clean(candidate.get("product_url")),
            "source_name": _clean(candidate.get("source_name")),
            "title": _clean(candidate.get("title")),
            "query": query,
            "match_status": _clean(candidate.get("match_status")) or "Link not verified",
            "match_score": int(candidate.get("match_score") or 0),
            "page_status": page_check.get("page_status", "Not checked"),
            "http_status": page_check.get("http_status"),
        }

        with _LOCK:
            path.write_bytes(data)
            index = _read_index()
            index[cache_key] = record
            _write_index(index)

        return {
            "success": True,
            "image_url": _static_url_for(path),
            "product_url": record["product_url"],
            "source_url": record["source_url"],
            "source_name": record["source_name"],
            "title": record["title"],
            "match_status": record["match_status"],
            "match_score": record["match_score"],
            "page_status": record["page_status"],
            "http_status": record["http_status"],
            "cached": False,
            "verified": record["match_status"] == "Verified match",
            "preview_verified": bool(strict),
        }

    return {
        "success": False,
        "image_url": "",
        "product_url": "",
        "source_url": "",
        "match_status": "No verified link",
        "match_score": 0,
        "page_status": "No product link",
        "http_status": None,
        "verified": False,
        "preview_verified": False,
        "message": (
            "No sufficiently verified online product image was found."
            if strict
            else "No suitable online product image/source link was found."
        ),
    }
