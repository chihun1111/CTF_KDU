export type PoolLike = unknown;
export type DatabaseClient<TDb = unknown, TPool = PoolLike> = {
  db: TDb;
  pool: TPool;
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
  return {
    pool,
    db: options.drizzleFactory(pool, { casing: "snake_case" }),
  };
}
