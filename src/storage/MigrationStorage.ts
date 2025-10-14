import { MigrationContext } from '../Migration';

export interface MigrationStorage<C extends MigrationContext<any, any>> {
	/**
	 * Log applied migration
	 * @param uid unique id of migration
	 * @param context information related to migration
	 */
	log(uid: string, context: C): Promise<void>;

	/**
	 * Delete applied migration from log
	 * @param uid unique id of migration
	 * @param context information related to migration
	 */
	unlog(uid: string, context: C): Promise<void>;

	/**
	 * Returns list with id of applied migrations
	 */
	list(context: Pick<C, 'context'>): Promise<string[]>;
}
