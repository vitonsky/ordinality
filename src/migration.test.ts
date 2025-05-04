import { InMemoryStorage } from './InMemoryStorage';
import { Migration } from './Migration';
import { MigrationsRunner } from './MigrationsRunner';

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
		await runner.migrateAll(context);

		// Every migration has been called with context
		migrations.every(({ apply }) => expect(apply.mock.calls).toEqual([[context]]));

		// Data changed correctly
		expect(targetState).toBe(3);
	});

	test('no migrations executes later', async () => {
		await runner.migrateAll(context);

		// Every migration has been called with context
		migrations.every(({ apply }) => expect(apply).not.toHaveBeenCalled());

		// Data has not been modified
		expect(targetState).toBe(3);
	});

	test('error thrown if state have more steps than migrations list number', async () => {
		const state = await storage.getState().then((state) => structuredClone(state));

		const anotherStorage = new InMemoryStorage({
			migrations: [...state.migrations, 'non exists migration'],
		});
		const runner = new MigrationsRunner<{ secret: number }>(
			anotherStorage,
			migrations,
		);

		expect(runner.migrateAll(context)).rejects.toThrowError(
			'Applied migrations list is larger than provided migrations list',
		);
	});

	test('error thrown if state migrations names sequences does not match', async () => {
		const state = await storage.getState().then((state) => structuredClone(state));
		state.migrations.reverse();

		const anotherStorage = new InMemoryStorage(state);
		const runner = new MigrationsRunner<{ secret: number }>(
			anotherStorage,
			migrations,
		);

		expect(runner.migrateAll(context)).rejects.toThrowError(
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

		expect(runner.migrateAll(context)).rejects.toThrowError(
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

		await runner.migrateAll(context);

		// Every new migration has been called with context
		newMigrations.every(({ apply }) => expect(apply.mock.calls).toEqual([[context]]));

		// Previous migrations has not been called
		previousMigrationsSlice.every(({ apply }) => expect(apply).not.toBeCalled());

		// Data changed correctly
		expect(targetState).toBe(5);
	});
});
