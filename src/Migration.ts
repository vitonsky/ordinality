export type MigrationMeta<T, Context> = ((context: Context) => Promise<T>) | T;

export type MigrationContext<Context, Meta> = {
	context: Context;
	meta: Meta;
};

export type Migration<Context = void, Meta = void> = {
	readonly uid: string;

	/**
	 * Method to apply migration
	 */
	apply(context: MigrationContext<Context, Meta>): Promise<void>;

	/**
	 * Optional method to revert migration
	 */
	revert?(context: MigrationContext<Context, Meta>): Promise<void>;
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
