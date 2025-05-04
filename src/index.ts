import { existsSync } from 'fs';
import { z } from 'zod';

import { readFile, writeFile } from 'fs/promises';

const MigrationStateScheme = z.object({ migrations: z.string().array() }).strict();

type MigrationsState = z.TypeOf<typeof MigrationStateScheme>;

export interface Migration<T = void> {
	readonly uid: string;
	apply(context: T): Promise<void>;
}

// TODO: Add in-memory implementation for tests
export interface MigrationStorage {
	getState(): Promise<MigrationsState>;
	push(uid: string): Promise<void>;
}

// TODO: lock file and wait unlock to ensure consistent state when multiple instances in run
export class MigrationFileStorage implements MigrationStorage {
	constructor(private readonly filename: string) {}

	private async fetchState(): Promise<MigrationsState> {
		if (!existsSync(this.filename)) return { migrations: [] };

		const fileBuffer = await readFile(this.filename);
		const jsonState = JSON.parse(fileBuffer.toString('utf-8'));

		return MigrationStateScheme.parse(jsonState);
	}

	private async writeState(state: MigrationsState) {
		const verifiedState = MigrationStateScheme.parse(state);

		await writeFile(this.filename, JSON.stringify(verifiedState, undefined, 2));
		this.state = state;
	}

	private state: MigrationsState | null = null;
	async getState(): Promise<MigrationsState> {
		if (!this.state) {
			this.state = await this.fetchState();
		}

		return structuredClone(this.state);
	}

	async push(uid: string): Promise<void> {
		const state = await this.getState();
		state.migrations.push(uid);

		await this.writeState(state);
	}
}

export class MigrationsRunner<Context = void> {
	constructor(
		private readonly storage: MigrationStorage,
		private readonly migrations: Migration<Context>[],
	) {}

	public async migrateAll(context: Context) {
		const currentState = await this.storage.getState();

		if (currentState.migrations.length > this.migrations.length)
			throw new Error(
				'Applied migrations list is larger than provided migrations list',
			);

		if (currentState.migrations.length !== new Set(currentState.migrations).size)
			throw new Error(
				'Current migrations list contains entries with the same identifiers',
			);

		const migrationsListIds = this.migrations.map((migration) => migration.uid);
		if (migrationsListIds.length !== new Set(migrationsListIds).size)
			throw new Error('Migrations list contains entries with the same identifiers');

		// Ensure current state is valid
		for (let i = 0; i < this.migrations.length; i++) {
			const migration = this.migrations[i];

			// Ensure migrations is match
			if (i < currentState.migrations.length) {
				const currentMigration = currentState.migrations[i];

				if (currentMigration !== migration.uid)
					throw new Error(
						`Migration uid does not match for transaction #${i + 1}. "${currentMigration}" != "${migration.uid}"`,
					);
				continue;
			}

			// Apply migration
			await migration.apply(context);
			await this.storage.push(migration.uid);
		}
	}
}
