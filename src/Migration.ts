type MigrationMeta<T, Context> = ((context: Context) => Promise<T>) | T;

export type Migration<Context = void, Meta = void> = {
	readonly uid: string;

	/**
	 * Method will be called to apply migration
	 */
	apply(context: Context): Promise<void>;
} & (void extends Meta
	? {
			/**
			 * Migration meta
			 */
			meta?: undefined;
		}
	: {
			/**
			 * Migration meta
			 */
			meta: MigrationMeta<Meta, Context>;
		});
