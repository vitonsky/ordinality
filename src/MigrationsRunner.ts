import { Migration } from './Migration';
import { MigrationStorage } from './storage/MigrationStorage';

export class MigrationsRunner<
	Context = void,
	Meta extends Record<any, any> | void = void,
> {
	constructor(
		private readonly config: {
			migrations: Migration<Context, Meta>[];
			storage: MigrationStorage<Meta>;
			context: Context;
		},
	) {}

	/**
	 * Executes migrations and returns list with ids of applied migrations
	 */
	public async migrate() {
		const { migrations, storage, context } = this.config;
		const appliedMigrationsId = await storage.list();

		if (appliedMigrationsId.length > migrations.length)
			throw new Error(
				'Applied migrations list is larger than provided migrations list',
			);

		if (appliedMigrationsId.length !== new Set(appliedMigrationsId).size)
			throw new Error(
				'Current migrations list contains entries with the same identifiers',
			);

		const migrationsListIds = migrations.map((migration) => migration.uid);
		if (migrationsListIds.length !== new Set(migrationsListIds).size)
			throw new Error('Migrations list contains entries with the same identifiers');

		// Ensure current state is valid
		const appliedMigrations: string[] = [];
		for (let i = 0; i < migrations.length; i++) {
			const migration = migrations[i];

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
			await storage.log(migration.uid, meta);
			appliedMigrations.push(migration.uid);
		}

		return appliedMigrations;
	}
}
