#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["youtube-transcript-api>=1.0"]
# ///
"""Fetch a YouTube transcript locally, zero setup required.

Usage:
    uv run fetch_transcript.py <url-or-video-id> [--out DIR] [--lang en,fr]

Writes two files into --out (default ./transcripts/):
    youtube-<id>.txt             plain text, one line
    youtube-<id>.timestamped.md  [HH:MM:SS] per caption segment

Only downloads public captions. Nothing is uploaded anywhere.
"""
import argparse
import re
import sys
from pathlib import Path

from youtube_transcript_api import YouTubeTranscriptApi

ID_PATTERNS = [
    r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})",
    r"^([A-Za-z0-9_-]{11})$",
]


def video_id_of(source: str) -> str:
    for pattern in ID_PATTERNS:
        match = re.search(pattern, source)
        if match:
            return match.group(1)
    sys.exit(f"error: could not extract a video ID from {source!r}")


def timestamp(seconds: float) -> str:
    s = int(seconds)
    return f"[{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}]"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="YouTube URL or bare 11-char video ID")
    parser.add_argument("--out", default="transcripts", help="output directory")
    parser.add_argument("--lang", default="en,fr", help="preferred languages, comma-separated")
    args = parser.parse_args()

    vid = video_id_of(args.source)
    url = f"https://www.youtube.com/watch?v={vid}"
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    listing = YouTubeTranscriptApi().list(vid)
    try:
        transcript = listing.find_transcript([lang.strip() for lang in args.lang.split(",")])
    except Exception:
        transcript = next(iter(listing))
    segments = transcript.fetch()

    header = [
        "# YouTube transcript",
        f"url: {url}",
        f"video_id: {vid}",
        f"language: {transcript.language_code}",
        f"segments: {len(segments)}",
        "",
    ]
    body = [f"{timestamp(seg.start)} {seg.text}" for seg in segments]
    (out_dir / f"youtube-{vid}.timestamped.md").write_text("\n".join(header + body) + "\n")

    plain = " ".join(seg.text.replace("\n", " ") for seg in segments)
    (out_dir / f"youtube-{vid}.txt").write_text(plain + "\n")

    print(f"wrote {out_dir}/youtube-{vid}.txt ({len(plain)} chars, lang={transcript.language_code})")
    print(f"wrote {out_dir}/youtube-{vid}.timestamped.md ({len(segments)} segments)")


if __name__ == "__main__":
    main()
