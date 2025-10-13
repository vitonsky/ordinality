import type { Migration } from './Migration';
import type { MigrationStorage } from './storage/MigrationStorage';

export type Range<K extends string> =
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

export const findMigrationIndexByRange = <T extends string = string>({
	range,
	items,
	currentIndex,
	direction,
}: {
	range: Range<T>;
	items: string[];
	currentIndex: number;
	direction: 'backward' | 'forward';
}) => {
	const isBackward = direction === 'backward';
	let index: number | null = null;

	if ('step' in range) {
		// Step 0 means do nothing
		if (range.step === 0) {
			return null;
		}

		// In backward mode we start from current migration,
		// so step: 1 mean current, step: 2 mean current -1, etc.
		// In forward mode step: 1 mean current + 1, etc.
		const stepWithOffset = isBackward ? range.step - 1 : range.step;
		index = currentIndex + stepWithOffset * (isBackward ? -1 : 1);
	} else {
		if (typeof range.to === 'number') {
			if (isBackward) {
				index = range.to;
			} else {
				// We subtract 1 since user provides sequential number, not an index
				index = range.to - 1;
			}
		} else {
			const foundIndex = items.indexOf(range.to);
			if (foundIndex === -1)
				throw new Error(
					`Invalid range: Not found migration with name "${range.to}"`,
				);

			if (isBackward) {
				index = foundIndex + 1;
				if (index >= items.length) return null;
			} else {
				// We use index, since found command is inclusive
				index = foundIndex;
			}
		}
	}

	// Current index + 1 means "stay on current migration"
	if (isBackward && index === currentIndex + 1) return null;

	const isIndexOutOfBound = index >= items.length;
	if (index < 0 || isIndexOutOfBound)
		throw new Error(`Invalid range: Migration with index ${index} does not exist`);

	if (isBackward) {
		if (index > currentIndex)
			throw new Error(
				`Invalid range: Migration "${items[index]}" is not applied yet`,
			);
	} else {
		if (index < currentIndex)
			throw new Error(
				`Invalid range: Migration "${items[index]}" is behind of last applied migration`,
			);
	}

	return index;
};

export class MigrationRunner<
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
	public async up(range?: Range<string>) {
		const { migrations, storage, context } = this.config;

		const { executed, all } = await this.getState();

		const currentIndex = executed.length - 1;
		const endIndex = range
			? (findMigrationIndexByRange({
					range,
					items: all,
					currentIndex,
					direction: 'forward',
				}) ?? currentIndex)
			: null;

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

	/**
	 * Roll back migrations and returns list with ids of reverted migrations
	 *
	 * Throw error in case migration cannot be reverted
	 */
	public async down(range?: Range<string>) {
		const { migrations, storage, context } = this.config;

		const { executed, all } = await this.getState();

		const currentIndex = executed.length - 1;
		const endIndex = range
			? (findMigrationIndexByRange({
					range,
					items: all,
					currentIndex,
					direction: 'backward',
				}) ?? currentIndex + 1)
			: null;

		// Ensure current state is valid
		const revertedMigrations: string[] = [];
		for (let i = currentIndex; i >= (endIndex ?? 0); i--) {
			const migration = migrations[i];

			const rawMeta = migration.meta;
			const meta: Meta =
				typeof rawMeta === 'function'
					? await rawMeta(context as Context)
					: rawMeta;

			if (!migration.revert)
				throw new Error(
					`Migration "${migration.uid}" cannot be reverted because have no "revert" method`,
				);

			// Apply migration
			await migration.revert(context as Context);
			await storage.unlog(migration.uid, meta);
			revertedMigrations.push(migration.uid);
		}

		return revertedMigrations;
	}
}
