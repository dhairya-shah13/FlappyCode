import type { DatabaseSync } from 'node:sqlite';
import { createDatabase, DatabaseOptions } from './database.js';
import { ModelRepo, ProviderRepo } from './repos/provider-repo.js';
import { MessageRepo, SessionRepo } from './repos/session-repo.js';
import { ProjectMemoryRepo, UsageRepo } from './repos/usage-repo.js';

export class FlappyStorage {
  readonly db: DatabaseSync;
  readonly providers: ProviderRepo;
  readonly models: ModelRepo;
  readonly sessions: SessionRepo;
  readonly messages: MessageRepo;
  readonly usage: UsageRepo;
  readonly memory: ProjectMemoryRepo;

  constructor(options: DatabaseOptions = {}) {
    this.db = createDatabase(options);
    this.providers = new ProviderRepo(this.db);
    this.models = new ModelRepo(this.db);
    this.sessions = new SessionRepo(this.db);
    this.messages = new MessageRepo(this.db);
    this.usage = new UsageRepo(this.db);
    this.memory = new ProjectMemoryRepo(this.db);
  }

  close(): void {
    this.db.close();
  }
}
