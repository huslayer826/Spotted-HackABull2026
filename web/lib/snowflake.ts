import snowflake from "snowflake-sdk";

type SnowflakeConfig = {
  account: string;
  username: string;
  password: string;
  warehouse: string;
  database: string;
  schema: string;
  role?: string;
};

function readConfig(): SnowflakeConfig | null {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USERNAME;
  const password = process.env.SNOWFLAKE_PASSWORD;
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE;
  const database = process.env.SNOWFLAKE_DATABASE || "SPOTTER";
  const schema = process.env.SNOWFLAKE_SCHEMA || "ANALYTICS";
  const role = process.env.SNOWFLAKE_ROLE;

  if (!account || !username || !password || !warehouse) {
    return null;
  }

  return { account, username, password, warehouse, database, schema, role };
}

export function isSnowflakeConfigured() {
  return Boolean(readConfig());
}

export function snowflakeConfigError() {
  return {
    configured: false,
    error:
      "Set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD, and SNOWFLAKE_WAREHOUSE.",
  };
}

function connect(config: SnowflakeConfig) {
  const connection = snowflake.createConnection({
    account: config.account,
    username: config.username,
    password: config.password,
    warehouse: config.warehouse,
    database: config.database,
    schema: config.schema,
    role: config.role,
  });

  return new Promise<snowflake.Connection>((resolve, reject) => {
    connection.connect((error) => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
}

export async function executeSnowflake<T = Record<string, unknown>>(
  sqlText: string,
  binds: snowflake.Binds = [],
): Promise<T[]> {
  const config = readConfig();
  if (!config) {
    throw new Error(snowflakeConfigError().error);
  }

  const connection = await connect(config);

  try {
    return await new Promise<T[]>((resolve, reject) => {
      connection.execute({
        sqlText,
        binds,
        complete(error, _statement, rows) {
          if (error) reject(error);
          else resolve((rows || []) as T[]);
        },
      });
    });
  } finally {
    connection.destroy(() => undefined);
  }
}

export async function pingSnowflake() {
  const rows = await executeSnowflake<{ OK?: number; ok?: number }>(
    "SELECT 1 AS ok",
  );
  return rows[0]?.OK === 1 || rows[0]?.ok === 1;
}
