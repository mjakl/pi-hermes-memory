import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SkillStore } from "../store/skill-store.js";
import type { SkillIndex, SkillScope } from "../types.js";

interface SkillCommandInfo {
  name: string;
  description?: string;
  source?: string;
  sourceInfo?: {
    path?: string;
    scope?: string;
    source?: string;
    origin?: string;
    baseDir?: string;
  };
}

export interface LoadedSkillRow {
  name: string;
  displayName: string;
  description: string;
  path: string;
  displayPath: string;
  sourceScope?: string;
  sourceOrigin?: string;
}

export interface SkillListRow {
  skillId: string;
  mutable: boolean;
  scope?: SkillScope;
  name: string;
  displayName: string;
  description: string;
  path: string;
  displayPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizePathForKey(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  const normalized = resolved.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function formatSkillPath(inputPath: string): string {
  const absolutePath = path.resolve(inputPath);
  const home = os.homedir();
  const relative = path.relative(home, absolutePath);
  const underHome = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (!underHome) return absolutePath;
  if (relative === "") return "~";
  return `~${path.sep}${relative}`;
}

export function collectLoadedSkillsFromCommands(commands: SkillCommandInfo[]): LoadedSkillRow[] {
  const loaded: LoadedSkillRow[] = [];

  for (const command of commands) {
    if (!isRecord(command)) continue;
    if (getStringField(command.source) !== "skill") continue;

    const sourceInfo = isRecord(command.sourceInfo) ? command.sourceInfo : undefined;
    const skillPath = getStringField(sourceInfo?.path)?.trim();
    const commandName = getStringField(command.name)?.trim();
    if (!skillPath || !commandName) continue;

    const name = commandName.startsWith("skill:") ? commandName.slice("skill:".length) : commandName;
    if (!name.trim()) continue;

    loaded.push({
      name,
      displayName: name,
      description: command.description?.trim() || "(no description)",
      path: skillPath,
      displayPath: formatSkillPath(skillPath),
      sourceScope: getStringField(sourceInfo?.scope),
      sourceOrigin: getStringField(sourceInfo?.origin),
    });
  }

  return loaded.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function buildSkillRows(managed: SkillIndex[], loaded: LoadedSkillRow[] = []): SkillListRow[] {
  const managedPaths = new Set(managed.map((skill) => normalizePathForKey(skill.path)));

  const managedRows: SkillListRow[] = managed.map((skill) => ({
    skillId: skill.skillId,
    mutable: true,
    scope: skill.scope,
    name: skill.name,
    displayName: skill.displayName || skill.name,
    description: skill.description,
    path: skill.path,
    displayPath: formatSkillPath(skill.path),
  }));

  const externalRows: SkillListRow[] = loaded
    .filter((skill) => !managedPaths.has(normalizePathForKey(skill.path)))
    .map((skill, index) => ({
      skillId: `external:${index}:${skill.name}`,
      mutable: false,
      name: skill.name,
      displayName: skill.displayName,
      description: skill.description,
      path: skill.path,
      displayPath: skill.displayPath,
    }));

  return [...managedRows, ...externalRows].sort((a, b) => {
    if (a.mutable !== b.mutable) return a.mutable ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function formatSkillsList(rows: SkillListRow[]): string {
  if (rows.length === 0) {
    return "📚 Memory Skills\n\nNo skills found yet. Use the skill tool to create reusable procedures.";
  }

  const lines = ["📚 Memory Skills", ""];
  for (const row of rows) {
    const scope = row.mutable ? row.scope ?? "managed" : "external";
    lines.push(`[${scope}] ${row.displayName}`);
    lines.push(`  ${row.description}`);
    lines.push(`  id: ${row.skillId}`);
    lines.push(`  path: ${row.displayPath}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function parseAction(args: string): { action: "list" | "view" | "delete" | "move"; skillId?: string; scope?: SkillScope } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { action: "list" };

  const [action, skillId, scope] = parts;
  if (action === "view" && skillId) return { action, skillId };
  if (action === "delete" && skillId) return { action, skillId };
  if (action === "move" && skillId && (scope === "global" || scope === "project")) {
    return { action, skillId, scope };
  }
  return { action: "list" };
}

async function listRows(pi: ExtensionAPI, skillStore: SkillStore): Promise<SkillListRow[]> {
  const managed = await skillStore.loadIndex();
  let loaded: LoadedSkillRow[] = [];
  try {
    loaded = collectLoadedSkillsFromCommands((pi.getCommands?.() ?? []) as SkillCommandInfo[]);
  } catch {
    loaded = [];
  }
  return buildSkillRows(managed, loaded);
}

async function showSkill(ctx: ExtensionCommandContext, skillStore: SkillStore, skillId: string): Promise<void> {
  const doc = await skillStore.loadSkill(skillId);
  if (!doc) {
    ctx.ui.notify(`Skill not found: ${skillId}`, "error");
    return;
  }

  ctx.ui.notify([
    `📖 ${doc.displayName || doc.name}`,
    `id: ${doc.skillId}`,
    `scope: ${doc.scope}`,
    `path: ${formatSkillPath(doc.path)}`,
    "",
    doc.body.trim(),
  ].join("\n"), "info");
}

async function deleteSkill(ctx: ExtensionCommandContext, skillStore: SkillStore, skillId: string): Promise<void> {
  const ok = await ctx.ui.confirm("Delete memory skill?", skillId);
  if (!ok) return;

  const result = await skillStore.delete(skillId);
  if (result.success) {
    ctx.ui.notify(`Deleted skill: ${skillId}`, "info");
  } else {
    ctx.ui.notify(result.error || `Failed to delete skill: ${skillId}`, "error");
  }
}

async function moveSkill(
  ctx: ExtensionCommandContext,
  skillStore: SkillStore,
  skillId: string,
  scope: SkillScope,
): Promise<void> {
  const result = await skillStore.move(skillId, scope);
  if (result.success) {
    ctx.ui.notify(result.message || `Moved skill to ${scope}: ${result.skillId || skillId}`, "info");
  } else {
    ctx.ui.notify(result.error || `Failed to move skill: ${skillId}`, "error");
  }
}

async function handleArgs(
  ctx: ExtensionCommandContext,
  skillStore: SkillStore,
  args: string,
): Promise<boolean> {
  const parsed = parseAction(args);
  if (parsed.action === "list") return false;

  if (parsed.action === "view" && parsed.skillId) {
    await showSkill(ctx, skillStore, parsed.skillId);
    return true;
  }
  if (parsed.action === "delete" && parsed.skillId) {
    await deleteSkill(ctx, skillStore, parsed.skillId);
    return true;
  }
  if (parsed.action === "move" && parsed.skillId && parsed.scope) {
    await moveSkill(ctx, skillStore, parsed.skillId, parsed.scope);
    return true;
  }

  return false;
}

async function openInteractiveManager(
  ctx: ExtensionCommandContext,
  skillStore: SkillStore,
  rows: SkillListRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const options = rows.map((row) => `${row.mutable ? row.scope : "external"} | ${row.displayName} | ${row.skillId}`);
  const selected = await ctx.ui.select("Memory skills", [...options, "Cancel"]);
  if (!selected || selected === "Cancel") return;

  const index = options.indexOf(selected);
  const row = rows[index];
  if (!row) return;

  if (!row.mutable) {
    ctx.ui.notify([
      `External skill: ${row.displayName}`,
      row.description,
      `path: ${row.displayPath}`,
      "External skills are managed outside pi-hermes-memory.",
    ].join("\n"), "info");
    return;
  }

  const actions = ["View", row.scope === "global" ? "Move to project" : "Move to global", "Delete", "Cancel"];
  const action = await ctx.ui.select(`Manage ${row.displayName}`, actions);
  if (!action || action === "Cancel") return;

  if (action === "View") {
    await showSkill(ctx, skillStore, row.skillId);
  } else if (action === "Delete") {
    await deleteSkill(ctx, skillStore, row.skillId);
  } else if (action === "Move to project") {
    await moveSkill(ctx, skillStore, row.skillId, "project");
  } else if (action === "Move to global") {
    await moveSkill(ctx, skillStore, row.skillId, "global");
  }
}

export function registerSkillsCommand(pi: ExtensionAPI, skillStore: SkillStore): void {
  pi.registerCommand("memory-skills", {
    description: "List and manage pi-hermes-memory procedural skills",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        if (await handleArgs(ctx, skillStore, args)) return;

        const rows = await listRows(pi, skillStore);
        ctx.ui.notify(formatSkillsList(rows), "info");

        if (ctx.hasUI) {
          await openInteractiveManager(ctx, skillStore, rows);
        }
      } catch (error) {
        ctx.ui.notify(`Failed to load memory skills: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
