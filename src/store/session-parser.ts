import fs from 'node:fs';
import path from 'node:path';

/**
 * Parsed session data from a JSONL file.
 */
export interface ParsedSession {
  id: string;
  project: string;
  cwd: string;
  startedAt: string;
  endedAt: string | null;
  messages: ParsedMessage[];
}

export type ParsedMessageRole =
  | 'user'
  | 'assistant'
  | 'toolResult'
  | 'bashExecution'
  | 'custom'
  | 'branchSummary'
  | 'compactionSummary';

/**
 * A single parsed message from a session.
 */
export interface ParsedMessage {
  id: string;
  role: ParsedMessageRole;
  content: string;
  timestamp: string;
  toolCalls?: string[];
}

/**
 * Raw JSONL entry types.
 */
interface JsonlEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  cwd?: string;
  message?: Record<string, unknown>;
  customType?: string;
  content?: unknown;
  summary?: unknown;
  [key: string]: unknown;
}

function compactJson(value: unknown, maxLength = 500): string {
  try {
    const json = JSON.stringify(value ?? {});
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
  } catch {
    return '{}';
  }
}

function extractTextBlocks(content: unknown): string[] {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text);
    }
  }
  return parts;
}

function formatToolCall(block: Record<string, unknown>): string | null {
  if (block.type !== 'toolCall') return null;
  const name = typeof block.name === 'string' ? block.name : 'unknown';
  const args = block.arguments && typeof block.arguments === 'object'
    ? compactJson(block.arguments)
    : '{}';
  return `${name}(${args})`;
}

/**
 * Extract tool call names from a current Pi assistant message content array.
 */
function extractToolCalls(content: unknown): string[] | undefined {
  if (!Array.isArray(content)) return undefined;

  const toolNames: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'toolCall' && typeof b.name === 'string') {
      toolNames.push(b.name);
    }
  }
  return toolNames.length > 0 ? toolNames : undefined;
}

function extractAssistantContent(content: unknown): string {
  const parts = extractTextBlocks(content);

  if (Array.isArray(content)) {
    const toolCalls = content
      .filter((block): block is Record<string, unknown> => !!block && typeof block === 'object')
      .map(formatToolCall)
      .filter((value): value is string => Boolean(value));

    if (toolCalls.length > 0) {
      parts.push(`Tool calls: ${toolCalls.join('; ')}`);
    }
  }

  return parts.join('\n').trim();
}

function extractToolResultContent(message: Record<string, unknown>): string {
  const text = extractTextBlocks(message.content).join('\n').trim();
  const toolName = typeof message.toolName === 'string' ? message.toolName : '';
  if (!text) return '';
  return toolName ? `${toolName} result:\n${text}` : text;
}

function extractBashExecutionContent(message: Record<string, unknown>): string {
  // Pi uses excludeFromContext for hidden `!!` shell commands. Do not import
  // those outputs into searchable memory/session context.
  if (message.excludeFromContext === true) return '';

  const command = typeof message.command === 'string' ? message.command.trim() : '';
  const output = typeof message.output === 'string' ? message.output.trim() : '';
  const exitCode = typeof message.exitCode === 'number' ? `Exit code: ${message.exitCode}` : '';
  const cancelled = message.cancelled === true ? 'Cancelled: true' : '';
  const truncated = message.truncated === true ? 'Output truncated: true' : '';
  const fullOutputPath = typeof message.fullOutputPath === 'string'
    ? `Full output: ${message.fullOutputPath}`
    : '';

  return [
    command ? `Command: ${command}` : '',
    output ? `Output:\n${output}` : '',
    exitCode,
    cancelled,
    truncated,
    fullOutputPath,
  ].filter(Boolean).join('\n').trim();
}

