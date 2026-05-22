/**
 * Shared TypeScript types for the Hermes Memory extension.
 */


export type MemoryOverflowStrategy = "auto-consolidate" | "reject" | "fifo-evict";

export interface MemoryConfig {
  /** Policy prompt style for the system prompt. Default: full */
  memoryPolicyStyle?: "full" | "compact" | "custom" | "none";
  /** Custom policy prompt text used when memoryPolicyStyle is custom */
  memoryPolicyCustomText?: string;
  /** Max chars for MEMORY.md (agent notes). Default: 5000 */
  memoryCharLimit: number;
  /** Max chars for USER.md (user profile). Default: 5000 */
  userCharLimit: number;
  /** Max chars for project-level MEMORY.md. Default: 5000 */
  projectCharLimit: number;
  /** Turns between background auto-reviews. Default: 10 */
  nudgeInterval: number;
  /** Recent conversation messages included in background review. 0 = all. Default: 0 */
  reviewRecentMessages?: number;
  /** Enable background learning loop. Default: true */
  reviewEnabled: boolean;
  /** Flush memories before compaction. Default: true */
  flushOnCompact: boolean;
  /** Flush memories on session shutdown. Default: true */
  flushOnShutdown: boolean;
  /** Minimum user turns before flush triggers. Default: 6 */
  flushMinTurns: number;
  /** Recent conversation messages included in session flush. 0 = all. Default: 0 */
  flushRecentMessages?: number;
  /** Override extension storage directory. Default: ~/.pi/agent/pi-hermes-memory */
  memoryDir?: string;
  /** Directory for project-scoped memory (relative to ~/.pi/agent). Default: "projects-memory" */
  projectsMemoryDir?: string;
  /** Strategy when memory is full. Default: auto-consolidate */
  memoryOverflowStrategy?: MemoryOverflowStrategy;
  /** Legacy alias for memoryOverflowStrategy. Default: true */
  autoConsolidate: boolean;
  /** Detect user corrections and trigger immediate memory save. Default: true */
  correctionDetection: boolean;
  /** Override strong correction regex sources. Missing = defaults; [] = none. */
  correctionStrongPatterns?: string[];
  /** Override weak correction regex sources. Missing = defaults; [] = none. */
  correctionWeakPatterns?: string[];
  /** Override negative correction regex sources. Missing = defaults; [] = none. */
  correctionNegativePatterns?: string[];
  /** Override directive words used after weak correction patterns. Missing = defaults; [] = none. */
  correctionDirectiveWords?: string[];
  /** Inject recent failure memories into the system prompt. Default: true */
  failureInjectionEnabled: boolean;
  /** Maximum age in days for injected failure memories. Default: 7 */
  failureInjectionMaxAgeDays: number;
  /** Maximum number of failure memories to inject. Default: 5 */
  failureInjectionMaxEntries: number;
  /** Tool calls before triggering background review (in addition to turn count). Default: 15 */
  nudgeToolCalls: number;
  /** Maximum time in milliseconds for auto-consolidation to complete. Default: 60000 */
  consolidationTimeoutMs: number;
}

export type MemoryCategory =
  | "failure"
  | "correction"
  | "insight"
  | "preference"
  | "convention"
  | "tool-quirk";

export interface MemoryResult {
  success: boolean;
  error?: string;
  message?: string;
  warning?: string;
  warnings?: string[];
  target?: "memory" | "user" | "failure" | "project";
  entries?: string[];
  usage?: string;
  entry_count?: number;
  evicted_entries?: string[];
  evicted_count?: number;
  matches?: string[];
}

export interface MemorySnapshot {
  memory: string;
  user: string;
}

export interface ConsolidationResult {
  /** Whether consolidation succeeded */
  consolidated: boolean;
  /** Error message if consolidation failed */
  error?: string;
}

export type SkillScope = "global" | "project";

