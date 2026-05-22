import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface RunPiPromptOptions {
  signal?: AbortSignal;
  timeout?: number;
  /** Tool allowlist for the child Pi process. Defaults to the memory tool only. */
  tools?: string[];
}

/**
 * Run a one-shot child Pi prompt without putting the prompt text in argv.
 *
 * Pi print mode supports @file arguments, so we write the full prompt to a temp
 * markdown file and pass only that path. The child is also restricted to the
 * extension memory tool by default; it should not inherit bash/read/edit access
 * just to save a memory.
 */
export async function runPiPrompt(
  pi: Pick<ExtensionAPI, "exec">,
  prompt: string,
  options: RunPiPromptOptions = {},
): Promise<ExecResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-hermes-memory-"));
  const promptPath = path.join(tempDir, "prompt.md");
  await fs.writeFile(promptPath, prompt, "utf-8");

  const tools = options.tools ?? ["memory"];
  const args = [
    "-p",
    "--no-session",
    "--no-builtin-tools",
    "--tools",
    tools.join(","),
    `@${promptPath}`,
  ];

  try {
    return await pi.exec("pi", args, {
      signal: options.signal,
      timeout: options.timeout,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
