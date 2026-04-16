import csv
import re
from pathlib import Path

from collectAllPages import collect_all_episode_pages
from collectScript import collect_transcript

OUTPUT_DIR = Path("data")
BRACKET_TEXT = re.compile(r"\[[^\]]*\]")
MULTI_SPACE = re.compile(r"\s+")


def parse_dialogue_line(line: str) -> tuple[str, str] | None:
    cleaned = BRACKET_TEXT.sub("", line)
    cleaned = MULTI_SPACE.sub(" ", cleaned).strip()
    if ":" not in cleaned:
        return None
    character, sentence = cleaned.split(":", 1)
    character = character.strip()
    sentence = sentence.strip()
    if not character or not sentence:
        return None
    return character, sentence


def write_episode_csv(season: int, episode: int, rows: list[tuple[int, int, str, str]]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"transcript-s{season}e{episode:02d}.csv"
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["season", "episode", "character", "sentence"])
        writer.writerows(rows)
    return path


def main() -> None:
    for season, episode, page, _ in collect_all_episode_pages():
        lines = collect_transcript(page)
        rows: list[tuple[int, int, str, str]] = []
        for line in lines:
            parsed = parse_dialogue_line(line)
            if parsed:
                character, sentence = parsed
                rows.append((season, episode, character, sentence))
        out_path = write_episode_csv(season, episode, rows)
        print(f"S{season}E{episode:02d} | {page} | rows={len(rows)} | out={out_path}")


if __name__ == "__main__":
    main()
