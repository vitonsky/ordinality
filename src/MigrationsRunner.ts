import { Migration } from './Migration';
import { MigrationStorage } from './storage/MigrationStorage';

export class MigrationsRunner<
	Context = void,
	Meta extends Record<any, any> | void = void,
> {
	constructor(
		private readonly storage: MigrationStorage<Meta>,
		private readonly migrations: Migration<Context, Meta>[],
	) {}

	/**
	 * Executes migrations and returns list with ids of applied migrations
	 */
	public async migrateAll(context: Context) {
		const appliedMigrationsId = await this.storage.list();

		if (appliedMigrationsId.length > this.migrations.length)
			throw new Error(
				'Applied migrations list is larger than provided migrations list',
			);

		if (appliedMigrationsId.length !== new Set(appliedMigrationsId).size)
			throw new Error(
				'Current migrations list contains entries with the same identifiers',
			);

		const migrationsListIds = this.migrations.map((migration) => migration.uid);
		if (migrationsListIds.length !== new Set(migrationsListIds).size)
			throw new Error('Migrations list contains entries with the same identifiers');

		// Ensure current state is valid
		const appliedMigrations: string[] = [];
		for (let i = 0; i < this.migrations.length; i++) {
			const migration = this.migrations[i];

			// Ensure migrations is match
			if (i < appliedMigrationsId.length) {
				const currentMigration = appliedMigrationsId[i];

				if (currentMigration !== migration.uid)
					throw new Error(
						`Migration uid does not match for transaction #${i + 1}. "${currentMigration}" != "${migration.uid}"`,
					);
				continue;
			}

			const rawMeta = migration.meta;
			const meta: Meta =
				typeof rawMeta === 'function' ? await rawMeta(context) : rawMeta;

			// Apply migration
			await migration.apply(context);
			await this.storage.log(migration.uid, meta);
			appliedMigrations.push(migration.uid);
		}

		return appliedMigrations;
	}
}
