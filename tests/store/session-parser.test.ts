import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSessionFile, getSessionFiles, decodeProjectDir } from '../../src/store/session-parser.js';

describe('session-parser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-parser-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSession(lines: unknown[]): string {
    const filePath = path.join(tmpDir, 'test-session.jsonl');
    fs.writeFileSync(filePath, lines.map((line) => JSON.stringify(line)).join('\n'));
    return filePath;
  }

  describe('parseSessionFile', () => {
    it('parses current Pi v3 text messages and skips thinking blocks', () => {
      const filePath = writeSession([
        { type: 'session', id: 'session-123', timestamp: '2026-05-03T00:00:00Z', cwd: '/Users/test/Documents/my-project' },
        {
          type: 'message',
          id: 'msg-1',
          parentId: null,
          timestamp: '2026-05-03T00:01:00Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }], timestamp: Date.now() },
        },
        {
          type: 'message',
          id: 'msg-2',
          parentId: 'msg-1',
          timestamp: '2026-05-03T00:01:30Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'The user said hello' },
              { type: 'text', text: 'I am doing well, thank you!' },
            ],
            timestamp: Date.now(),
          },
        },
      ]);

      const result = parseSessionFile(filePath);
      assert.ok(result);
      assert.strictEqual(result.id, 'session-123');
      assert.strictEqual(result.project, 'my-project');
      assert.strictEqual(result.cwd, '/Users/test/Documents/my-project');
      assert.strictEqual(result.messages.length, 2);
      assert.strictEqual(result.messages[0].role, 'user');
      assert.strictEqual(result.messages[0].content, 'Hello, how are you?');
      assert.strictEqual(result.messages[1].role, 'assistant');
      assert.strictEqual(result.messages[1].content, 'I am doing well, thank you!');
    });

    it('extracts current Pi toolCall blocks from assistant messages', () => {
      const filePath = writeSession([
        { type: 'session', id: 's1', timestamp: '2026-05-03T00:00:00Z', cwd: '/test/project' },
        {
          type: 'message',
          id: 'msg-1',
          parentId: null,
          timestamp: '2026-05-03T00:01:00Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me check...' },
              { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'src/index.ts' } },
              { type: 'toolCall', id: 'call-2', name: 'bash', arguments: { command: 'npm test' } },
            ],
            timestamp: Date.now(),
          },
        },
      ]);

      const result = parseSessionFile(filePath);
      assert.ok(result);
      assert.deepStrictEqual(result.messages[0].toolCalls, ['read', 'bash']);
      assert.match(result.messages[0].content, /Let me check/);
      assert.match(result.messages[0].content, /Tool calls: read/);
      assert.match(result.messages[0].content, /npm test/);
    });

    it('indexes top-level toolResult messages from current Pi sessions', () => {
      const filePath = writeSession([
        { type: 'session', id: 's1', timestamp: '2026-05-03T00:00:00Z', cwd: '/test/project' },
        {
          type: 'message',
          id: 'msg-tool-result',
          parentId: null,
          timestamp: '2026-05-03T00:01:00Z',
          message: {
            role: 'toolResult',
            toolCallId: 'call-1',
            toolName: 'read',
            content: [{ type: 'text', text: 'file contents here' }, { type: 'image', data: 'abc', mimeType: 'image/png' }],
            isError: false,
            timestamp: Date.now(),
          },
        },
      ]);

      const result = parseSessionFile(filePath);
      assert.ok(result);
      assert.strictEqual(result.messages.length, 1);
      assert.strictEqual(result.messages[0].role, 'toolResult');
      assert.strictEqual(result.messages[0].toolCalls?.[0], 'read');
      assert.match(result.messages[0].content, /read result:/);
      assert.match(result.messages[0].content, /file contents here/);
    });

    it('indexes bashExecution messages and respects hidden bash output', () => {
      const filePath = writeSession([
        { type: 'session', id: 's1', timestamp: '2026-05-03T00:00:00Z', cwd: '/test/project' },
        {
          type: 'message',
          id: 'msg-bash',
          parentId: null,
          timestamp: '2026-05-03T00:01:00Z',
          message: {
            role: 'bashExecution',
            command: 'npm test',
            output: 'all tests passed',
            exitCode: 0,
            cancelled: false,
            truncated: false,
            timestamp: Date.now(),
          },
        },
        {
          type: 'message',
          id: 'msg-hidden-bash',
          parentId: 'msg-bash',
          timestamp: '2026-05-03T00:02:00Z',
          message: {
            role: 'bashExecution',
            command: 'security find-generic-password',
            output: 'secret',
            exitCode: 0,
            cancelled: false,
            truncated: false,
            excludeFromContext: true,
            timestamp: Date.now(),
          },
        },
      ]);

      const result = parseSessionFile(filePath);
      assert.ok(result);
      assert.strictEqual(result.messages.length, 1);
      assert.strictEqual(result.messages[0].role, 'bashExecution');
      assert.strictEqual(result.messages[0].toolCalls?.[0], 'bash');
      assert.match(result.messages[0].content, /Command: npm test/);
      assert.match(result.messages[0].content, /all tests passed/);
      assert.doesNotMatch(result.messages[0].content, /secret/);
    });

    it('indexes custom messages and summary entries', () => {
      const filePath = writeSession([
        { type: 'session', id: 's1', timestamp: '2026-05-03T00:00:00Z', cwd: '/test/project' },
        {
          type: 'custom_message',
          id: 'custom-1',
          parentId: null,
          timestamp: '2026-05-03T00:01:00Z',
          customType: 'demo',
          content: 'custom context',
          display: true,
        },
        {
          type: 'compaction',
          id: 'compact-1',
          parentId: 'custom-1',
          timestamp: '2026-05-03T00:02:00Z',
          summary: 'compacted context',
          firstKeptEntryId: 'custom-1',
          tokensBefore: 100,
        },
        {
          type: 'branch_summary',
          id: 'branch-1',
          parentId: 'compact-1',
          timestamp: '2026-05-03T00:03:00Z',
          fromId: 'custom-1',
          summary: 'branch context',
        },
      ]);

      const result = parseSessionFile(filePath);
      assert.ok(result);
      assert.deepStrictEqual(result.messages.map((m) => m.role), ['custom', 'compactionSummary', 'branchSummary']);
      assert.match(result.messages[0].content, /custom context/);
      assert.match(result.messages[1].content, /compacted context/);
      assert.match(result.messages[2].content, /branch context/);
    });

    it('skips empty messages and non-message state entries', () => {
      const filePath = writeSession([
        { type: 'session', id: 's1', timestamp: '2026-05-03T00:00:00Z', cwd: '/test/project' },
        { type: 'model_change', id: 'mc1', parentId: null, timestamp: '2026-05-03T00:00:01Z' },
        { type: 'thinking_level_change', id: 'tl1', parentId: null, timestamp: '2026-05-03T00:00:02Z' },
        { type: 'custom', id: 'c1', parentId: null, timestamp: '2026-05-03T00:00:03Z' },
        {
          type: 'message',
          id: 'msg-1',
          parentId: null,
          timestamp: '2026-05-03T00:01:00Z',
          message: { role: 'user', content: [], timestamp: Date.now() },
        },
        {
          type: 'message',
          id: 'msg-2',
          parentId: null,
          timestamp: '2026-05-03T00:02:00Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Hello' }], timestamp: Date.now() },
        },
      ]);

      const result = parseSessionFile(filePath);
      assert.ok(result);
      assert.strictEqual(result.messages.length, 1);
      assert.strictEqual(result.messages[0].content, 'Hello');
    });

    it('handles malformed JSONL lines gracefully', () => {
      const filePath = path.join(tmpDir, 'test.jsonl');
      const content = [
        JSON.stringify({ type: 'session', id: 's1', timestamp: '2026-05-03T00:00:00Z', cwd: '/test/project' }),
        'not valid json',
        '',
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          parentId: null,
          timestamp: '2026-05-03T00:01:00Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Hello' }], timestamp: Date.now() },
        }),
      ];
      fs.writeFileSync(filePath, content.join('\n'));

      const result = parseSessionFile(filePath);
      assert.ok(result);
      assert.strictEqual(result.messages.length, 1);
    });

    it('returns null for empty file', () => {
      const filePath = path.join(tmpDir, 'empty.jsonl');
      fs.writeFileSync(filePath, '');

      const result = parseSessionFile(filePath);
      assert.strictEqual(result, null);
    });

    it('returns null if no session entry found', () => {
      const filePath = path.join(tmpDir, 'no-session.jsonl');
      fs.writeFileSync(filePath, JSON.stringify({ type: 'message', id: 'm1' }));

      const result = parseSessionFile(filePath);
      assert.strictEqual(result, null);
    });
  });

  describe('getSessionFiles', () => {
    it('should return empty array if directory does not exist', () => {
      const result = getSessionFiles('/nonexistent/path');
      assert.deepStrictEqual(result, []);
    });

    it('should find all JSONL files across projects', () => {
      const proj1 = path.join(tmpDir, 'project-a');
      const proj2 = path.join(tmpDir, 'project-b');
      fs.mkdirSync(proj1);
      fs.mkdirSync(proj2);
      fs.writeFileSync(path.join(proj1, 'session1.jsonl'), '{}');
      fs.writeFileSync(path.join(proj1, 'session2.jsonl'), '{}');
      fs.writeFileSync(path.join(proj2, 'session3.jsonl'), '{}');
      fs.writeFileSync(path.join(proj1, 'not-jsonl.txt'), '{}');

      const result = getSessionFiles(tmpDir);
      assert.strictEqual(result.length, 3);
    });

    it('should filter by project directory if specified', () => {
      const proj1 = path.join(tmpDir, 'project-a');
      const proj2 = path.join(tmpDir, 'project-b');
      fs.mkdirSync(proj1);
      fs.mkdirSync(proj2);
      fs.writeFileSync(path.join(proj1, 'session1.jsonl'), '{}');
      fs.writeFileSync(path.join(proj2, 'session2.jsonl'), '{}');

      const result = getSessionFiles(tmpDir, 'project-a');
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('session1.jsonl'));
    });
  });

  describe('decodeProjectDir', () => {
    it('should decode project name from directory format', () => {
      assert.strictEqual(decodeProjectDir('--Users-chandrateja-Documents-pi-hermes-memory--'), 'memory');
    });

    it('should handle simple directory names', () => {
      assert.strictEqual(decodeProjectDir('my-project'), 'project');
    });
  });
});
