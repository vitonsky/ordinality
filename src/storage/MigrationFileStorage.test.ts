/* eslint-disable spellcheck/spell-checker */
import memfs, { vol } from 'memfs';
import Dirent from 'memfs/lib/node/Dirent';
import path from 'path';
import { z } from 'zod';

import { MigrationContext } from '../Migration';
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

const context: MigrationContext<any, any> = {
	context: null,
	meta: null,
};

test('Log migration names to a FS', async () => {
	const storage = new MigrationFileStorage('/foo/bar/baz.json');

	expect(getFilesList()).toEqual([]);
	await expect(storage.list()).resolves.toEqual([]);

	await storage.log('foo', context);
	await expect(storage.list()).resolves.toEqual(['foo']);
	expect(getFilesList()).toEqual(['/foo/bar/baz.json']);

	await storage.log('bar', context);
	await expect(storage.list()).resolves.toEqual(['foo', 'bar']);
	expect(getFilesList()).toEqual(['/foo/bar/baz.json']);

	await expect(storage.log('foo', context)).rejects.toThrowError();
	await expect(storage.log('bar', context)).rejects.toThrowError();
	await expect(storage.list()).resolves.toEqual(['foo', 'bar']);
});

test('Storage may be extended to control meta', async () => {
	class ExtendedMigrationFileStorage<
		M extends { hash: string },
	> extends MigrationFileStorage<MigrationContext<any, M>> {
		public async log(uid: string, context: MigrationContext<any, M>): Promise<void> {
			const state = await this.fetchState();

			for (const migration of state.migrations) {
				if (context.meta.hash === migration.meta.hash)
					throw new Error(
						`Migration with hash "${context.meta.hash}" already exists`,
					);
			}

			return super.log(uid, context);
		}
	}

	const storage = new ExtendedMigrationFileStorage('/foo/bar/another-state.json', {
		metaScheme: z.object({
			hash: z.string(),
			anotherProperty: z.string().optional(),
		}),
	});

	await expect(storage.list()).resolves.toEqual([]);
	expect(getFilesList()).not.toContainEqual('/foo/bar/another-state.json');

	await storage.log('foo', { context: null, meta: { hash: 'hash-1' } });
	expect(getFilesList()).toContainEqual('/foo/bar/another-state.json');

	await storage.log('bar', { context: null, meta: { hash: 'hash-2' } });
	await expect(storage.list()).resolves.toEqual(['foo', 'bar']);

	await expect(
		storage.log('foo', { context: null, meta: { hash: 'hash-3' } }),
	).rejects.toThrowError('Migration with name foo is already applied');
	await expect(
		storage.log('baz', { context: null, meta: { hash: 'hash-1' } }),
	).rejects.toThrowError('Migration with hash "hash-1" already exists');

	await expect(
		storage.log('baz', { context: null, meta: { hash: 'hash-3' } }),
	).resolves.not.toThrow();
});

test('Custom codecs may transparently encode/decode data', async () => {
	const storage = new MigrationFileStorage('/foo/bar/custom-codec.json', {
		codec: {
			encode(data) {
				return Buffer.from('FILE PREFIX' + JSON.stringify(data, undefined, 2));
			},
			decode(buffer) {
				return JSON.parse(buffer.toString('utf-8').slice('FILE PREFIX'.length));
			},
		},
	});

	await expect(storage.list()).resolves.toEqual([]);
	expect(getFilesList()).not.toContainEqual('/foo/bar/custom-codec.json');

	await storage.log('foo', context);
	expect(getFilesList()).toContainEqual('/foo/bar/custom-codec.json');
	expect(vol.readFileSync('/foo/bar/custom-codec.json', { encoding: 'utf8' })).toMatch(
		/^FILE PREFIX\{/,
	);

	await storage.log('bar', context);
	await expect(storage.list()).resolves.toEqual(['foo', 'bar']);
});
