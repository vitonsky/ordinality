import { MigrationContext } from '../Migration';
import type { MigrationStorage } from './MigrationStorage';

export class InMemoryStorage<C extends MigrationContext<any, any>>
	implements MigrationStorage<C>
{
	constructor(private readonly state: Set<string> = new Set()) {}

	async list(): Promise<string[]> {
		return Array.from(this.state);
	}

	async log(uid: string): Promise<void> {
		this.state.add(uid);
	}

	async unlog(uid: string): Promise<void> {
		this.state.delete(uid);
	}
}
