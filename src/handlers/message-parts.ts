import { getMessageLabel, getMessageText } from "../types.js";

const REVIEW_MESSAGE_MAX_CHARS = 2000;

export function applyRecentMessageLimit(parts: string[], recentMessages = 0): string[] {
  if (Number.isFinite(recentMessages) && recentMessages > 0) {
    return parts.slice(-recentMessages);
  }
  return parts;
}

function formatEntryPart(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;

  if (record.type === "message") {
    const msg = (record as { message?: unknown }).message;
    const text = getMessageText(msg, REVIEW_MESSAGE_MAX_CHARS);
    if (!text) return null;
    return `${getMessageLabel(msg)}: ${text}`;
  }

  if (record.type === "custom_message") {
    const pseudoMessage = { role: "custom", content: record.content };
    const text = getMessageText(pseudoMessage, REVIEW_MESSAGE_MAX_CHARS);
    return text ? `[CUSTOM]: ${text}` : null;
  }

  if (record.type === "compaction" && typeof record.summary === "string") {
    return `[COMPACTION_SUMMARY]: ${record.summary.slice(0, REVIEW_MESSAGE_MAX_CHARS)}`;
  }

  if (record.type === "branch_summary" && typeof record.summary === "string") {
    return `[BRANCH_SUMMARY]: ${record.summary.slice(0, REVIEW_MESSAGE_MAX_CHARS)}`;
  }

  return null;
}

export function collectMessageParts(entries: unknown[], recentMessages = 0): string[] {
  const parts: string[] = [];

  for (const entry of entries) {
    const part = formatEntryPart(entry);
    if (part) parts.push(part);
  }

  return applyRecentMessageLimit(parts, recentMessages);
}
