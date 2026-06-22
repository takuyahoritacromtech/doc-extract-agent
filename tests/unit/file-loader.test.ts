import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FsFileLoader } from '../../src/infrastructure/files/file-loader';
import { ErrorCode, FileError } from '../../src/domain/errors/errors';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doc-extract-test-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FsFileLoader', () => {
  it('loads a supported file into base64 with the right media type', async () => {
    const path = join(dir, 'invoice.png');
    const bytes = Buffer.from('fake-png-bytes');
    await writeFile(path, bytes);

    const loaded = await new FsFileLoader({ maxFileBytes: 1024 }).load(path);

    expect(loaded.fileName).toBe('invoice.png');
    expect(loaded.mediaType).toBe('image/png');
    expect(loaded.sizeBytes).toBe(bytes.length);
    expect(Buffer.from(loaded.base64, 'base64').toString()).toBe('fake-png-bytes');
  });

  it('rejects an unsupported extension with a helpful hint', async () => {
    const path = join(dir, 'notes.txt');
    await writeFile(path, 'hello');
    await expect(new FsFileLoader({ maxFileBytes: 1024 }).load(path)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_FILE_TYPE,
    });
  });

  it('rejects a missing file', async () => {
    await expect(
      new FsFileLoader({ maxFileBytes: 1024 }).load(join(dir, 'nope.pdf')),
    ).rejects.toMatchObject({ code: ErrorCode.FILE_NOT_FOUND });
  });

  it('rejects a file larger than the configured limit', async () => {
    const path = join(dir, 'big.pdf');
    await writeFile(path, Buffer.alloc(50));
    const error = await new FsFileLoader({ maxFileBytes: 10 }).load(path).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileError);
    expect((error as FileError).code).toBe(ErrorCode.FILE_TOO_LARGE);
    expect((error as FileError).displayMessage).toContain('limit');
  });
});
