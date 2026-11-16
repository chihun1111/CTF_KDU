import type { PoolClient } from "pg";

export type PoolLike = unknown;
export type DatabaseClient<TDb = unknown, TPool = PoolLike> = {
  db: TDb;
  pool: TPool;
  onModuleDestroy(): Promise<void>;
};

export type DatabaseClientFactoryOptions<TDb, TPool> = {
  PoolCtor: new (options: { connectionString: string } & typeof DATABASE_POOL_LIMITS) => TPool;
  drizzleFactory: (connection: TPool | PoolClient, options: { casing: "snake_case" }) => TDb;
};

type TransactionalDatabase = {
  transaction(callback: (transaction: unknown) => Promise<unknown>, config?: unknown): Promise<unknown>;
};

function hasTransaction(database: unknown): database is TransactionalDatabase {
  return typeof database === "object" && database !== null && "transaction" in database && typeof database.transaction === "function";
}

export function createDatabaseClient<TDb, TPool>(
  databaseUrl: string,
  options: DatabaseClientFactoryOptions<TDb, TPool>,
): DatabaseClient<TDb, TPool> {
  const pool = new options.PoolCtor({ connectionString: databaseUrl, ...DATABASE_POOL_LIMITS });
  const managedPool = pool as {
    connect?: () => Promise<PoolClient>;
    end?: () => Promise<unknown>;
    on?: (event: string, listener: () => void) => unknown;
  };
  managedPool.on?.("error", () => {
    // Idle connection errors must not become an unhandled EventEmitter error.
    // Individual queries still reject; omit connection details and credentials.
    console.error("Database idle connection failed");
  });
  const db = options.drizzleFactory(pool, { casing: "snake_case" });
  if (hasTransaction(db) && managedPool.connect) {
    const connect = managedPool.connect.bind(managedPool);
    db.transaction = async (callback, config) => {
      const connection = await connect();
      let discard = false;
      const onError = () => { discard = true; };
      connection.on("error", onError);
      try {
        // Drizzle's pool transaction starts BEGIN outside its release finally.
        // Own the connection here so even a failed BEGIN cannot exhaust the pool.
        // A connection-scoped Drizzle instance retains its normal transaction
        // configuration and nested savepoint behavior without acquiring again.
        const connectionDb = options.drizzleFactory(connection, { casing: "snake_case" });
        if (!hasTransaction(connectionDb)) throw new Error("Database transactions are unavailable");
        return await connectionDb.transaction(callback, config);
      } catch (error) {
        // An error may mean the server applied BEGIN/COMMIT but its reply was
        // lost. Never return an uncertain or still-active transaction to the pool.
        discard = true;
        throw error;
      } finally {
        try {
          connection.release(discard);
        } finally {
          connection.removeListener("error", onError);
        }
      }
    };
  }
  let closePromise: Promise<void> | undefined;
  return {
    pool,
    db,
    onModuleDestroy() {
      closePromise ??= Promise.resolve().then(async () => { await managedPool.end?.(); });
      return closePromise;
    },
  };
}
export const DATABASE_POOL_LIMITS = {
  max: 10,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 5_000,
  query_timeout: 7_000,
  idle_in_transaction_session_timeout: 10_000,
} as const;
