/**
 * File Backend - Low-level file operations for checkpoint persistence
 *
 * Provides atomic file operations, directory management, and file listing
 * for the checkpoint storage system. Designed for reliability in long-running
 * swarm sessions.
 *
 * @module file-backend
 * @see CheckpointStore for high-level checkpoint operations
 *
 * Sample usage:
 *   const backend = new FileBackend('~/.meshseeks/sessions');
 *   await backend.writeJSON('session-123/checkpoint-1.json', data);
 *   const data = await backend.readJSON('session-123/checkpoint-1.json');
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import { fileURLToPath } from 'url';

/**
 * Result of a file operation.
 */
export interface FileOperationResult {
  success: boolean;
  path?: string;
  error?: string;
  sizeBytes?: number;
}

/**
 * File metadata.
 */
export interface FileMetadata {
  path: string;
  name: string;
  sizeBytes: number;
  createdAt: number;
  modifiedAt: number;
  isDirectory: boolean;
}

/**
 * Options for listing files.
 */
export interface ListOptions {
  pattern?: RegExp;
  recursive?: boolean;
  sortBy?: 'name' | 'created' | 'modified' | 'size';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Low-level file backend for checkpoint storage.
 */
export class FileBackend {
  private baseDir: string;
  private initialized: boolean = false;

  constructor(baseDir: string) {
    // Expand ~ to home directory
    this.baseDir = baseDir.startsWith('~')
      ? path.join(os.homedir(), baseDir.slice(1))
      : path.resolve(baseDir);
  }

  /**
   * Initialize the backend, creating base directory if needed.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize file backend at ${this.baseDir}: ${error}`);
    }
  }

  /**
   * Get the full path for a relative path.
   */
  getFullPath(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }

  /**
   * Check if a file or directory exists.
   */
  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.getFullPath(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a directory (and parent directories if needed).
   */
  async createDirectory(relativePath: string): Promise<FileOperationResult> {
    const fullPath = this.getFullPath(relativePath);

    try {
      await fs.mkdir(fullPath, { recursive: true });
      return { success: true, path: fullPath };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create directory ${fullPath}: ${error}`
      };
    }
  }

  /**
   * Write JSON data to a file.
   */
  async writeJSON(relativePath: string, data: unknown, pretty: boolean = true): Promise<FileOperationResult> {
    const fullPath = this.getFullPath(relativePath);
    const tempPath = `${fullPath}.tmp.${Date.now()}`;

    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // Serialize data
      const content = pretty
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);

      // Write to temp file first (atomic write pattern)
      await fs.writeFile(tempPath, content, 'utf-8');

      // Rename to target (atomic on most filesystems)
      await fs.rename(tempPath, fullPath);

      const stats = await fs.stat(fullPath);
      return {
        success: true,
        path: fullPath,
        sizeBytes: stats.size
      };
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: `Failed to write JSON to ${fullPath}: ${error}`
      };
    }
  }

  /**
   * Read JSON data from a file.
   */
  async readJSON<T = unknown>(relativePath: string): Promise<T | null> {
    const fullPath = this.getFullPath(relativePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to read JSON from ${fullPath}: ${error}`);
    }
  }

  /**
   * Write compressed JSON data (gzip).
   */
  async writeCompressedJSON(relativePath: string, data: unknown): Promise<FileOperationResult> {
    const fullPath = this.getFullPath(relativePath);
    const tempPath = `${fullPath}.tmp.${Date.now()}`;

    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      const content = JSON.stringify(data);

      // Write compressed to temp file
      await new Promise<void>((resolve, reject) => {
        const gzip = createGzip({ level: 6 });
        const output = createWriteStream(tempPath);

        output.on('finish', resolve);
        output.on('error', reject);
        gzip.on('error', reject);

        gzip.end(content);
        gzip.pipe(output);
      });

      await fs.rename(tempPath, fullPath);

      const stats = await fs.stat(fullPath);
      return {
        success: true,
        path: fullPath,
        sizeBytes: stats.size
      };
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore
      }

