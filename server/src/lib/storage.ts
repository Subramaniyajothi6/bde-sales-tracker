import { createReadStream } from 'node:fs';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from './env.js';
import { db } from './db.js';

/**
 * Where receipt files live. The app only talks to this interface, so moving
 * from a folder on the server to cloud storage (S3, Cloudflare R2, MinIO)
 * later means adding one class here and changing STORAGE_DRIVER in .env.
 */
export interface FileStorage {
  save(data: Buffer, originalName: string): Promise<string>;
  read(key: string): Promise<Readable>;
}

/** A new key like receipts/2026/10/<uuid>.png */
function newKey(originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
  const now = new Date();
  return `receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`;
}

class LocalStorage implements FileStorage {
  private root = path.resolve(env.UPLOAD_DIR);

  async save(data: Buffer, originalName: string) {
    const key = newKey(originalName);
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return key;
  }

  async read(key: string) {
    const full = this.resolve(key);
    await access(full);
    return createReadStream(full);
  }

  /** Keys are made by save(); this also stops "../" tricks. */
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Bad file key');
    return full;
  }
}

/** Files kept in MySQL, for free hosts (e.g. Render) whose disk is wiped on every restart. */
class DbStorage implements FileStorage {
  async save(data: Buffer, originalName: string) {
    const key = newKey(originalName);
    await db.storedFile.create({ data: { key, data: new Uint8Array(data) } });
    return key;
  }

  async read(key: string) {
    const file = await db.storedFile.findUnique({ where: { key } });
    if (!file) throw new Error('Receipt file is missing');
    return Readable.from([Buffer.from(file.data)]);
  }
}

export const storage: FileStorage = env.STORAGE_DRIVER === 'db' ? new DbStorage() : new LocalStorage();
