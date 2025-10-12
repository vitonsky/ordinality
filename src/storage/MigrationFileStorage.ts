import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

import { mkdir, readFile, writeFile } from 'fs/promises';
import { MigrationStorage } from './MigrationStorage';

export const MigrationStateScheme = z.object({ migrations: z.string().array() }).strict();

// TODO: lock file and wait unlock to ensure consistent state when multiple instances in run
export class MigrationFileStorage<M = void> implements MigrationStorage<M> {
	constructor(
		private readonly filename: string,
		private readonly metaScheme?: M extends z.TypeOf<infer X> ? X : never,
	) {}

	protected getMigrationScheme() {
		return z.object({
			name: z.string(),
			meta: this.metaScheme ?? z.void().optional(),
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
		const jsonState = JSON.parse(fileBuffer.toString('utf-8'));

		return this.getStorageScheme().parse(jsonState) as {
			migrations: {
				name: string;
				meta: M;
			}[];
		};
	}

	async list(): Promise<string[]> {
		const state = await this.fetchState();

		return state.migrations.map((migration) => migration.name);
	}

	async log(uid: string, meta: M): Promise<void> {
		const newState = await this.fetchState();

		// Ensure unique name
		for (const migration of newState.migrations) {
			if (migration.name === uid)
				throw new Error(`Migration with name ${uid} is already applied`);
		}

		// Add and validate
		newState.migrations.push({ name: uid, meta });

		await mkdir(path.dirname(this.filename), { recursive: true });

		const verifiedState = this.getStorageScheme().parse(newState);
		await writeFile(this.filename, JSON.stringify(verifiedState, undefined, 2));
	}
}
