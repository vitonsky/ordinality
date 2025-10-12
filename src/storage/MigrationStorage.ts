export type MigrationsState = { migrations: string[] };

export interface MigrationStorage {
	getState(): Promise<MigrationsState>;
	push(uid: string): Promise<void>;
}
