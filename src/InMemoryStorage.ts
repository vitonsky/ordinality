import { MigrationsState, MigrationStorage } from './MigrationStorage';

export class InMemoryStorage implements MigrationStorage {
	private async writeState(state: MigrationsState) {
		this.state = state;
	}

	private state: MigrationsState | null = null;
	async getState(): Promise<MigrationsState> {
		if (!this.state) {
			this.state = {
				migrations: [],
			};
		}

		return structuredClone(this.state);
	}

	async push(uid: string): Promise<void> {
		const state = await this.getState();
		state.migrations.push(uid);

		await this.writeState(state);
	}
}
