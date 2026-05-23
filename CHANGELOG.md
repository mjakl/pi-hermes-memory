# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.11] - 2026-05-22

### Changed

- Removed obsolete legacy prompt-injection compatibility paths. Runtime prompt context is now controlled by `memoryPolicyStyle` (`full`, `compact`, `custom`, or `none`) instead of `memoryMode` / `legacy-inject`.
- Removed the old `autoConsolidate` config alias; use `memoryOverflowStrategy` instead.
- Removed the alternate session-search mode and simplified the search surface around SQLite FTS.
- Simplified `/memory-skills` around list/view/move/delete flows and current Pi resource discovery.
- Hardened child Pi learning prompts so background review, correction save, consolidation, and flush jobs stay focused on memory actions.

### Fixed

- Fenced `memory_search` output as stored context, not instructions.
- Fixed Pi session parsing/indexing for current tool-result and bash-execution message shapes.
- Removed an unused failure prompt helper.

### Tests

- 398 automated tests across 27 test files.

## [0.7.10] - 2026-05-18

### Added

- `/memory-skills` can show runtime-discovered external Pi skills alongside pi-hermes-memory managed skills.
- README upgrade and migration notes for the current skill and memory layout.

### Fixed

- Skill frontmatter is emitted with YAML-safe quoting.

## [0.7.8] - 2026-05-16

### Added

- Interactive `/memory-skills` manager for viewing, moving, and deleting managed skills.

### Fixed

- Session shutdown indexing uses Pi's `SessionManager` API to locate the current session file.

## [0.7.7] - 2026-05-16

### Added

- Skill storage is routed by explicit scope:
  - Global: `~/.pi/agent/pi-hermes-memory/skills/<slug>/SKILL.md`
  - Project: `~/.pi/agent/projects-memory/<project>/skills/<slug>/SKILL.md`
- Global skill duplicate/similarity guards.
- Project skills are exposed through Pi `resources_discover`.

### Changed

- Migrated package imports to the current `@earendil-works/*` packages.

## [0.7.6] - 2026-05-15

### Added

- Configurable `consolidationTimeoutMs` for auto-consolidation.

### Fixed

- FIFO-evicted Markdown memory entries are removed from the SQLite mirror when possible.

## [0.7.5] - 2026-05-14

### Added

- `memoryOverflowStrategy` config with `auto-consolidate`, `reject`, and `fifo-evict` options.

## [0.7.4] - 2026-05-13

### Added

- Configurable correction detection patterns: strong, weak, and negative correction patterns plus weak-pattern directive words can be overridden with optional config fields. Omitted fields preserve defaults.

### Tests

- Config loading tests use injected temporary config paths instead of writing to `~/.pi/agent/hermes-memory-config.json`.

## [0.7.3] - 2026-05-12

### Added

- Configurable memory policy prompt: `memoryPolicyStyle` (`full`, `compact`, `custom`, or `none`) and `memoryPolicyCustomText`. The default `full` style preserves detailed policy guidance without injecting full Markdown memories.

### Fixed

- Bun runtime SQLite compatibility: runtime fallback from `better-sqlite3` to `bun:sqlite` when needed.
- Safer DB initialization across runtimes: WAL mode and foreign keys are enabled consistently.

## [0.7.2] - 2026-05-11

### Fixed

- Startup sync indexes project Markdown memories from `~/.pi/agent/projects-memory/<project>/MEMORY.md` into SQLite search.
- Project-scoped correction/failure memories are synced with project scope.
- `target="project"` writes route explicitly to the project `MEMORY.md` target before SQLite mirroring.

## [0.7.1] - 2026-05-11

### Fixed

- Legacy project memories from the old `~/.pi/agent/<project>/MEMORY.md` layout are copied or merged into `~/.pi/agent/projects-memory/<project>/MEMORY.md` on startup.
- `/memory-sync-markdown` scans both the current project-memory layout and legacy project folders.

## [0.7.0] - 2026-05-11

### Added

- Policy-only memory prompt by default: the system prompt appends a `<memory-policy>` that tells the agent when to use `memory_search` and `session_search` instead of dumping full Markdown memory.
- Prompt context builder and `/memory-preview-context` command.
- Documentation and diagrams for the policy-only retrieval model.

### Changed

- Memory is handled as searchable context, not always-on authority.
- Markdown remains the human-readable source of truth/export format; SQLite is the runtime search path.
- Content scanner warnings mention search and prompt context instead of implying all memory is always injected.

## [0.6.6] - 2026-05-05

### Fixed

- Legacy SQLite upgrade error where older `sessions.db` files lacked failure-memory columns such as `category`.
- Database initialization now migrates missing `memories` columns idempotently before creating indexes.

## [0.6.5] - 2026-05-03

### Fixed

- Background review no longer blocks interactive chat; review subprocesses are best-effort and fire-and-forget.
- Auto-review subprocess failures are silently ignored so transient child-process issues do not interrupt the user.

## [0.4.0] - 2026-05-01

### Added

- SQLite FTS5 session search and memory search.
- `session_search` and `memory_search` tools.
- `/memory-index-sessions` command.
- `/memory-sync-markdown` command for idempotent Markdown-to-SQLite backfill.
- Core memory limits increased to 5,000 characters.

## [0.3.0] - 2026-04-29

### Added

- `/memory-interview` onboarding command.
- Context fencing for stored memory content.
- Entry timestamps for memory aging and consolidation.
- Project-scoped memory polish and `/memory-switch-project` listing command.

## [0.2.0] - 2026-04-26

### Added

- Procedural `skill` tool for Pi-native `SKILL.md` files.
- Auto-consolidation when Markdown memory reaches capacity.
- Correction detection with immediate save.
- Tool-call-aware background review trigger.
- `/memory-skills` and `/memory-consolidate` commands.

### Changed

- `MemoryStore.add()` became async to support consolidation.
- Background review counts tool calls as well as user turns.

## [0.1.0] - 2026-04-20

### Added

- Persistent memory via `MEMORY.md` and `USER.md` with the `§` delimiter.
- Real-time `memory` tool for add/replace/remove.
- Content scanning for prompt injection, role hijacking, secret exfiltration, and invisible unicode.
- Background learning loop and session-end flush.
- `/memory-insights` command.
- Atomic writes using temp file plus rename.
