import html
import re
import requests

API_URL = "https://lostpedia.fandom.com/api.php"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def fetch_sections(session: requests.Session, page: str) -> list[dict]:
    response = session.get(
        API_URL,
        params={"action": "parse", "page": page, "prop": "sections", "format": "json"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json().get("parse", {}).get("sections", [])


def fetch_section_html(session: requests.Session, page: str, section_index: str) -> str:
    response = session.get(
        API_URL,
        params={
            "action": "parse",
            "page": page,
            "prop": "text",
            "section": section_index,
            "format": "json",
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json().get("parse", {}).get("text", {}).get("*", "")


def extract_paragraph_text(html_fragment: str) -> list[str]:
    paragraphs = re.findall(r"<p>(.*?)</p>", html_fragment, flags=re.IGNORECASE | re.DOTALL)
    lines: list[str] = []
    for paragraph in paragraphs:
        text = re.sub(r"<[^>]+>", "", paragraph)
        text = html.unescape(text).strip()
        if text:
            lines.append(text)
    return lines


def collect_transcript(page: str) -> list[str]:
    session = make_session()
    sections = fetch_sections(session, page)
    act_indexes = [s["index"] for s in sections if s.get("line", "").strip().lower().startswith("act ")]
    section_indexes = act_indexes or [str(s["index"]) for s in sections]

    lines: list[str] = []
    for index in section_indexes:
        html_fragment = fetch_section_html(session, page, index)
        lines.extend(extract_paragraph_text(html_fragment))
    return lines
