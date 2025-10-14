import { SQLCompiler } from 'nano-queries/compilers/SQLCompiler';
import { ConfigurableSQLBuilder } from 'nano-queries/sql/ConfigurableSQLBuilder';

import type { MigrationStorage } from './MigrationStorage';

export type BasicSQLTypes = string | number;

export type DBQuery = (
	query: string,
	bindings: (string | number)[],
) => Promise<Record<string, any>[]>;

export const getSQLCompilerPreset = (
	preset: 'sqlite' | 'postgres' | 'mysql',
): SQLCompiler<BasicSQLTypes> => {
	return new SQLCompiler<BasicSQLTypes>({
		getPlaceholder(valueIndex) {
			switch (preset) {
				case 'sqlite':
				case 'mysql':
					return '?';

				case 'postgres':
					return '$' + (valueIndex + 1);

				default:
					throw new Error('Preset not found');
			}
		},
	});
};

/**
 * Custom storage that persists migration names
 */
export class SQLStorage<M = void> implements MigrationStorage<M> {
	protected readonly config;
	protected readonly qb;
	constructor(config: {
		compiler: SQLCompiler<BasicSQLTypes>;
		query: DBQuery;
		tableName?: string;
	}) {
		this.qb = new ConfigurableSQLBuilder<BasicSQLTypes>(config.compiler);
		this.config = {
			tableName: 'schema_migrations',
			...config,
		};
	}

	async log(uid: string, _meta: M): Promise<void> {
		await this.ensureTable();

		const idQuery = this.qb
			.sql`COALESCE((SELECT id + 1 FROM ${this.qb.raw(this.config.tableName)} ORDER BY id DESC LIMIT 1), 1)`;
		const insertQuery = this.qb.toSQL(
			this.qb
				.sql`INSERT INTO ${this.qb.raw(this.config.tableName)} (id, name) VALUES (${idQuery}, ${uid})`,
		);
		await this.config.query(insertQuery.sql, insertQuery.bindings);
	}

	async unlog(uid: string, _meta: M): Promise<void> {
		await this.ensureTable();

		const insertQuery = this.qb.toSQL(
			this.qb
				.sql`DELETE FROM ${this.qb.raw(this.config.tableName)} WHERE name=${uid}`,
		);
		await this.config.query(insertQuery.sql, insertQuery.bindings);
	}

	async list(): Promise<string[]> {
		await this.ensureTable();

		const insertQuery = this.qb.toSQL(
			this.qb
				.sql`SELECT name FROM ${this.qb.raw(this.config.tableName)} ORDER BY executed_at ASC`,
		);
		const results = await this.config.query(insertQuery.sql, insertQuery.bindings);

		const migrationNames: string[] = [];
		for (const result of results) {
			const name = result.name;
			if (typeof name !== 'string')
				throw new Error(`Field "name" in row is not found`);

			migrationNames.push(name);
		}

		return migrationNames;
	}

	// ensure migrations table exists
	async ensureTable() {
		const insertQuery = this.qb.toSQL(this.qb
			.sql`CREATE TABLE IF NOT EXISTS ${this.qb.raw(this.config.tableName)} (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);`);
		await this.config.query(insertQuery.sql, insertQuery.bindings);
	}
}
