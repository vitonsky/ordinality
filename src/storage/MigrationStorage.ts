export type MigrationsState = { migrations: string[] };

export interface MigrationStorage<Meta = void> {
	getState(): Promise<MigrationsState>;

	log(uid: string, meta: Meta): Promise<void>;
}