export interface SkillIndex {
  /** Stable id for read/update/delete operations */
  skillId: string;
  /** Whether the skill is global or project-scoped */
  scope: SkillScope;
  /** File name on disk (usually SKILL.md) */
  fileName: string;
  /** Absolute path to the skill file */
  path: string;
  /** Active project name for project-scoped skills */
  projectName?: string;
  /** Pi skill slug stored in frontmatter and folder name */
  name: string;
  /** Optional human-friendly title preserved for UI output */
  displayName?: string;
  /** Short description shown in skill listings */
  description: string;
  /** ISO date created */
  created: string;
  /** ISO date last updated */
  updated: string;
}

export interface SkillDocument extends SkillIndex {
  /** Full markdown body (after frontmatter) */
  body: string;
  /** Version number */
  version: number;
}

export interface SkillResult {
  success: boolean;
  error?: string;
  message?: string;
  fileName?: string;
  skillId?: string;
  scope?: SkillScope;
  path?: string;
  conflictType?: "duplicate" | "similar" | "name-collision" | "scope-conflict";
  similarSkillIds?: string[];
  suggestedAction?: "patch" | "update" | "rename";
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function compactJson(value: unknown, maxLength = 300): string {
  try {
    const json = JSON.stringify(value ?? {});
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
  } catch {
    return "{}";
  }
}

function formatToolCall(block: Record<string, unknown>): string | null {
  if (block.type !== "toolCall") return null;
  const name = typeof block.name === "string" ? block.name : "unknown";
  const args = block.arguments && typeof block.arguments === "object"
    ? compactJson(block.arguments)
    : "{}";
  return `${name}(${args})`;
}

function extractContentText(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const record = block as Record<string, unknown>;

    if (record.type === "text" && typeof record.text === "string") {
      parts.push(record.text);
      continue;
    }

    const toolCall = formatToolCall(record);
    if (toolCall) parts.push(`[tool call: ${toolCall}]`);
  }
  return parts;
}

function getBashExecutionText(msg: Record<string, unknown>): string | null {
  // Respect Pi's hidden bash mode (`!!cmd`): those outputs are intentionally
  // excluded from model context and should not be learned or indexed here.
  if (msg.excludeFromContext === true) return null;

  const command = typeof msg.command === "string" ? msg.command.trim() : "";
  const output = typeof msg.output === "string" ? msg.output.trim() : "";
  const exitCode = typeof msg.exitCode === "number" ? `exit code: ${msg.exitCode}` : "";
  const truncated = msg.truncated === true ? "[output truncated]" : "";

  const parts = [
    command ? `$ ${command}` : "",
    output,
    exitCode,
    truncated,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Extract displayable text from a current Pi AgentMessage-like value.
 *
 * Supports current Pi v3 message roles, including toolResult and
 * bashExecution. Hidden bash executions (`excludeFromContext`) are skipped.
 * Returns the concatenated text, truncated to `maxLength` chars.
 */
export function getMessageText(msg: unknown, maxLength = 500): string | null {
  if (typeof msg !== "object" || msg === null) return null;
  const record = msg as Record<string, unknown>;
  const role = record.role;
  if (typeof role !== "string") return null;

  const text = role === "bashExecution"
    ? getBashExecutionText(record)
    : extractContentText(record.content).join("\n").trim();

  return text ? truncateText(text, maxLength) : null;
}

export function getMessageLabel(msg: unknown): string {
  if (typeof msg !== "object" || msg === null) return "[MESSAGE]";
  const record = msg as Record<string, unknown>;
  const role = record.role;

  switch (role) {
    case "user":
      return "[USER]";
    case "assistant":
      return "[ASSISTANT]";
    case "toolResult": {
      const toolName = typeof record.toolName === "string" ? `:${record.toolName}` : "";
      return `[TOOL_RESULT${toolName}]`;
    }
    case "bashExecution":
      return "[BASH]";
    case "custom":
      return "[CUSTOM]";
    case "branchSummary":
      return "[BRANCH_SUMMARY]";
    case "compactionSummary":
      return "[COMPACTION_SUMMARY]";
    default:
      return "[MESSAGE]";
  }
}
