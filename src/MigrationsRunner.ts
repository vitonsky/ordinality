import { Migration } from './Migration';
import { MigrationStorage } from './MigrationStorage';

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
