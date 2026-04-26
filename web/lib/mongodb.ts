import { MongoClient, type Collection, type Db, type Document } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "spotter";

type GlobalWithMongo = typeof globalThis & {
  _spotterMongoClientPromiseV2?: Promise<MongoClient>;
};

function getClientPromise() {
  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  const globalForMongo = globalThis as GlobalWithMongo;

  if (!globalForMongo._spotterMongoClientPromiseV2) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    globalForMongo._spotterMongoClientPromiseV2 = client.connect().catch((error) => {
      delete globalForMongo._spotterMongoClientPromiseV2;
      throw error;
    });
  }

  return globalForMongo._spotterMongoClientPromiseV2;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}

export async function getCollection<T extends Document = Document>(
  name: string,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export function isMongoConfigured() {
  return Boolean(uri);
}

export function mongoConfigError() {
  return {
    configured: false,
    error: "Set MONGODB_URI to your MongoDB Atlas connection string.",
  };
}
