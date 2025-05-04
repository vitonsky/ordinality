export type MigrationsState = { migrations: string[] };

// TODO: Add in-memory implementation for tests
export interface MigrationStorage {
	getState(): Promise<MigrationsState>;
	push(uid: string): Promise<void>;
}
