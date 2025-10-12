import { Migration } from './Migration';
import { MigrationStorage } from './storage/MigrationStorage';

type Range<K extends string> =
	| {
			/**
			 * Name of migration or its index
			 */
			to: K | number;
	  }
	| {
			/**
			 * Number of next migrations to select related to current
			 */
			step: number;
	  };

// TODO: add method to down migrations
export class MigrationsRunner<
	Context = void,
	Meta extends Record<any, any> | void = void,
> {
	constructor(
		protected readonly config: {
			migrations: Migration<Context, Meta>[];
			storage: MigrationStorage<Meta>;
		} & (void extends Context
			? {
					context?: Context;
				}
			: {
					context: Context;
				}),
	) {}

	private async getState() {
		const { migrations, storage } = this.config;
		const executedMigrations = await storage.list();

		if (executedMigrations.length > migrations.length)
			throw new Error(
				`Applied migrations list is larger than provided migrations list: ${migrations.length}/${executedMigrations.length}`,
			);

		if (executedMigrations.length !== new Set(executedMigrations).size)
			throw new Error(
				'List of applied migrations contains entries with duplicate identifiers',
			);

		const migrationsListIds = migrations.map((migration) => migration.uid);
		if (migrationsListIds.length !== new Set(migrationsListIds).size)
			throw new Error(
				'Migrations list contains entries with duplicate identifiers',
			);

		// Ensure applied migrations order is match with provided migrations
		const pending: string[] = [];
		for (let i = 0; i < migrations.length; i++) {
			const migration = migrations[i];

			if (executedMigrations.length > i) {
				const executedId = executedMigrations[i];
				if (executedId !== migration.uid)
					throw new Error(
						`Migration #${i + 1} with id "${migration.uid}" does not match an applied migration name "${executedId}"`,
					);

				continue;
			}

			pending.push(migration.uid);
		}

		return {
			executed: executedMigrations,
			pending,
			all: [...executedMigrations, ...pending],
		};
	}

	public async executed() {
		const state = await this.getState();
		return state.executed;
	}

	public async pending() {
		const state = await this.getState();
		return state.pending;
	}

	/**
	 * Executes migrations and returns list with ids of applied migrations
	 */
	public async migrate(range?: Range<string>) {
		const { migrations, storage, context } = this.config;

		const { executed, all } = await this.getState();

		const currentMigrationIndex = executed.length - 1;
		let endIndex: number | null = null;
		if (range) {
			if ('step' in range) {
				endIndex = currentMigrationIndex + range.step;
			} else {
				if (typeof range.to === 'number') {
					// We subtract 1 since user provides sequential number, not an index
					endIndex = range.to - 1;
				} else {
					const index = all.indexOf(range.to);
					if (index === -1)
						throw new Error(
							`Invalid range: Not found migration with name "${range.to}"`,
						);

					// We use index, since found command is inclusive
					endIndex = index;
				}
			}

			const isIndexOutOfBound = endIndex >= all.length;
			if (endIndex < 0 || isIndexOutOfBound)
				throw new Error(
					`Invalid range: Migration with index ${endIndex} does not exist`,
				);

			const isIndexBehind = currentMigrationIndex > endIndex;
			if (isIndexBehind)
				throw new Error(
					`Invalid range: Migration "${all[endIndex]}" is behind of last applied migration`,
				);
		}

		// Ensure current state is valid
		const appliedMigrations: string[] = [];
		for (let i = executed.length; i <= (endIndex ?? migrations.length - 1); i++) {
			const migration = migrations[i];

			const rawMeta = migration.meta;
			const meta: Meta =
				typeof rawMeta === 'function'
					? await rawMeta(context as Context)
					: rawMeta;

			// Apply migration
			await migration.apply(context as Context);
			await storage.log(migration.uid, meta);
			appliedMigrations.push(migration.uid);
		}

		return appliedMigrations;
	}
}
