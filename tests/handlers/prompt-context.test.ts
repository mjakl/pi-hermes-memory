import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPromptContext } from "../../src/prompt-context.js";
import { MEMORY_POLICY_PROMPT, MEMORY_POLICY_PROMPT_COMPACT } from "../../src/constants.js";

describe("buildPromptContext", () => {
  it("returns the full policy prompt by default", () => {
    const result = buildPromptContext({});

    assert.strictEqual(result, MEMORY_POLICY_PROMPT);
    assert.match(result, /memory_search/);
    assert.match(result, /Accepted memory categories/);
    assert.match(result, /category filters categorized failure\/lesson memories only/);
    assert.match(result, /Use category only for categorized failure\/lesson searches/);
    assert.match(result, /session_search: search indexed past conversation messages/);
    assert.match(result, /skill: view, create, patch, update, and delete procedural skills/);
    assert.match(result, /Use view without a skill_id to list skills/);
    assert.match(result, /Always pass scope explicitly on create/);
    assert.match(result, /Do not create skills for one-off task state/);
    assert.doesNotMatch(result, /category="preference"/);
    assert.doesNotMatch(result, /inspect, and update procedural skills/);
    assert.doesNotMatch(result, /memory_search: search relevant user, project, session, failure, and skill memories/);
    assert.doesNotMatch(result, /MEMORY<\/memory-context>/);
    assert.doesNotMatch(result, /SKILLS/);
  });

  it("returns the full policy prompt when policy style is full", () => {
    const result = buildPromptContext({ memoryPolicyStyle: "full" });

    assert.strictEqual(result, MEMORY_POLICY_PROMPT);
  });

  it("returns the compact policy prompt when policy style is compact", () => {
    const result = buildPromptContext({ memoryPolicyStyle: "compact" });

    assert.strictEqual(result, MEMORY_POLICY_PROMPT_COMPACT);
    assert.match(result, /category filters categorized failure\/lesson memories only/);
    assert.match(result, /scope is required: global for transferable workflows, project for repo-specific ones/);
    assert.match(result, /Do not use memory_search for generic questions/);
    assert.doesNotMatch(result, /MEMORY<\/memory-context>/);
    assert.doesNotMatch(result, /SKILLS/);
  });

  it("returns custom policy text when policy style is custom", () => {
    const customText = "<memory-policy>Use local custom policy.</memory-policy>";
    const result = buildPromptContext({ memoryPolicyStyle: "custom", memoryPolicyCustomText: customText });

    assert.strictEqual(result, customText);
  });

  it("falls back to compact policy when custom policy text is blank", () => {
    const result = buildPromptContext({ memoryPolicyStyle: "custom", memoryPolicyCustomText: "  \n\t  " });

    assert.strictEqual(result, MEMORY_POLICY_PROMPT_COMPACT);
  });

  it("returns empty context when policy style is none", () => {
    const result = buildPromptContext({ memoryPolicyStyle: "none" });

    assert.strictEqual(result, "");
  });
});