function parseMessageEntry(entry: JsonlEntry): ParsedMessage | null {
  if (!entry.message || !entry.id || !entry.timestamp) return null;

  const msg = entry.message;
  const role = msg.role;
  if (typeof role !== 'string') return null;

  let parsedRole: ParsedMessageRole | null = null;
  let content = '';
  let toolCalls: string[] | undefined;

  switch (role) {
    case 'user':
      parsedRole = 'user';
      content = extractTextBlocks(msg.content).join('\n').trim();
      break;
    case 'assistant':
      parsedRole = 'assistant';
      content = extractAssistantContent(msg.content);
      toolCalls = extractToolCalls(msg.content);
      break;
    case 'toolResult':
      parsedRole = 'toolResult';
      content = extractToolResultContent(msg);
      if (typeof msg.toolName === 'string') toolCalls = [msg.toolName];
      break;
    case 'bashExecution':
      parsedRole = 'bashExecution';
      content = extractBashExecutionContent(msg);
      if (content) toolCalls = ['bash'];
      break;
    case 'custom':
      parsedRole = 'custom';
      content = extractTextBlocks(msg.content).join('\n').trim();
      break;
    case 'branchSummary':
      parsedRole = 'branchSummary';
      content = typeof msg.summary === 'string'
        ? msg.summary.trim()
        : extractTextBlocks(msg.content).join('\n').trim();
      break;
    case 'compactionSummary':
      parsedRole = 'compactionSummary';
      content = typeof msg.summary === 'string'
        ? msg.summary.trim()
        : extractTextBlocks(msg.content).join('\n').trim();
      break;
  }

  if (!parsedRole || !content) return null;

  return {
    id: entry.id,
    role: parsedRole,
    content,
    timestamp: entry.timestamp,
    toolCalls,
  };
}

function parseSpecialEntry(entry: JsonlEntry): ParsedMessage | null {
  if (!entry.id || !entry.timestamp) return null;

  if (entry.type === 'custom_message') {
    const content = extractTextBlocks(entry.content).join('\n').trim();
    return content ? { id: entry.id, role: 'custom', content, timestamp: entry.timestamp } : null;
  }

  if (entry.type === 'compaction' && typeof entry.summary === 'string') {
    const content = entry.summary.trim();
    return content ? { id: entry.id, role: 'compactionSummary', content, timestamp: entry.timestamp } : null;
  }

  if (entry.type === 'branch_summary' && typeof entry.summary === 'string') {
    const content = entry.summary.trim();
    return content ? { id: entry.id, role: 'branchSummary', content, timestamp: entry.timestamp } : null;
  }

  return null;
}

/**
 * Parse a Pi session JSONL file.
 *
 * @param filePath — Path to the .jsonl file
 * @returns Parsed session data, or null if the file is invalid
 */
export function parseSessionFile(filePath: string): ParsedSession | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return null;

  let sessionId: string | null = null;
  let sessionCwd: string | null = null;
  let sessionTimestamp: string | null = null;
  const messages: ParsedMessage[] = [];

  for (const line of lines) {
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // Skip malformed lines
    }

    switch (entry.type) {
      case 'session':
        sessionId = typeof entry.id === 'string' ? entry.id : null;
        sessionCwd = typeof entry.cwd === 'string' ? entry.cwd : null;
        sessionTimestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null;
        break;

      case 'message': {
        const parsed = parseMessageEntry(entry);
        if (parsed) messages.push(parsed);
        break;
      }

      case 'custom_message':
      case 'compaction':
      case 'branch_summary': {
        const parsed = parseSpecialEntry(entry);
        if (parsed) messages.push(parsed);
        break;
      }
      // Skip model_change, thinking_level_change, custom state, labels, etc.
    }
  }

  if (!sessionId || !sessionCwd || !sessionTimestamp) return null;

  return {
    id: sessionId,
    project: path.basename(sessionCwd) || sessionCwd,
    cwd: sessionCwd,
    startedAt: sessionTimestamp,
    endedAt: null,
    messages,
  };
}

/**
 * Get all session JSONL files for a project (or all projects).
 *
 * @param sessionsDir — Path to ~/.pi/agent/sessions/
 * @param projectDir — Optional: specific project directory name (e.g., "--Users-...--")
 * @returns Array of file paths
 */
export function getSessionFiles(sessionsDir: string, projectDir?: string): string[] {
  if (projectDir) {
    const dir = `${sessionsDir}/${projectDir}`;
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => `${dir}/${f}`);
  }

  // All projects
  if (!fs.existsSync(sessionsDir)) return [];
  const files: string[] = [];
  for (const dir of fs.readdirSync(sessionsDir)) {
    const dirPath = `${sessionsDir}/${dir}`;
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (f.endsWith('.jsonl')) {
        files.push(`${dirPath}/${f}`);
      }
    }
  }
  return files;
}

/**
 * Decode a project directory name to a human-readable project name.
 * "--Users-chandrateja-Documents-pi-hermes-memory--" → "pi-hermes-memory"
 */
export function decodeProjectDir(dirName: string): string {
  // Remove leading/trailing dashes
  const cleaned = dirName.replace(/^-+|-+$/g, '');
  // Split by dash and take the last segment (project name)
  const segments = cleaned.split('-');
  return segments[segments.length - 1] ?? cleaned;
}
