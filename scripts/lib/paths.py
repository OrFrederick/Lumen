"""Canonical filesystem paths for the Lumen pipeline."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT: Path = Path(__file__).resolve().parents[2]

DATA_DIR: Path = REPO_ROOT / "data"
DB_PATH: Path = DATA_DIR / "library.db"
TRANSCRIPTS_DIR: Path = DATA_DIR / "transcripts"
EXTRACTED_DIR: Path = DATA_DIR / "extracted"
ENRICHED_DIR: Path = DATA_DIR / "enriched"

PROMPTS_DIR: Path = REPO_ROOT / "prompts"
EXTRACT_PROMPT: Path = PROMPTS_DIR / "extract.md"
EXTRACT_EXAMPLES: Path = PROMPTS_DIR / "extract_examples.md"


def transcript_path(video_id: str) -> Path:
    return TRANSCRIPTS_DIR / f"{video_id}.json"


def extracted_path(video_id: str) -> Path:
    return EXTRACTED_DIR / f"{video_id}.json"


def enriched_path(video_id: str) -> Path:
    return ENRICHED_DIR / f"{video_id}.json"


def ensure_data_dirs() -> None:
    for d in (DATA_DIR, TRANSCRIPTS_DIR, EXTRACTED_DIR, ENRICHED_DIR):
        d.mkdir(parents=True, exist_ok=True)
