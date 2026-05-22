/**
 * Preview context command — /memory-preview-context shows the memory policy
 * appended to the system prompt.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveMemoryPolicyPrompt } from "../prompt-context.js";
import type { MemoryConfig } from "../types.js";

export function registerPreviewContextCommand(
  pi: ExtensionAPI,
  config: Pick<MemoryConfig, "memoryPolicyStyle" | "memoryPolicyCustomText"> = {},
): void {
  pi.registerCommand("memory-preview-context", {
    description: "Preview the memory policy appended to the system prompt",
    handler: async (_args, ctx) => {
      const policyPrompt = resolveMemoryPolicyPrompt(config);
      const lines: string[] = [];
      lines.push("");
      lines.push("  ╔══════════════════════════════════════════════╗");
      lines.push("  ║        Injected Context Preview             ║");
      lines.push("  ╚══════════════════════════════════════════════╝");
      lines.push("");
      lines.push("  Mode: policy-only");
      lines.push(`  Policy style: ${config.memoryPolicyStyle ?? "full"}`);
      lines.push("  This is the memory policy appended to the system prompt.");
      lines.push("  Full Markdown memories are NOT injected.");
      lines.push("");

      if (policyPrompt) {
        lines.push(policyPrompt);
        lines.push("");
        lines.push("  Blocks shown: 1");
      } else {
        lines.push("  No memory policy context is injected for this policy style.");
        lines.push("");
        lines.push("  Blocks shown: 0");
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
