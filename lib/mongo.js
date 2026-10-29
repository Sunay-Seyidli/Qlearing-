/*
 * MongoDB bağlantısı (Vercel serverless için önbellekli).
 * Bağlantı dizesi yalnızca ortam değişkeninden okunur, koda gömülmez.
 */
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "xox";

const cache = global._xoxMongo || (global._xoxMongo = { promise: null });

async function getDb() {
  if (!uri) throw new Error("MONGODB_URI ortam değişkeni tanımlı değil");
  if (!cache.promise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    cache.promise = client.connect().catch(err => {
      cache.promise = null;
      throw err;
    });
  }
  const client = await cache.promise;
  return client.db(dbName);
}

module.exports = { getDb };
