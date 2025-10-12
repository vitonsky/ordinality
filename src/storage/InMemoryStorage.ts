import { MigrationStorage } from './MigrationStorage';

export class InMemoryStorage<M = void> implements MigrationStorage<M> {
	constructor(private readonly state: Set<string> = new Set()) {}

	async list(): Promise<string[]> {
		return Array.from(this.state);
	}

	async log(uid: string): Promise<void> {
		this.state.add(uid);
	}
}
