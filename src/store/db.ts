import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { SCHEMA_SQL } from './schema.js';

type StatementLike = {
  run: (...args: any[]) => any;
  get: (...args: any[]) => any;
  all: (...args: any[]) => any;
};

type DatabaseLike = {
  prepare: (sql: string) => StatementLike;
  exec: (sql: string) => void;
  close: () => void;
  pragma?: (query: string, options?: any) => any;
  transaction?: (fn: any) => any;
};

type DatabaseCtor = new (dbPath: string) => DatabaseLike;
type BunDatabaseInstance = {
  prepare: (sql: string) => StatementLike;
  exec: (sql: string) => void;
  close: (throwOnError?: boolean) => void;
  transaction?: (fn: any) => any;
};

function loadDatabaseCtor(): DatabaseCtor {
  const require = createRequire(import.meta.url);
  try {
    const mod = require('better-sqlite3') as { default?: DatabaseCtor } | DatabaseCtor;
    return (mod as { default?: DatabaseCtor }).default ?? (mod as DatabaseCtor);
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
    const isBunIncompat = msg.includes('better-sqlite3 is not yet supported in bun') || msg.includes('not yet supported in bun');
    if (!isBunIncompat) {
      throw err;
    }
    if (!isBunRuntime) {
      throw err;
    }

    const bunSqlite = require('bun:sqlite') as { Database: new (dbPath: string) => BunDatabaseInstance };

    return class BunCompatDatabase implements DatabaseLike {
      private readonly db: BunDatabaseInstance;

      constructor(dbPath: string) {
        this.db = new bunSqlite.Database(dbPath);
      }

      prepare(sql: string): StatementLike {
        return this.db.prepare(sql);
      }

      exec(sql: string): void {
        this.db.exec(sql);
      }

      close(): void {
        this.db.close();
      }

      transaction(fn: any): any {
        if (!this.db.transaction) {
          return undefined;
        }
        return this.db.transaction(fn);
      }
    };
  }
}

const Database = loadDatabaseCtor();

export class DatabaseManager {
  private db: DatabaseLike | null = null;
  private readonly dbPath: string;

  constructor(memoryDir: string) {
    this.dbPath = path.join(memoryDir, 'sessions.db');
  }

  /**
   * Get the database instance. Creates/opens on first call.
   */
  getDb(): DatabaseLike {
    if (!this.db) {
      this.db = this.open();
    }
    return this.db;
  }

  /**
   * Open the database and initialize schema.
   */
  private open(): DatabaseLike {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(this.dbPath);

    // Enable WAL mode + FK enforcement for each connection.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    db.exec(SCHEMA_SQL);

    return db;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get the database file path.
   */
  getPath(): string {
    return this.dbPath;
  }

  /**
   * Check if the database file exists.
   */
  exists(): boolean {
    return fs.existsSync(this.dbPath);
  }

  /**
   * Get stats about the database.
   */
  getStats(): { sessions: number; messages: number; memories: number } {
    const db = this.getDb();
    const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    const messages = db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    const memories = db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    return {
      sessions: sessions.count,
      messages: messages.count,
      memories: memories.count,
    };
  }
}
