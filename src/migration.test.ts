import { InMemoryStorage } from './InMemoryStorage';
import { Migration } from './Migration';
import { MigrationsRunner } from './MigrationsRunner';

test('basic migration test', async () => {
	let x = 0;
	const migrations = [
		{
			uid: '1',
			apply: vi.fn(async () => {
				x = 1;
			}),
		},
		{
			uid: '2',
			apply: vi.fn(async () => {
				x = 2;
			}),
		},
		{
			uid: '3',
			apply: vi.fn(async () => {
				x = 3;
			}),
		},
	] satisfies Migration[];

	const storage = new InMemoryStorage();
	const runner = new MigrationsRunner<{ secret: number }>(storage, migrations);

	const context = { secret: Math.random() };
	await runner.migrateAll(context);

	migrations.every(({ apply }) => expect(apply.mock.calls).toEqual([[context]]));

	expect(x).toBe(3);
});
