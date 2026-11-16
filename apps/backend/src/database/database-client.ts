export type PoolLike = unknown;
export type DatabaseClient<TDb = unknown, TPool = PoolLike> = {
  db: TDb;
  pool: TPool;
  onModuleDestroy(): Promise<void>;
};

export type DatabaseClientFactoryOptions<TDb, TPool> = {
  PoolCtor: new (options: { connectionString: string }) => TPool;
  drizzleFactory: (pool: TPool, options: { casing: "snake_case" }) => TDb;
};

export function createDatabaseClient<TDb, TPool>(
  databaseUrl: string,
  options: DatabaseClientFactoryOptions<TDb, TPool>,
): DatabaseClient<TDb, TPool> {
  const pool = new options.PoolCtor({ connectionString: databaseUrl });
  const managedPool = pool as { end?: () => Promise<unknown>; on?: (event: string, listener: () => void) => unknown };
  managedPool.on?.("error", () => {
    // Idle connection errors must not become an unhandled EventEmitter error.
    // Individual queries still reject; omit connection details and credentials.
    console.error("Database idle connection failed");
  });
  let closed = false;
  return {
    pool,
    db: options.drizzleFactory(pool, { casing: "snake_case" }),
    async onModuleDestroy() {
      if (!closed) {
        closed = true;
        await managedPool.end?.();
      }
    },
  };
}
