export interface MigrationStorage<Meta = void> {
	/**
	 * Log applied migration
	 * @param uid unique id of migration
	 * @param meta (optional) additional information related to migration
	 */
	log(uid: string, meta: Meta): Promise<void>;

	/**
	 * Delete applied migration from log
	 * @param uid unique id of migration
	 * @param meta (optional) additional information related to migration
	 */
	unlog(uid: string, meta: Meta): Promise<void>;

	/**
	 * Returns list with id of applied migrations
	 */
	list(): Promise<string[]>;
}
