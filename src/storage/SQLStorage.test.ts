/* eslint-disable camelcase */
/* eslint-disable spellcheck/spell-checker */
import { verbose } from 'sqlite3';
import { PGlite } from '@electric-sql/pglite';

import { Migration } from '../Migration';
import { MigrationRunner } from '../MigrationRunner';
import { DBQuery, getSQLCompilerPreset, SQLStorage } from './SQLStorage';

const storageConstructors = [
	{
		name: 'PGLite',
		create() {
			const db = new PGlite();
			const query: DBQuery = async (query, bindings) => {
				const { rows } = await db.query(query, bindings);
				return rows as Record<string, any>[];
			};

			const storage = new SQLStorage({
				compiler: getSQLCompilerPreset('postgres'),
				query,
			});

			return { storage, query };
		},
	},
	{
		name: 'SQLite',
		create() {
			const sqlite3 = verbose();
			const db = new sqlite3.Database(':memory:');
			const query: DBQuery = async (query, bindings) => {
				const rows = await new Promise((resolve, reject) => {
					db.all(query, bindings, function(err, rows) {
						if (err) reject(err);
						else resolve(rows);
					});
				});
				return rows as Record<string, any>[];
			};

			const storage = new SQLStorage({
				compiler: getSQLCompilerPreset('sqlite'),
				query,
			});

			return { storage, query };
		},
	},
] satisfies {
	name: string;
	create(): {
		storage: SQLStorage;
		query: DBQuery;
	};
}[];

storageConstructors.forEach((storageInfo) => {
	const { name, create } = storageInfo;
	describe(`SQL storage backed by ${name}`, () => {
		test('Storage persistency', async () => {
			const { storage } = create();
			await expect(storage.list()).resolves.toEqual([]);
			await storage.log('foo');
			await expect(storage.list()).resolves.toEqual(['foo']);

			await expect(storage.log('foo')).rejects.toThrowError();
			await expect(storage.log('bar')).resolves.not.toThrowError();
			await expect(storage.log('bar')).rejects.toThrowError();
			await expect(storage.list()).resolves.toEqual(['foo', 'bar']);
		});

		test('Run migrations on DB', async () => {
			const { storage, query } = create();
			type Context = { query: DBQuery };
			const context = { query };
			const migrations: Migration<Context>[] = [
				{
					uid: 'create-posts-table',
					async apply(context) {
						await context.query(
							'CREATE TABLE posts (id INTEGER PRIMARY KEY, text TEXT NOT NULL)',
							[],
						);
					},
				},
				{
					uid: 'add-title-to-posts',
					async apply(context) {
						await context.query(
							'ALTER TABLE posts ADD COLUMN title TEXT NOT NULL',
							[],
						);
					},
				},
			];

			await expect(
				new MigrationRunner<Context>({ storage, migrations, context }).up(),
			).resolves.toEqual(['create-posts-table', 'add-title-to-posts']);

			await expect(
				new MigrationRunner<Context>({ storage, migrations, context }).up(),
			).resolves.toEqual([]);

			await query(
				`INSERT INTO posts(id,title,text) VALUES(1, 'Example post', 'Hello world')`,
				[],
			);

			migrations.push({
				uid: 'add created_at field',
				async apply(context) {
					await context.query(
						'ALTER TABLE posts ADD COLUMN created_at INTEGER DEFAULT 0',
						[],
					);
				},
			});
			await expect(
				new MigrationRunner<Context>({ storage, migrations, context }).up(),
			).resolves.toEqual(['add created_at field']);

			await expect(query(`SELECT * FROM posts`, [])).resolves.toEqual([
				{
					id: 1,
					created_at: 0,
					title: 'Example post',
					text: 'Hello world',
				},
			]);
		});
	});
});
