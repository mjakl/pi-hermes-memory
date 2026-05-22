import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSkillRows,
  collectLoadedSkillsFromCommands,
  formatSkillPath,
  formatSkillsList,
  registerSkillsCommand,
} from "../../src/handlers/skills-command.js";
import type { SkillIndex, SkillResult } from "../../src/types.js";

const SAMPLE_SKILLS: SkillIndex[] = [
  {
    skillId: "global:debug-typescript-errors",
    scope: "global",
    fileName: "SKILL.md",
    path: "/tmp/global/debug-typescript-errors/SKILL.md",
    name: "debug-typescript-errors",
    displayName: "Debug TypeScript Errors",
    description: "Trace compiler issues step by step",
    created: "2026-05-19",
    updated: "2026-05-21",
  },
  {
    skillId: "project:demo-project:deploy-checklist",
    scope: "project",
    fileName: "SKILL.md",
    path: "/tmp/project/deploy-checklist/SKILL.md",
    projectName: "demo-project",
    name: "deploy-checklist",
    displayName: "Deploy Checklist",
    description: "Project release checklist",
    created: "2026-05-18",
    updated: "2026-05-20",
  },
];

const LOADED_SKILL_COMMANDS = [
  {
    name: "skill:debug-typescript-errors",
    description: "Trace compiler issues step by step",
    source: "skill",
    sourceInfo: { path: "/tmp/global/debug-typescript-errors/SKILL.md" },
  },
  {
    name: "skill:langgraph-fundamentals",
    description: "LangGraph patterns",
    source: "skill",
    sourceInfo: { path: "/Users/demo/.agents/skills/langgraph-fundamentals/SKILL.md" },
  },
  {
    name: "memory-skills",
    description: "not a skill command",
    source: "extension",
    sourceInfo: { path: "/tmp/ignore" },
  },
] as const;

function createCtx(overrides: Record<string, any> = {}) {
  const notifications: Array<{ msg: string; level?: string }> = [];
  const selects: string[] = [];
  const confirms: boolean[] = [];
  const ctx = {
    hasUI: false,
    ui: {
      notify: (msg: string, level?: string) => notifications.push({ msg, level }),
      select: async () => selects.shift(),
      confirm: async () => confirms.shift() ?? false,
    },
    ...overrides,
  } as any;
  return { ctx, notifications, selects, confirms };
}

function createPi(commands: any[] = []) {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  const pi = {
    registerCommand: (_name: string, options: any) => { handler = options.handler; },
    getCommands: () => commands,
  } as any;
  return { pi, getHandler: () => handler! };
}

describe("skills command helpers", () => {
  it("formats paths under home with a tilde", () => {
    const homePath = `${process.env.HOME}/.pi/agent/skills/demo/SKILL.md`;
    assert.match(formatSkillPath(homePath), /^~/);
  });

  it("collectLoadedSkillsFromCommands returns loaded runtime skills only", () => {
    const loaded = collectLoadedSkillsFromCommands(LOADED_SKILL_COMMANDS as any);

    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0]?.name, "debug-typescript-errors");
    assert.strictEqual(loaded[1]?.name, "langgraph-fundamentals");
  });

  it("collectLoadedSkillsFromCommands ignores malformed and pathless commands", () => {
    const loaded = collectLoadedSkillsFromCommands([
      { source: "skill", name: "skill:valid", sourceInfo: { path: "/tmp/valid/SKILL.md" } },
      { source: "skill", name: "skill:no-path", sourceInfo: {} },
      { source: "skill", name: "skill:blank-path", sourceInfo: { path: "   " } },
      { source: "skill", name: "   ", sourceInfo: { path: "/tmp/blank-name/SKILL.md" } },
      { source: "skill", sourceInfo: { path: "/tmp/missing-name/SKILL.md" } },
      { source: "skill", name: 123, sourceInfo: { path: "/tmp/invalid-name/SKILL.md" } },
      { source: "extension", name: "memory-skills", sourceInfo: { path: "/tmp/ignore/SKILL.md" } },
      null as any,
    ] as any);

    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0]?.name, "valid");
  });

  it("buildSkillRows merges managed and external skills and excludes duplicate paths", () => {
    const loaded = collectLoadedSkillsFromCommands(LOADED_SKILL_COMMANDS as any);
    const rows = buildSkillRows(SAMPLE_SKILLS, loaded);

    assert.strictEqual(rows.length, 3);
    assert.strictEqual(rows.filter((row) => row.mutable).length, 2);
    assert.strictEqual(rows.filter((row) => !row.mutable).length, 1);
    assert.strictEqual(rows.find((row) => !row.mutable)?.displayName, "langgraph-fundamentals");
  });

  it("formatSkillsList includes scope, id, description, and path", () => {
    const rows = buildSkillRows(SAMPLE_SKILLS);
    const output = formatSkillsList(rows);

    assert.match(output, /Memory Skills/);
    assert.match(output, /\[global\] Debug TypeScript Errors/);
    assert.match(output, /id: global:debug-typescript-errors/);
    assert.match(output, /Trace compiler issues step by step/);
  });

  it("formatSkillsList handles empty state", () => {
    assert.match(formatSkillsList([]), /No skills found yet/);
  });
});

