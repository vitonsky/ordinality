import type { Migration } from './Migration';
import { MigrationRunner } from './MigrationRunner';
import { InMemoryStorage } from './storage/InMemoryStorage';

describe.sequential('basic migration use case', () => {
	let targetState = 0;
	const migrations = [
		{
			uid: '1',
			apply: vi.fn(async () => {
				targetState = 1;
			}),
		},
		{
			uid: '2',
			apply: vi.fn(async () => {
				targetState = 2;
			}),
		},
		{
			uid: '3',
			apply: vi.fn(async () => {
				targetState = 3;
			}),
		},
	] satisfies Migration[];

	const context = { secret: Math.random() };

	const storage = new InMemoryStorage();
	const runner = new MigrationRunner({
		storage,
		migrations,
		context,
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('all migrations executes in first run', async () => {
		await expect(runner.up()).resolves.toEqual(['1', '2', '3']);

		// Every migration has been called with context
		migrations.every(({ apply }) => expect(apply.mock.calls).toEqual([[context]]));

		// Data changed correctly
		expect(targetState).toBe(3);
	});

	test('no migrations executes later', async () => {
		await expect(runner.up()).resolves.toEqual([]);

		// Every migration has been called with context
		migrations.every(({ apply }) => expect(apply).not.toHaveBeenCalled());

		// Data has not been modified
		expect(targetState).toBe(3);
	});

	test('error thrown if state have more steps than migrations list number', async () => {
		const state = await storage.list();

		const anotherStorage = new InMemoryStorage(
			new Set([...state, 'non exists migration']),
		);
		const runner = new MigrationRunner<{ secret: number }>({
			storage: anotherStorage,
			migrations,
			context,
		});

		await expect(runner.up()).rejects.toThrowError(
			'Applied migrations list is larger than provided migrations list',
		);
	});

	test('error thrown if state migrations names sequences does not match', async () => {
		const state = await storage.list();
		const anotherStorage = new InMemoryStorage(new Set(state.reverse()));
		const runner = new MigrationRunner<{ secret: number }>({
			storage: anotherStorage,
			migrations,
			context,
		});

		await expect(runner.up()).rejects.toThrowError(
			'Migration #1 with id "1" does not match an applied migration name "3"',
		);
	});

	test('error thrown when provided migrations with the same name', async () => {
		const runner = new MigrationRunner<{ secret: number }>({
			storage,
			context,
			migrations: [
				...migrations,
				{
					uid: '3',
					apply: vi.fn(async () => {
						targetState = 3;
					}),
				},
			],
		});

		await expect(runner.up()).rejects.toThrowError(
			'Migrations list contains entries with duplicate identifiers',
		);
	});

	test('only new migrations runs when added', async () => {
		const newMigrations = [
			{
				uid: '4',
				apply: vi.fn(async () => {
					targetState = 4;
				}),
			},
			{
				uid: '5',
				apply: vi.fn(async () => {
					targetState = 5;
				}),
			},
		] satisfies Migration[];

		const previousMigrationsSlice = migrations.slice();
		migrations.push(...newMigrations);

		await expect(runner.up()).resolves.toEqual(['4', '5']);

		// Every new migration has been called with context
		newMigrations.every(({ apply }) => expect(apply.mock.calls).toEqual([[context]]));

		// Previous migrations has not been called
		previousMigrationsSlice.every(({ apply }) => expect(apply).not.toBeCalled());

		// Data changed correctly
		expect(targetState).toBe(5);
	});

	test('exception while running will stop a migration process', async () => {
		const newMigrations = [
			{
				uid: '6',
				apply: vi.fn(async () => {
					throw new Error('Test error');
				}),
			},
			{
				uid: '7',
				apply: vi.fn(async () => {
					targetState = 7;
				}),
			},
		] satisfies Migration[];

		const runner = new MigrationRunner<{ secret: number }>({
			storage,
			context,
			migrations: [...migrations, ...newMigrations],
		});

		await expect(runner.up()).rejects.toThrowError();

		expect(newMigrations[0].apply.mock.calls).toEqual([[context]]);
		expect(newMigrations[1].apply).not.toBeCalled();

		// Previous migrations has not been called
		migrations.every(({ apply }) => expect(apply).not.toBeCalled());

		// Data has not been changed
		expect(targetState).toBe(5);
	});
});

describe.sequential('Migrations with meta', () => {
	type Context = { secret: string };
	type Meta = { hash: string };

	let targetState = 0;
	const migrations = [
		{
			uid: '1',
			meta: { hash: '1' },
			apply: vi.fn(async () => {
				targetState = 1;
			}),
		},
		{
			uid: '2',
			async meta(context) {
				return {
					hash: `2 and context value: ${context.secret}`,
				};
			},
			apply: vi.fn(async () => {
				targetState = 2;
			}),
		},
		{
			uid: '3',
			async meta(context) {
				return {
					hash: `3 and context value: ${context.secret}`,
				};
			},
			apply: vi.fn(async () => {
				targetState = 3;
			}),
		},
	] satisfies Migration<Context, Meta>[];

	test('Storage receive uid and meta', async () => {
		const storage = new InMemoryStorage();
		const logSpy = vi.spyOn(storage, 'log');
		const runner = new MigrationRunner<Context, Meta>({
			storage,
			context: { secret: 'secret' },
			migrations,
		});

		await expect(runner.up()).resolves.toEqual(['1', '2', '3']);

		expect(
			logSpy.mock.calls,
			'Call storage method with uid and meta',
		).toMatchSnapshot();
		expect(targetState).toBe(3);
	});
});

const genDummyMigrations = (count: number) =>
	Array(count)
		.fill(null)
		.map(
			(_, index) =>
				({
					uid: `change#${index + 1}`,
					apply: vi.fn(),
					revert: vi.fn(),
				}) satisfies Migration,
		);

describe('Partial migrations execution with ranges', () => {
	test('Migrate by steps', async () => {
		const storage = new InMemoryStorage();
		const runner = new MigrationRunner({
			storage,
			migrations: genDummyMigrations(10),
		});

		await expect(runner.executed()).resolves.toEqual([]);
		await expect(runner.up({ step: 1 })).resolves.toEqual(['change#1']);
		await expect(runner.executed()).resolves.toEqual(['change#1']);

		await expect(runner.up({ step: 1 })).resolves.toEqual(['change#2']);
		await expect(runner.executed()).resolves.toEqual(['change#1', 'change#2']);

		await expect(runner.up({ step: 3 })).resolves.toEqual([
			'change#3',
			'change#4',
			'change#5',
		]);

		await expect(runner.up({ step: 0 })).resolves.toEqual([]);

		await expect(
			runner.up({
				step: -10,
			}),
		).rejects.toThrowError('Invalid range: Migration with index -6 does not exist');

		await expect(
			runner.up({
				step: 10,
			}),
		).rejects.toThrowError('Invalid range: Migration with index 14 does not exist');

		await expect(runner.up({ step: 5 })).resolves.toEqual([
			'change#6',
			'change#7',
			'change#8',
			'change#9',
			'change#10',
		]);

		await expect(
			runner.up({
				step: 1,
			}),
		).rejects.toThrowError('Invalid range: Migration with index 10 does not exist');
	});

	test('Migrate by names', async () => {
		const storage = new InMemoryStorage();
		const runner = new MigrationRunner({
			storage,
			migrations: genDummyMigrations(10),
		});

		await expect(runner.executed()).resolves.toEqual([]);
		await expect(runner.up({ to: 'change#1' })).resolves.toEqual(['change#1']);
		await expect(runner.up({ to: 'change#1' })).resolves.toEqual([]);
		await expect(runner.up({ to: 'change#2' })).resolves.toEqual(['change#2']);
		await expect(runner.up({ to: 'change#5' })).resolves.toEqual([
			'change#3',
			'change#4',
			'change#5',
		]);

		await expect(runner.up({ to: 'non exists' })).rejects.toThrowError(
			'Invalid range: Not found migration with name "non exists"',
		);

		await expect(runner.up({ to: 5 })).resolves.toEqual([]);
		await expect(runner.up({ to: 6 })).resolves.toEqual(['change#6']);

		await expect(runner.up({ to: 2 })).rejects.toThrowError(
			'Invalid range: Migration "change#2" is behind of last applied migration',
		);

		await expect(runner.up({ to: 10 })).resolves.toEqual([
			'change#7',
			'change#8',
			'change#9',
			'change#10',
		]);
		await expect(runner.up({ to: 10 })).resolves.toEqual([]);
	});

	test('Revert migrations by steps', async () => {
		const storage = new InMemoryStorage();
		const runner = new MigrationRunner({
			storage,
			migrations: genDummyMigrations(10),
		});

		await expect(runner.executed()).resolves.toEqual([]);
		await expect(runner.up(), 'Execute migrations').resolves.toHaveLength(10);
		await expect(runner.down({ step: 1 })).resolves.toEqual(['change#10']);
		await expect(runner.down({ step: 1 })).resolves.toEqual(['change#9']);
		await expect(runner.down({ step: 3 })).resolves.toEqual([
			'change#8',
			'change#7',
			'change#6',
		]);
		await expect(runner.down({ step: 0 })).resolves.toEqual([]);

		await expect(runner.down({ step: 10 })).rejects.toThrowError(
			'Invalid range: Migration with index -5 does not exist',
		);
		await expect(runner.down({ step: -10 })).rejects.toThrowError(
			'Invalid range: Migration with index 15 does not exist',
		);

		await expect(runner.down({ step: 5 })).resolves.toEqual([
			'change#5',
			'change#4',
			'change#3',
			'change#2',
			'change#1',
		]);

		await expect(runner.down({ step: 0 })).resolves.toEqual([]);
	});

	test('Revert migrations by names', async () => {
		const storage = new InMemoryStorage();
		const runner = new MigrationRunner({
			storage,
			migrations: genDummyMigrations(10),
		});

		await expect(runner.executed()).resolves.toEqual([]);
		await expect(runner.up(), 'Execute migrations').resolves.toHaveLength(10);

		await expect(
			runner.down({ to: 'change#10' }),
			'rollback up to current makes no changes',
		).resolves.toEqual([]);

		await expect(
			runner.down({ to: 'change#9' }),
			'rollback to previous migration',
		).resolves.toEqual(['change#10']);
		await expect(
			runner.down({ to: 'change#9' }),
			'rollback up to current makes no changes',
		).resolves.toEqual([]);

		await expect(
			runner.down({ to: 'change#6' }),
			'rollback up to specific migration',
		).resolves.toEqual(['change#9', 'change#8', 'change#7']);

		await expect(
			runner.down({ to: 5 }),
			'rollback up to migration number',
		).resolves.toEqual(['change#6']);
		await expect(
			runner.down({ to: 5 }),
			'rollback up to current migration number makes no changes',
		).resolves.toEqual([]);

		await expect(
			runner.down({ to: 6 }),
			'rollback to not applied migration is not possible',
		).rejects.toThrowError('Invalid range: Migration "change#7" is not applied yet');
		await expect(
			runner.down({ to: 9 }),
			'rollback to not applied migration is not possible',
		).rejects.toThrowError('Invalid range: Migration "change#10" is not applied yet');

		await expect(
			runner.down({ to: 10 }),
			'rollback to non exist migration is not possible',
		).rejects.toThrowError('Invalid range: Migration with index 10 does not exist');
		await expect(
			runner.down({ to: -10 }),
			'rollback to non exist migration is not possible',
		).rejects.toThrowError('Invalid range: Migration with index -10 does not exist');

		await expect(runner.down({ to: 0 }), 'rollback all migrations').resolves.toEqual([
			'change#5',
			'change#4',
			'change#3',
			'change#2',
			'change#1',
		]);
		await expect(
			runner.down({ to: 0 }),
			'rollback up to current makes no changes',
		).resolves.toEqual([]);
	});

	test('Attempt to rollback migration with no "revert" method throws error', async () => {
		const migrations = genDummyMigrations(10) as Migration[];
		delete migrations[8].revert;

		const storage = new InMemoryStorage();
		const runner = new MigrationRunner({
			storage,
			migrations,
		});

		await expect(runner.executed()).resolves.toEqual([]);
		await expect(runner.up(), 'Execute migrations').resolves.toHaveLength(10);
		await expect(runner.executed()).resolves.toEqual([
			'change#1',
			'change#2',
			'change#3',
			'change#4',
			'change#5',
			'change#6',
			'change#7',
			'change#8',
			'change#9',
			'change#10',
		]);

		await expect(
			runner.down({ to: 'change#5' }),
			'rollback up to current makes no changes',
		).rejects.toThrowError(
			'Migration "change#9" cannot be reverted because have no "revert" method',
		);

		await expect(runner.executed()).resolves.toEqual([
			'change#1',
			'change#2',
			'change#3',
			'change#4',
			'change#5',
			'change#6',
			'change#7',
			'change#8',
			'change#9',
		]);
	});
});
