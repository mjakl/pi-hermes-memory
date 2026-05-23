# Pi Hermes Memory Extension

## Project Overview

This is a Pi coding agent extension that provides persistent memory, session search, categorized failure/correction learning, and Pi-native procedural skills.

Current package version: **0.7.11**. The verified local suite currently has **398 tests across 27 test files**.

## Architecture

- **Language**: TypeScript loaded directly by Pi extension runtime
- **Runtime**: Pi extension API (`@earendil-works/pi-coding-agent`)
- **Storage**:
  - Global markdown memory: `~/.pi/agent/pi-hermes-memory/MEMORY.md`, `USER.md`, `failures.md`
  - SQLite search DB: `~/.pi/agent/pi-hermes-memory/sessions.db`
  - Project memory: `~/.pi/agent/projects-memory/<project>/MEMORY.md`
  - Skills: `~/.pi/agent/pi-hermes-memory/skills/` and project-scoped `skills/` folders
- **Entry point**: `src/index.ts` — registers tools, event handlers, commands, and resource discovery

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Extension entry point — wires stores, tools, handlers, commands, and session indexing |
| `src/types.ts` | Shared TypeScript interfaces and `getMessageText()` helper |
| `src/constants.ts` | Prompts, defaults, delimiter, correction patterns, memory policy |
| `src/config.ts` | User config loading and normalization |
| `src/paths.ts` | Shared Pi agent path helpers |
| `src/project.ts` | Project and project-skill path detection |
| `src/prompt-context.ts` | Policy-only prompt context builder |
| `src/store/memory-store.ts` | Markdown-backed memory CRUD, metadata, limits, consolidation, FIFO eviction |
| `src/store/sqlite-memory-store.ts` | SQLite-backed searchable memory mirror/store |
| `src/store/db.ts` / `src/store/schema.ts` | SQLite database setup and schema |
| `src/store/session-parser.ts` / `src/store/session-indexer.ts` / `src/store/session-search.ts` | Session JSONL parsing, indexing, and search |
| `src/store/skill-store.ts` | Pi-native skill CRUD, scope routing, duplicate guards, moves |
| `src/tools/memory-tool.ts` | LLM `memory` tool |
| `src/tools/memory-search-tool.ts` | LLM `memory_search` tool |
| `src/tools/session-search-tool.ts` | LLM `session_search` tool |
| `src/tools/skill-tool.ts` | LLM `skill` tool |
| `src/handlers/learn-memory.ts` | `/learn-memory-tool` in-app guide |

## Design Decisions

1. **Policy-only memory by default** — the system prompt receives a memory policy, not full markdown memory dumps.
2. **Search on demand** — durable memory and session history are available through `memory_search` and `session_search`.
3. **Markdown source of truth + SQLite mirror** — successful markdown writes are mirrored into SQLite for search; failed markdown writes do not silently become SQLite-only memories.
4. **Project-scoped memory** — project facts live under `~/.pi/agent/projects-memory/<project>/` and are searchable by project.
5. **Atomic writes** — temp files next to their target plus `fs.rename()` for crash safety and cross-device safety.
6. **Content scanning** — memory and skill writes are scanned before persistence.
7. **Skills are deliberate** — the main agent creates/updates skills through the `skill` tool; background review does not auto-create skills.

## Development

```bash
# Type check
npm run check

# Run the full test suite
npm test

# Test locally in Pi
pi -e ./src/index.ts
```

## Installation (for users)

```bash
pi install npm:pi-hermes-memory
```

Git install remains available for local testing or unreleased commits:

```bash
pi install git:github:chandra447/pi-hermes-memory
```

## Documentation

- `README.md` is the authoritative user-facing documentation.
- `CHANGELOG.md` tracks release changes.
- `docs/<version>/` files are historical implementation plans/task notes and may describe the state at the time they were written.
