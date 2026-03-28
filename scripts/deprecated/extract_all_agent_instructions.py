#!/usr/bin/env python3
"""
Extract all user instructions (chats) from Cursor agent transcripts
across all projects under ~/.cursor/projects.

Output: agent-instructions-extract.txt (user messages only; no subagent transcripts).
"""

import json
import os
import re
from pathlib import Path

PROJECTS_ROOT = Path(os.environ.get("HOME", "/home/dk")) / ".cursor" / "projects"
OUT_PATH = Path(__file__).resolve().parent.parent / "agent-instructions-extract.txt"


def project_label(project_path: Path) -> str:
    """Human-readable project name from path."""
    name = project_path.name
    # e.g. home-dk-Documents-git-nginx-manager-cursor -> nginx-manager-cursor
    if name.startswith("home-dk-"):
        name = name.replace("home-dk-", "", 1)
    if "Documents-git-" in name:
        name = name.replace("Documents-git-", "", 1)
    if "-code-workspace" in name:
        name = name.replace("-code-workspace", "")
    return name


def extract_from_txt(content: str) -> list[str]:
    """Extract user query blocks from .txt transcript (user: / <user_query>...</user_query>)."""
    return [m.strip() for m in re.findall(r"<user_query>\s*(.*?)\s*</user_query>", content, re.DOTALL) if m.strip()]


def extract_from_jsonl(path: Path) -> list[str]:
    """Extract user messages from JSONL transcript. Only role=user; skip subagents."""
    messages = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if obj.get("role") != "user":
                        continue
                    content = obj.get("message") or {}
                    for part in content.get("content") or []:
                        if part.get("type") == "text":
                            text = (part.get("text") or "").strip()
                            if not text:
                                continue
                            # Unwrap <user_query> if present
                            q = re.search(r"<user_query>\s*(.*?)\s*</user_query>", text, re.DOTALL)
                            if q:
                                text = q.group(1).strip()
                            if text:
                                messages.append(text)
                            break
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return messages


def collect_transcript_files(agent_transcripts_dir: Path) -> list[tuple[Path, str]]:
    """Return list of (file_path, kind) where kind is 'txt' or 'jsonl'.
    For JSONL we only include parent transcript: <uuid>/<uuid>.jsonl, not subagents.
    """
    files = []
    # .txt in root
    for f in agent_transcripts_dir.iterdir():
        if f.is_file() and f.suffix == ".txt":
            files.append((f, "txt"))
    # UUID dirs: parent transcript is <uuid>.jsonl inside dir with same-named dir
    for d in agent_transcripts_dir.iterdir():
        if not d.is_dir() or d.name == "subagents":
            continue
        uuid = d.name
        jsonl_file = d / f"{uuid}.jsonl"
        if jsonl_file.is_file():
            files.append((jsonl_file, "jsonl"))
    return files


def main():
    out_lines = []
    total_messages = 0

    if not PROJECTS_ROOT.is_dir():
        print(f"Projects root not found: {PROJECTS_ROOT}")
        return

    for project_dir in sorted(PROJECTS_ROOT.iterdir()):
        if not project_dir.is_dir():
            continue
        agent_dir = project_dir / "agent-transcripts"
        if not agent_dir.is_dir():
            continue

        label = project_label(project_dir)
        transcript_files = collect_transcript_files(agent_dir)
        if not transcript_files:
            continue

        out_lines.append(f"\n{'='*80}")
        out_lines.append(f"PROJECT: {label}")
        out_lines.append(f"PATH: {project_dir}")
        out_lines.append("="*80 + "\n")

        for file_path, kind in sorted(transcript_files, key=lambda x: x[0].name):
            if kind == "txt":
                try:
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                messages = extract_from_txt(content)
            else:
                messages = extract_from_jsonl(file_path)

            if not messages:
                continue

            transcript_id = file_path.stem
            out_lines.append(f"\n--- Transcript: {file_path.name} ---\n")
            for i, msg in enumerate(messages, 1):
                total_messages += 1
                out_lines.append(f"--- User message #{i} ---\n{msg}\n")

    result = "\n".join(out_lines).lstrip()
    OUT_PATH.write_text(result, encoding="utf-8")
    print(f"Extracted {total_messages} user messages from all projects.")
    print(f"Written to: {OUT_PATH}")


if __name__ == "__main__":
    main()
