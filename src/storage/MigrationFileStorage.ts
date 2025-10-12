import { existsSync } from 'fs';
import { z } from 'zod';

import { readFile, writeFile } from 'fs/promises';
import { MigrationsState, MigrationStorage } from './MigrationStorage';

export const MigrationStateScheme = z.object({ migrations: z.string().array() }).strict();

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