describe("registerSkillsCommand", () => {
  it("registers and lists managed plus runtime skills", async () => {
    const { pi, getHandler } = createPi(LOADED_SKILL_COMMANDS as any);
    const store = { loadIndex: async () => SAMPLE_SKILLS } as any;
    registerSkillsCommand(pi, store);

    const { ctx, notifications } = createCtx();
    await getHandler()("", ctx);

    assert.strictEqual(notifications.length, 1);
    assert.match(notifications[0].msg, /Debug TypeScript Errors/);
    assert.match(notifications[0].msg, /langgraph-fundamentals/);
  });

  it("shows a skill document with view <skill_id>", async () => {
    const { pi, getHandler } = createPi();
    const store = {
      loadSkill: async (skillId: string) => ({
        ...SAMPLE_SKILLS[0],
        skillId,
        body: "# Debug TypeScript Errors\n\nRun tsc first.",
        version: 1,
      }),
    } as any;
    registerSkillsCommand(pi, store);

    const { ctx, notifications } = createCtx();
    await getHandler()("view global:debug-typescript-errors", ctx);

    assert.match(notifications[0].msg, /Run tsc first/);
    assert.match(notifications[0].msg, /global:debug-typescript-errors/);
  });

  it("confirms and deletes a managed skill", async () => {
    const { pi, getHandler } = createPi();
    const deleted: string[] = [];
    const store = {
      delete: async (skillId: string): Promise<SkillResult> => {
        deleted.push(skillId);
        return { success: true, skillId, scope: "global" };
      },
    } as any;
    registerSkillsCommand(pi, store);

    const { ctx, notifications, confirms } = createCtx();
    confirms.push(true);
    await getHandler()("delete global:debug-typescript-errors", ctx);

    assert.deepStrictEqual(deleted, ["global:debug-typescript-errors"]);
    assert.match(notifications[0].msg, /Deleted skill/);
  });

  it("does not delete when confirmation is cancelled", async () => {
    const { pi, getHandler } = createPi();
    let deleteCalls = 0;
    const store = {
      delete: async () => {
        deleteCalls++;
        return { success: true };
      },
    } as any;
    registerSkillsCommand(pi, store);

    const { ctx, confirms } = createCtx();
    confirms.push(false);
    await getHandler()("delete global:debug-typescript-errors", ctx);

    assert.strictEqual(deleteCalls, 0);
  });

  it("moves a skill to the requested scope", async () => {
    const { pi, getHandler } = createPi();
    const moves: Array<{ skillId: string; scope: string }> = [];
    const store = {
      move: async (skillId: string, scope: string): Promise<SkillResult> => {
        moves.push({ skillId, scope });
        return { success: true, skillId: `project:demo:${skillId}`, scope: "project", message: "moved" };
      },
    } as any;
    registerSkillsCommand(pi, store);

    const { ctx, notifications } = createCtx();
    await getHandler()("move global:debug-typescript-errors project", ctx);

    assert.deepStrictEqual(moves, [{ skillId: "global:debug-typescript-errors", scope: "project" }]);
    assert.match(notifications[0].msg, /moved/);
  });

  it("handles getCommands failures while listing", async () => {
    let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
    const pi = {
      registerCommand: (_name: string, options: any) => { handler = options.handler; },
      getCommands: () => { throw new Error("commands unavailable"); },
    } as any;
    const store = { loadIndex: async () => SAMPLE_SKILLS } as any;
    registerSkillsCommand(pi, store);

    const { ctx, notifications } = createCtx();
    await handler!("", ctx);

    assert.match(notifications[0].msg, /Debug TypeScript Errors/);
  });

  it("uses built-in select UI for interactive management", async () => {
    const { pi, getHandler } = createPi();
    const store = {
      loadIndex: async () => SAMPLE_SKILLS,
      loadSkill: async () => ({ ...SAMPLE_SKILLS[0], body: "# Body", version: 1 }),
    } as any;
    registerSkillsCommand(pi, store);

    const { ctx, notifications, selects } = createCtx({ hasUI: true });
    selects.push("global | Debug TypeScript Errors | global:debug-typescript-errors", "View");
    await getHandler()("", ctx);

    assert.match(notifications[0].msg, /Memory Skills/);
    assert.match(notifications[1].msg, /# Body/);
  });
});
