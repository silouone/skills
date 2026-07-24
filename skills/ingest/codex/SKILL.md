---
name: ingest
description: Turn a YouTube URL or local transcript/text file into a saved key-points extraction — core thesis, structured key points, and an applicability assessment grounded in the user's actual setup. Use when the user asks to "ingest" a video/article/file, wants key points extracted from a transcript, or wants to absorb a recommended video without watching it. Local-only; nothing is uploaded.
---
<!-- core-hash: 5fd54894e4d7 -->

# ingest — source → saved key points (Codex adapter)

Follow the contract below exactly. This is pre-reading distillation, not a
database pipeline: the only outputs are local files.

## Steps

1. **Resolve the source.**
   - YouTube URL or bare video ID → fetch the transcript locally:
     ```
     uv run <this-skill-dir>/scripts/fetch_transcript.py "<url>" --out transcripts
     ```
     This writes `transcripts/youtube-<id>.txt` (plain) and
     `transcripts/youtube-<id>.timestamped.md`. It only downloads public
     captions; if none exist, tell the user and stop. If `uv` is missing,
     fall back to `python3 -m pip install --user youtube-transcript-api`
     then run the script with `python3`.
   - Local file path → read it directly. If the user gave a topic instead of a
     path, look for a matching file under `./transcripts/` before asking.
2. **Extract key points:**
   - **Core thesis** in 2–4 sentences.
   - **Key points**: main arguments/framework as a compact structured list.
   - Preserve concrete numbers, demos, and decision rules — drop filler,
     repetition, and channel/self promotion.
3. **Assess applicability** when the content touches the user's tooling or
   workflow (their agent harness, hooks, skills, automations, projects):
   inspect the *actual current state* first — `~/.codex/config.toml`,
   `~/.codex/skills/`, `~/.codex/hooks/`, `AGENTS.md`, the current repo —
   before claiming a gap, and say where the user already stands vs. what the
   source recommends. Recommendations must be proportionate — flag what is
   NOT worth doing too. Skip this section entirely if the content has no
   operational relevance.
4. **Save** to the same directory as the source, named
   `<source-basename>_extracted_key_point.md`, with this header:

   ```markdown
   # Extracted Key Points — <source-basename>

   Source: <url or path>
   Topic: <one line>
   Extracted: <YYYY-MM-DD>

   ## Core thesis
   ## Key points
   ## Applicability to my setup (optional)
   ```

5. **Reply** with a one-paragraph summary and the saved file path — do not
   paste the whole file back.

## Guarantees

- Local-only: the transcript fetch is the sole network call.
- Denser than the source: a section that adds no decision, number, or
  reusable idea doesn't survive.
- Every extraction traces to its source via the header.