      return {
        success: false,
        error: `Failed to write compressed JSON to ${fullPath}: ${error}`
      };
    }
  }

  /**
   * Read compressed JSON data (gzip).
   */
  async readCompressedJSON<T = unknown>(relativePath: string): Promise<T | null> {
    const fullPath = this.getFullPath(relativePath);

    try {
      const chunks: Buffer[] = [];

      await pipeline(
        createReadStream(fullPath),
        createGunzip(),
        async function* (source) {
          for await (const chunk of source) {
            chunks.push(chunk as Buffer);
          }
        }
      );

      const content = Buffer.concat(chunks).toString('utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to read compressed JSON from ${fullPath}: ${error}`);
    }
  }

  /**
   * Delete a file.
   */
  async deleteFile(relativePath: string): Promise<FileOperationResult> {
    const fullPath = this.getFullPath(relativePath);

    try {
      await fs.unlink(fullPath);
      return { success: true, path: fullPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true, path: fullPath }; // Already doesn't exist
      }
      return {
        success: false,
        error: `Failed to delete file ${fullPath}: ${error}`
      };
    }
  }

  /**
   * Delete a directory and all its contents.
   */
  async deleteDirectory(relativePath: string): Promise<FileOperationResult> {
    const fullPath = this.getFullPath(relativePath);

    try {
      await fs.rm(fullPath, { recursive: true, force: true });
      return { success: true, path: fullPath };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete directory ${fullPath}: ${error}`
      };
    }
  }

  /**
   * List files in a directory.
   */
  async listFiles(relativePath: string = '', options: ListOptions = {}): Promise<FileMetadata[]> {
    const fullPath = this.getFullPath(relativePath);
    const results: FileMetadata[] = [];

    try {
      await this.listFilesRecursive(fullPath, relativePath, results, options.recursive ?? false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    // Filter by pattern
    let filtered = options.pattern
      ? results.filter(f => options.pattern!.test(f.name))
      : results;

    // Sort
    const sortBy = options.sortBy ?? 'modified';
    const sortOrder = options.sortOrder ?? 'desc';

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'modified':
          comparison = a.modifiedAt - b.modifiedAt;
          break;
        case 'size':
          comparison = a.sizeBytes - b.sizeBytes;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  private async listFilesRecursive(
    fullPath: string,
    relativePath: string,
    results: FileMetadata[],
    recursive: boolean
  ): Promise<void> {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryFullPath = path.join(fullPath, entry.name);
      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      const stats = await fs.stat(entryFullPath);

      results.push({
        path: entryRelativePath,
        name: entry.name,
        sizeBytes: stats.size,
        createdAt: stats.birthtime.getTime(),
        modifiedAt: stats.mtime.getTime(),
        isDirectory: entry.isDirectory()
      });

      if (recursive && entry.isDirectory()) {
        await this.listFilesRecursive(entryFullPath, entryRelativePath, results, true);
      }
    }
  }

  /**
   * Calculate checksum of file content.
   */
  async calculateChecksum(relativePath: string): Promise<string> {
    const fullPath = this.getFullPath(relativePath);

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(fullPath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Calculate checksum of data (not from file).
   */
  calculateDataChecksum(data: unknown): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Copy a file.
   */
  async copyFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
    const sourceFullPath = this.getFullPath(sourcePath);
    const destFullPath = this.getFullPath(destPath);

    try {
      await fs.mkdir(path.dirname(destFullPath), { recursive: true });
      await fs.copyFile(sourceFullPath, destFullPath);

      const stats = await fs.stat(destFullPath);
      return {
        success: true,
        path: destFullPath,
        sizeBytes: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to copy ${sourcePath} to ${destPath}: ${error}`
      };
    }
  }

  /**
   * Move a file.
   */
  async moveFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
    const sourceFullPath = this.getFullPath(sourcePath);
    const destFullPath = this.getFullPath(destPath);

    try {
      await fs.mkdir(path.dirname(destFullPath), { recursive: true });
      await fs.rename(sourceFullPath, destFullPath);

      const stats = await fs.stat(destFullPath);
      return {
        success: true,
        path: destFullPath,
        sizeBytes: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to move ${sourcePath} to ${destPath}: ${error}`
      };
    }
  }

  /**
   * Get file metadata.
   */
  async getMetadata(relativePath: string): Promise<FileMetadata | null> {
    const fullPath = this.getFullPath(relativePath);

    try {
      const stats = await fs.stat(fullPath);
      return {
        path: relativePath,
        name: path.basename(relativePath),
        sizeBytes: stats.size,
        createdAt: stats.birthtime.getTime(),
        modifiedAt: stats.mtime.getTime(),
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get total size of a directory.
   */
  async getDirectorySize(relativePath: string): Promise<number> {
    const files = await this.listFiles(relativePath, { recursive: true });
    return files.reduce((total, file) => total + (file.isDirectory ? 0 : file.sizeBytes), 0);
  }

  /**
   * Clean up old files based on age or count.
   */
  async cleanup(
    relativePath: string,
    options: {
      maxAge?: number;        // Max age in milliseconds
      maxCount?: number;      // Max number of files to keep
      pattern?: RegExp;       // Only clean files matching pattern
    }
  ): Promise<{ deletedCount: number; freedBytes: number }> {
    const files = await this.listFiles(relativePath, {
      pattern: options.pattern,
      sortBy: 'modified',
      sortOrder: 'desc'
    });

    const now = Date.now();
    let deletedCount = 0;
    let freedBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.isDirectory) continue;

      const shouldDelete =
        (options.maxAge && now - file.modifiedAt > options.maxAge) ||
        (options.maxCount && i >= options.maxCount);

      if (shouldDelete) {
        const result = await this.deleteFile(file.path);
        if (result.success) {
          deletedCount++;
          freedBytes += file.sizeBytes;
        }
      }
    }

    return { deletedCount, freedBytes };
  }

  /**
   * Get the base directory path.
   */
  getBaseDir(): string {
    return this.baseDir;
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  (async () => {
    const tmpDir = path.join(os.tmpdir(), 'meshseeks-file-backend-test');
    const backend = new FileBackend(tmpDir);

    const allValidationFailures: string[] = [];
    let totalTests = 0;

    console.log('Testing FileBackend...\n');

    // Test 1: Initialize
    totalTests++;
    try {
      await backend.initialize();
      const exists = await backend.exists('');
      if (!exists) {
        allValidationFailures.push('Initialize: Base directory was not created');
      }
    } catch (error) {
      allValidationFailures.push(`Initialize: ${error}`);
    }

    // Test 2: Write and read JSON
    totalTests++;
    try {
      const testData = { foo: 'bar', count: 42, nested: { a: 1 } };
      const writeResult = await backend.writeJSON('test.json', testData);
      if (!writeResult.success) {
        allValidationFailures.push(`WriteJSON: ${writeResult.error}`);
      } else {
        const readData = await backend.readJSON<typeof testData>('test.json');
        if (!readData || readData.foo !== 'bar' || readData.count !== 42) {
          allValidationFailures.push('ReadJSON: Data mismatch');
        }
      }
    } catch (error) {
      allValidationFailures.push(`WriteJSON/ReadJSON: ${error}`);
    }

    // Test 3: Write and read compressed JSON
    totalTests++;
    try {
      const testData = { compressed: true, data: 'x'.repeat(1000) };
      const writeResult = await backend.writeCompressedJSON('test.json.gz', testData);
      if (!writeResult.success) {
        allValidationFailures.push(`WriteCompressedJSON: ${writeResult.error}`);
      } else {
        const readData = await backend.readCompressedJSON<typeof testData>('test.json.gz');
        if (!readData || !readData.compressed || readData.data.length !== 1000) {
          allValidationFailures.push('ReadCompressedJSON: Data mismatch');
        }
      }
    } catch (error) {
      allValidationFailures.push(`WriteCompressedJSON/ReadCompressedJSON: ${error}`);
    }

    // Test 4: Create directory and list files
    totalTests++;
    try {
      await backend.createDirectory('subdir');
      await backend.writeJSON('subdir/file1.json', { id: 1 });
      await backend.writeJSON('subdir/file2.json', { id: 2 });

      const files = await backend.listFiles('subdir', { pattern: /\.json$/ });
      if (files.length !== 2) {
        allValidationFailures.push(`ListFiles: Expected 2 files, got ${files.length}`);
      }
    } catch (error) {
      allValidationFailures.push(`Directory/ListFiles: ${error}`);
    }

    // Test 5: Checksum
    totalTests++;
    try {
      const data = { test: 'checksum' };
      await backend.writeJSON('checksum-test.json', data);
      const checksum = await backend.calculateChecksum('checksum-test.json');
      if (!checksum || checksum.length !== 64) {
        allValidationFailures.push(`Checksum: Invalid checksum format (length: ${checksum?.length})`);
      }
    } catch (error) {
      allValidationFailures.push(`Checksum: ${error}`);
    }

    // Test 6: Delete file
    totalTests++;
    try {
      await backend.writeJSON('to-delete.json', {});
      const deleteResult = await backend.deleteFile('to-delete.json');
      if (!deleteResult.success) {
        allValidationFailures.push(`DeleteFile: ${deleteResult.error}`);
      }
      const stillExists = await backend.exists('to-delete.json');
      if (stillExists) {
        allValidationFailures.push('DeleteFile: File still exists after deletion');
      }
    } catch (error) {
      allValidationFailures.push(`DeleteFile: ${error}`);
    }

    // Cleanup
    await backend.deleteDirectory('');

    // Report results
    console.log('─'.repeat(50));
    if (allValidationFailures.length > 0) {
      console.log(`❌ VALIDATION FAILED - ${allValidationFailures.length} of ${totalTests} tests failed:`);
      for (const failure of allValidationFailures) {
        console.log(`  - ${failure}`);
      }
      process.exit(1);
    } else {
      console.log(`✅ VALIDATION PASSED - All ${totalTests} tests produced expected results`);
      process.exit(0);
    }
  })();
}
