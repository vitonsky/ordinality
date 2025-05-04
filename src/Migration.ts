export interface Migration<T = void> {
	readonly uid: string;
	apply(context: T): Promise<void>;
}
