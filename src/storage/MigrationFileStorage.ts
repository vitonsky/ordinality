import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

import { MigrationContext } from '../Migration';
import { mkdir, readFile, writeFile } from 'fs/promises';
import type { MigrationStorage } from './MigrationStorage';

export type Codec<T> = {
	encode: (data: T) => Buffer;
	decode: (buffer: Buffer) => T;
};

export type State<M = void> = {
	migrations: {
		name: string;
		meta: M;
	}[];
};

// TODO: lock file and wait unlock to ensure consistent state when multiple instances in run
export class MigrationFileStorage<C extends MigrationContext<any, any>>
	implements MigrationStorage<C>
{
	constructor(
		private readonly filename: string,
		private readonly options: {
			/**
			 * Scheme validator for a migration meta
			 */
			metaScheme?: C['meta'] extends z.TypeOf<infer X> ? X : never;

			/**
			 * Custom logic to encode/decode data
			 *
			 * By default data will be encoded as JSON string
			 */
			codec?: Codec<State<C['meta']>>;
		} = {},
	) {}

	protected getCodec(): Codec<State<C['meta']>> {
		return (
			this.options.codec ?? {
				encode(data) {
					return Buffer.from(JSON.stringify(data, undefined, 2));
				},
				decode(buffer) {
					return JSON.parse(buffer.toString('utf-8'));
				},
			}
		);
	}

	protected getMigrationScheme() {
		return z.object({
			name: z.string(),
			meta: this.options.metaScheme ?? z.void().nullish().optional(),
		});
	}

	protected getStorageScheme() {
		return z.object({
			migrations: this.getMigrationScheme().array(),
		});
	}

	protected async fetchState() {
		if (!existsSync(this.filename)) return { migrations: [] };

		const fileBuffer = await readFile(this.filename);
		const jsonState = this.getCodec().decode(fileBuffer);

		return this.getStorageScheme().parse(jsonState) as State<C['meta']>;
	}

	async list(): Promise<string[]> {
		const state = await this.fetchState();

		return state.migrations.map((migration) => migration.name);
	}

	async log(uid: string, context: C): Promise<void> {
		const newState = await this.fetchState();

		// Ensure unique name
		for (const migration of newState.migrations) {
			if (migration.name === uid)
				throw new Error(`Migration with name ${uid} is already applied`);
		}

		// Add and validate
		newState.migrations.push({ name: uid, meta: context.meta });

		await mkdir(path.dirname(this.filename), { recursive: true });

		const verifiedState = this.getStorageScheme().parse(newState) as State<C['meta']>;
		await writeFile(this.filename, this.getCodec().encode(verifiedState));
	}

	async unlog(uid: string): Promise<void> {
		const state = await this.fetchState();

		// Update migrations list
		const filteredMigrations = state.migrations.filter(
			(migration) => migration.name === uid,
		);
		if (state.migrations.length === filteredMigrations.length)
			throw new Error(`Migration with name ${uid} is not found`);

		state.migrations = filteredMigrations;

		await mkdir(path.dirname(this.filename), { recursive: true });

		const verifiedState = this.getStorageScheme().parse(state) as State<C['meta']>;
		await writeFile(this.filename, this.getCodec().encode(verifiedState));
	}
}
