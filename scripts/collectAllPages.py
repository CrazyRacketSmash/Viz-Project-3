import re
import sys
from urllib.parse import unquote

from collectScript import fetch_section_html, fetch_sections, make_session

BASE_URL = "https://lostpedia.fandom.com"
PORTAL_PAGE = "Portal:Transcripts"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def extract_transcript_titles(html_fragment: str) -> list[str]:
    hrefs = re.findall(r'href="([^"]+)"', html_fragment, flags=re.IGNORECASE)
    titles: list[str] = []
    seen = set()
    for href in hrefs:
        if not href.startswith("/wiki/") or "_transcript" not in href:
            continue
        title = href.split("/wiki/", 1)[1].split("#", 1)[0].split("?", 1)[0]
        title = unquote(title)
        if title and title not in seen:
            seen.add(title)
            titles.append(title)
    return titles


def find_season_sections(sections: list[dict]) -> list[tuple[int, str]]:
    parent = None
    for section in sections:
        if section.get("line", "").strip().lower() == "episode transcripts":
            parent = section
            break

    if not parent:
        return []

    parent_level = int(parent.get("level", "2"))
    parent_index = int(parent.get("index", "1"))

    season_sections: list[tuple[int, str]] = []
    in_parent_scope = False
    for section in sections:
        current_index = int(section.get("index", "0"))
        current_level = int(section.get("level", "2"))
        line = section.get("line", "").strip()

        if current_index == parent_index:
            in_parent_scope = True
            continue
        if not in_parent_scope:
            continue
        if current_level <= parent_level:
            break

        match = re.fullmatch(r"Season ([1-6])", line)
        if current_level == parent_level + 1 and match:
            season_sections.append((int(match.group(1)), str(section.get("index"))))

    return season_sections


def collect_all_episode_pages() -> list[tuple[int, int, str, str]]:
    session = make_session()
    sections = fetch_sections(session, PORTAL_PAGE)
    season_sections = find_season_sections(sections)

    pages: list[tuple[int, int, str, str]] = []
    for season, section_index in season_sections:
        html_fragment = fetch_section_html(session, PORTAL_PAGE, section_index)
        titles = extract_transcript_titles(html_fragment)
        for episode, title in enumerate(titles, start=1):
            pages.append((season, episode, title, f"{BASE_URL}/wiki/{title}"))
    return pages


def main() -> None:
    for _, _, _, url in collect_all_episode_pages():
        print(url)


if __name__ == "__main__":
    main()
