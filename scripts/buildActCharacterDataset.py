import csv
import json
import re
from pathlib import Path

from collectAllPages import collect_all_episode_pages
from collectScript import fetch_section_html, fetch_sections, make_session

OUTPUT_DIR = Path("data")
OUTPUT_FILE = OUTPUT_DIR / "act_character_dataset.csv"
BRACKET_TEXT = re.compile(r"\[[^\]]*\]")
MULTI_SPACE = re.compile(r"\s+")


def find_act_sections(sections: list[dict]) -> list[tuple[int, str]]:
    acts: list[tuple[int, str]] = []
    for section in sections:
        line = section.get("line", "").strip()
        match = re.fullmatch(r"Act\s+(\d+)", line, flags=re.IGNORECASE)
        if match:
            acts.append((int(match.group(1)), str(section["index"])))
    return acts


def extract_paragraph_text(html_fragment: str) -> list[str]:
    paragraphs = re.findall(r"<p>(.*?)</p>", html_fragment, flags=re.IGNORECASE | re.DOTALL)
    lines: list[str] = []
    for paragraph in paragraphs:
        text = re.sub(r"<[^>]+>", "", paragraph)
        text = BRACKET_TEXT.sub("", text)
        text = MULTI_SPACE.sub(" ", text).strip()
        if text:
            lines.append(text)
    return lines


def parse_character_name(line: str) -> str | None:
    if ":" not in line:
        return None

    raw_name = line.split(":", 1)[0].strip()
    if not raw_name or len(raw_name) > 40:
        return None

    if not re.search(r"[A-Za-z]", raw_name):
        return None

    raw_name = re.sub(r"\s+", " ", raw_name)
    return raw_name


def collect_characters_for_act(session, page: str, act_section_index: str) -> list[str]:
    html_fragment = fetch_section_html(session, page, act_section_index)
    lines = extract_paragraph_text(html_fragment)

    seen = set()
    characters: list[str] = []
    for line in lines:
        character = parse_character_name(line)
        if character and character not in seen:
            seen.add(character)
            characters.append(character)
    return characters


def build_dataset_rows() -> list[tuple[int, int, int, str]]:
    session = make_session()
    rows: list[tuple[int, int, int, str]] = []
    episodes = collect_all_episode_pages()
    total_episodes = len(episodes)

    for episode_index, (season, episode, page, _) in enumerate(episodes, start=1):
        sections = fetch_sections(session, page)
        acts = find_act_sections(sections)
        episode_rows = 0

        for act_number, act_index in acts:
            characters = collect_characters_for_act(session, page, act_index)
            rows.append((season, episode, act_number, json.dumps(characters)))
            episode_rows += 1

        print(
            f"done {episode_index}/{total_episodes} | "
            f"S{season}E{episode:02d} | {page} | acts={episode_rows}"
        )

    return rows


def write_dataset(rows: list[tuple[int, int, int, str]]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["season", "episode", "act_number", "characters_in_act"])
        writer.writerows(rows)
    return OUTPUT_FILE


def main() -> None:
    rows = build_dataset_rows()
    out_path = write_dataset(rows)
    print(f"rows={len(rows)} | out={out_path}")


if __name__ == "__main__":
    main()
