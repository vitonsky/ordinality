[![](https://img.shields.io/npm/v/ordinality.svg)](https://www.npmjs.com/package/ordinality) ![](https://github.com/vitonsky/ordinality/actions/workflows/codeql-analysis.yml/badge.svg)

Ordinality is a framework-agnostic migration tool for any JavaScript environment. It provides a clean API for running and rolling back tasks.

# Features

- Database agnostic
- Work with any JavaScript environment - Node, Browser, WebWorker, etc.
- Supports multiple storages for migration data
- Programmatic API for migrations

# Minimal example

The following minimal example uses [PGlite database](https://pglite.dev/) and persistent the migration data in the database itself.

```ts
import { MigrationRunner, getSQLCompilerPreset, SQLStorage } from 'ordinality';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migrations = new MigrationRunner({
  context: { db },
  // You may use one of included storage implementation, or implement custom storage
  // Here we use SQLStorage to persist migration data in any SQL-like storage
  storage: new SQLStorage({
    // You may use SQL query compiler for you DB
    // by preset name like sqlite,mysql,postgres
    compiler: getSQLCompilerPreset('postgres'),

    // SQLStorage require a `query` method implementation, to run queries on DB.
    // This method receive query and bindings, and return an array of rows.
    async query(query, bindings) {
      const { rows } = await db.query(query, bindings);
      return rows as Record<string, any>[];
    }
  }),
  migrations: [
    {
      uid: 'add_notes_table',
      // Context is passed to every migration as first argument
      apply: async ({ context: { db } }) =>
        db.exec(`CREATE TABLE "notes" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
          "title" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "visible" BOOLEAN DEFAULT true
        )`),
      // Optionally, migration object may provide method to revert migration
      revert: async ({ context: { db } }) => db.exec(`DROP TABLE "notes"`),
    },
  ],
});

// Checks migrations and run them if they are not already applied.
// To keep track of the executed migrations, a table called `schema_migrations`
// will be automatically created (if it doesn't exist already) and parsed.
await migrations.up();
```

# Usage

Ordinality is built to run on any environment, including Node, Browser, WebWorker, etc.

Examples in docs use imports from `ordinality`, but in production code you should use specific imports like `ordinality/MigrationRunner`, `ordinality/storage/SQLStorage`, etc. This way ensure you will import only code you really use on project, and it also decrease bundle size.

In case you will use imports from `ordinality`, you may have errors like `fs module not found` if your target is browser, and your bundler is not configured to aggressive tree shaking.

## Installation

Install package via `npm install ordinality`

## Migration runner

Migrations runner is a class purposed to manage migrations state to apply/revert migrations and fetch executed/pending migration names lists.

```ts
const migrations = new MigrationRunner({ /* options */ });
```

### Getting all pending migrations

You can get a list of pending (i.e. not yet executed) migrations with the `pending()` method:

```ts
const migrationNames = await migrations.pending()
// returns an array of all pending migrations.
```

### Getting all executed migrations

You can get a list of already executed migrations with the `executed()` method:

```ts
const migrationNames = await migrations.executed()
// returns an array of all already executed migrations
```

### Executing pending migrations

The `up` method can be used to execute all pending migrations.

```ts
const migrations = await migrations.up()
// returns an array of all executed migrations
```

It is also possible to pass the name of a migration in order to just run the migrations from the current state to the passed migration name (inclusive).

```ts
await migrations.up({to: '20141101203500-task'})
```

To limit the number of migrations that are run, `step` parameter can be used:

```ts
// This will run the next two migrations
await migrations.up({step: 2})
```

Note that **migrations order is very important**. In case any mismatch will be detected in order of applied migrations and provided migrations or its ids - all methods will throw an error and do not any actions, to prevent corruption of your data.

### Reverting executed migration

The `down` method can be used to revert the last executed migration.

```ts
const migration = await migrations.down()
// reverts the last migration and returns it.
```

To revert more than one migration, you can use `step` parameter:

```ts
// This will revert the last two migrations
await migrations.down({step: 2})
```

It is possible to pass the name of a migration until which (exclusive) the migrations should be reverted. This allows the reverting of multiple migrations at once.

```ts
const migrations = await migrations.down({to: '20141031080000-task'})
// returns an array of all reverted migrations up to `20141031080000-task` but not including it.
```

To revert all migrations, you can pass 0 as the `to` parameter:

```ts
await migrations.down({to: 0})
```

## Migrations

Migration is just an object that define an unique migration name, migration meta information, and implements methods to apply and (optionally) to revert migration.

The formal definition is

```ts
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
```

You may pass migrations manually as in examples before

```ts
const migrations = new MigrationRunner({
  /* Another options... */
  migrations: [
    {
      uid: 'add_notes_table',
      // Context is passed to every migration as first argument
      apply: async ({ context: { db } }) =>
        db.exec(`CREATE TABLE "notes" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
          "title" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "visible" BOOLEAN DEFAULT true
        )`),
      // Optionally, migration object may provide method to revert migration
      revert: async ({ context: { db } }) => db.exec(`DROP TABLE "notes"`),
    },
  ],
});
```

or generate migrations with an idiomatic way for your project

```ts
import { Migration } from 'ordinality';

type DBMigration = Migration<{
  db: PGLite;
}>;

/**
 * Convert import from .sql file to a migration that run the SQL queries in transaction
 *
 * Transaction is automatically commit on success and roll back on error
 */
export async function convertSQLToMigrationObject(
  uid: string,
  module: Promise<typeof import('*.sql')>,
): Promise<DBMigration> {
  const { default: sql } = await module;

  return {
    uid,
    apply: async ({ context: { db } }) =>
      db.transaction(async (tx) => {
        await tx.exec(sql);
      }),
  };
}

export const getMigrationsList = async (): Promise<DBMigration[]> =>
  Promise.all([
    // This code implies your bundler configured to return content of `.sql` files as a string
    convertSQLToMigrationObject('init_db', import('./sql/init_db.sql')),
    convertSQLToMigrationObject('add_notes_table', import('./sql/add_notes_table.sql')),
    convertSQLToMigrationObject('add_workspaces_table', import('./sql/add_workspaces_table.sql')),
  ]);

const migrations = new MigrationRunner({
  /* Another options... */
  migrations: await getMigrationsList(),
});
```

Logic of migrations fetching is highly depends on a project design, so your code may fetch SQL files, or import JavaScript files to build migrations array.

This package does not provide any helpers to do it, to exclude dependencies that will not be used by most of package users.

## Storage

The migrations storage purpose is to keep log of executed migrations and its order.

Some default storage implementations is included

### InMemoryStorage

Keep migrations data in RAM. Purposed to use in temporary environments and tests.


```ts
import { MigrationRunner, InMemoryStorage } from 'ordinality';

const migrations = new MigrationRunner({
  /* Another options... */
  storage: new InMemoryStorage(),
});
```


### MigrationFileStorage

Keep data in files, using Node `fs` API.

```ts
import { MigrationRunner, MigrationFileStorage } from 'ordinality';

const migrations = new MigrationRunner({
  /* Another options... */
  storage: new MigrationFileStorage('./migrations.json'),
});
```

By default state is encoded as JSON string. In case you want to use another format (Yaml, XML, etc), or want to transform/encrypt state file, you may pass `codec` parameter

```ts
import { MigrationRunner, MigrationFileStorage } from 'ordinality';

const migrations = new MigrationRunner({
  /* Another options... */
  storage: new MigrationFileStorage('./migrations.data', {
    codec: {
      encode(data) {
        return encryptObjectToBuffer(data);
      },
      decode(buffer) {
        return decryptBufferToObject(buffer);
      },
    },
  }),
});
```

### SQLStorage

SQL storage keep migration data in any SQL-like storage.

This storage is require to pass
- `compiler`, to build SQL query and bindings
- `query`, an adapter to query your database

Example:

```ts
import { MigrationRunner, SQLStorage, getSQLCompilerPreset } from 'ordinality';
import { PGlite } from '@electric-sql/pglite';

// We use PGlite here, but you may use any database
const db = new PGlite();

const migrations = new MigrationRunner({
  /* Another options... */
  storage: new SQLStorage({
    // You may use SQL query compiler for you DB
    // by preset name like sqlite,mysql,postgres
    compiler: getSQLCompilerPreset('postgres'),

    // SQLStorage require a `query` method implementation, to run queries on DB.
    // This method receive query and bindings, and return an array of rows.
    async query(query, bindings) {
      const { rows } = await db.query(query, bindings);
      return rows as Record<string, any>[];
    }
  }),
});
```

You may use `getSQLCompilerPreset` util to build compiler from preset for your database.

In case you want to tune an SQL compiler for non-standard syntax, you may create it yourself (see [docs for nano-queries](https://www.npmjs.com/package/nano-queries)).

```ts
import { MigrationRunner, SQLStorage, BasicSQLTypes } from 'ordinality';
import { SQLCompiler } from 'nano-queries/compilers/SQLCompiler';
import { PGlite } from '@electric-sql/pglite';

// We use PGlite here, but you may use any database
const db = new PGlite();

const migrations = new MigrationRunner({
  /* Another options... */
  storage: new SQLStorage({
    compiler: new SQLCompiler<BasicSQLTypes>({
      getPlaceholder(valueIndex) {
        // Placeholder compiler for Postgres queries
        return '$' + (valueIndex + 1);
      },
    }),

    // SQLStorage require a `query` method implementation, to run queries on DB.
    // This method receive query and bindings, and return an array of rows.
    async query(query, bindings) {
      const { rows } = await db.query(query, bindings);
      return rows as Record<string, any>[];
    }
  }),
});
```

### Custom storage

You may implement custom storage for your app.

See an example with storage backed by PGlite.

```ts
import { MigrationStorage } from 'ordinality';
import { PGlite } from '@electric-sql/pglite';

/**
 * Custom storage that persists migration names in Postgres DB
 */
export class PostgresMigrationsStorage<C extends MigrationContext<any, any>> implements MigrationStorage<C> {
  constructor(
    private readonly db: PGlite,
    private readonly tableName = 'schema_migrations',
  ) { }

  async log(uid: string, _context: C): Promise<void> {
    await this.ensureTable();
    await this.db.query(`INSERT INTO ${this.tableName} (name) VALUES ($1)`, [uid]);
  }

  async unlog(uid: string, _context: C): Promise<void> {
    await this.ensureTable();
    await this.db.query(`DELETE FROM ${this.tableName} WHERE name=$1`, [uid]);
  }

  async list(): Promise<string[]> {
    await this.ensureTable();

    const { rows } = await this.db.query(
      `SELECT name FROM ${this.tableName} ORDER BY executed_at ASC`,
    );
    return rows.map((row: any) => row.name);
  }

  // ensure migrations table exists
  async ensureTable() {
    await this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );`,
    );
  }
}
```

# Development

Join to development. Any contributions are welcome, check [github repo](https://github.com/vitonsky/ordinality/) to file issues  or send pull requests.

Do you like it? Spread the word about project.