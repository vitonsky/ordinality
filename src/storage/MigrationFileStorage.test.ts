/* eslint-disable spellcheck/spell-checker */
import memfs, { vol } from 'memfs';
import Dirent from 'memfs/lib/node/Dirent';
import path from 'path';
import { z } from 'zod';

import { MigrationFileStorage } from './MigrationFileStorage';

vi.mock('fs', async () => {
	const module = await vi.importActual('memfs');
	return (module as typeof memfs).fs;
});
vi.mock('fs/promises', async () => {
	const module = await vi.importActual('memfs');
	return (module as typeof memfs).fs.promises;
});

const getFilesList = () =>
	vol
		.readdirSync('/', { recursive: true, withFileTypes: true })
		.filter((path) => (path as Dirent).isFile())
		.map((info) => {
			const pathInfo = info as Dirent;
			return path.join(pathInfo.path, pathInfo.name as string);
		});

test('Log migration names to a FS', async () => {
	const storage = new MigrationFileStorage('/foo/bar/baz.json');

	expect(getFilesList()).toEqual([]);
	await expect(storage.list()).resolves.toEqual([]);

	await storage.log('foo');
	await expect(storage.list()).resolves.toEqual(['foo']);
	expect(getFilesList()).toEqual(['/foo/bar/baz.json']);

	await storage.log('bar');
	await expect(storage.list()).resolves.toEqual(['foo', 'bar']);
	expect(getFilesList()).toEqual(['/foo/bar/baz.json']);

	await expect(storage.log('foo')).rejects.toThrowError();
	await expect(storage.log('bar')).rejects.toThrowError();
	await expect(storage.list()).resolves.toEqual(['foo', 'bar']);
});

test('Storage may be extended to control meta', async () => {
	class ExtendedMigrationFileStorage<
		M extends { hash: string },
	> extends MigrationFileStorage<M> {
		public async log(uid: string, meta: M): Promise<void> {
			const state = await this.fetchState();

			for (const migration of state.migrations) {
				if (meta.hash === migration.meta.hash)
					throw new Error(`Migration with hash "${meta.hash}" already exists`);
			}

			return super.log(uid, meta);
		}
	}

	const storage = new ExtendedMigrationFileStorage(
		'/foo/bar/another-state.json',
		z.object({ hash: z.string(), anotherProperty: z.string().optional() }),
	);

	await expect(storage.list()).resolves.toEqual([]);
	expect(getFilesList()).not.toContainEqual('/foo/bar/another-state.json');

	await storage.log('foo', { hash: 'hash-1' });
	expect(getFilesList()).toContainEqual('/foo/bar/another-state.json');

	await storage.log('bar', { hash: 'hash-2' });
	await expect(storage.list()).resolves.toEqual(['foo', 'bar']);

	await expect(storage.log('foo', { hash: 'hash-3' })).rejects.toThrowError(
		'Migration with name foo is already applied',
	);
	await expect(storage.log('baz', { hash: 'hash-1' })).rejects.toThrowError(
		'Migration with hash "hash-1" already exists',
	);

	await expect(storage.log('baz', { hash: 'hash-3' })).resolves.not.toThrow();
});
