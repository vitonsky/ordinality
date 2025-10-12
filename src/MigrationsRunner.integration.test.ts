import { Migration } from './Migration';
import { MigrationsRunner } from './MigrationsRunner';
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
	const runner = new MigrationsRunner<{ secret: number }>(storage, migrations);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('all migrations executes in first run', async () => {
		await expect(runner.migrateAll(context)).resolves.toEqual(['1', '2', '3']);

		// Every migration has been called with context
		migrations.every(({ apply }) => expect(apply.mock.calls).toEqual([[context]]));

		// Data changed correctly
		expect(targetState).toBe(3);
	});

	test('no migrations executes later', async () => {
		await expect(runner.migrateAll(context)).resolves.toEqual([]);

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
		const runner = new MigrationsRunner<{ secret: number }>(
			anotherStorage,
			migrations,
		);

		await expect(runner.migrateAll(context)).rejects.toThrowError(
			'Applied migrations list is larger than provided migrations list',
		);
	});

	test('error thrown if state migrations names sequences does not match', async () => {
		const state = await storage.list();
		const anotherStorage = new InMemoryStorage(new Set(state.reverse()));
		const runner = new MigrationsRunner<{ secret: number }>(
			anotherStorage,
			migrations,
		);

		await expect(runner.migrateAll(context)).rejects.toThrowError(
			'Migration uid does not match for transaction #1',
		);
	});

	test('error thrown when provided migrations with the same name', async () => {
		const runner = new MigrationsRunner<{ secret: number }>(storage, [
			...migrations,
			{
				uid: '3',
				apply: vi.fn(async () => {
					targetState = 3;
				}),
			},
		]);

		await expect(runner.migrateAll(context)).rejects.toThrowError(
			'Migrations list contains entries with the same identifiers',
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

		await expect(runner.migrateAll(context)).resolves.toEqual(['4', '5']);

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

		const runner = new MigrationsRunner<{ secret: number }>(storage, [
			...migrations,
			...newMigrations,
		]);

		await expect(runner.migrateAll(context)).rejects.toThrowError();

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
		const runner = new MigrationsRunner<Context, Meta>(storage, migrations);

		await expect(runner.migrateAll({ secret: 'secret' })).resolves.toEqual([
			'1',
			'2',
			'3',
		]);

		expect(
			logSpy.mock.calls,
			'Call storage method with uid and meta',
		).toMatchSnapshot();
		expect(targetState).toBe(3);
	});
});
