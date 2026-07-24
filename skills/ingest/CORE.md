# ingest — shared core (platform-neutral contract)

This file is the single source of truth for what the `ingest` skill does.
The `claude/` and `codex/` folders are thin adapters around this contract;
`tools/check_drift.py` (repo root) fails if an adapter was not re-stamped
after this file changed.

## Purpose

Turn a source — a YouTube URL or a local transcript/text file — into a saved
key-points extraction the reader (human or agent) can use instead of consuming
the source end to end. Local-only: nothing is uploaded anywhere.

## Inputs

- A YouTube URL (any form: `watch?v=`, `youtu.be/`, `shorts/`) or bare video ID
- OR a path to a local text/transcript/markdown file

## Steps

1. **Resolve the source.**
   - YouTube URL → fetch the transcript with `scripts/fetch_transcript.py`
     (zero-setup `uv run` script). It writes two files into `./transcripts/`:
     `youtube-<id>.txt` (plain text) and `youtube-<id>.timestamped.md`.
   - Local file → read it directly.
2. **Extract key points:**
   - **Core thesis** in 2–4 sentences.
   - **Key points**: the main arguments/framework as a compact structured list.
   - Preserve concrete numbers, demos, and decision rules. Drop filler,
     repetition, and channel/self promotion.
3. **Assess applicability (optional but encouraged)** when the content touches
   the runner's tooling or workflow: inspect the *actual current state* of the
   runner's setup before claiming a gap, and say where they already stand vs.
   what the source recommends. Recommendations must be proportionate — flag
   what is NOT worth doing too. Skip this section entirely if the content has
   no operational relevance.
4. **Save** the extraction next to the source file, named
   `<source-basename>_extracted_key_point.md`, with a small header.
5. **Reply** with a one-paragraph summary and the saved file path — do not
   paste the whole file back.

## Output file skeleton

```markdown
# Extracted Key Points — <source-basename>

Source: <url or path>
Topic: <one line>
Extracted: <YYYY-MM-DD>

## Core thesis
...

## Key points
...

## Applicability to my setup (optional)
...
```

## Guarantees

- Nothing leaves the machine: transcript fetch is the only network call, and
  it only downloads public captions.
- The extraction is denser than the source: if a section adds no decision,
  number, or reusable idea, it doesn't survive.
- Every extraction traces to its source via the header.
