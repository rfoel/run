import { MongoClient } from 'mongodb'

const { RUN_MONGODB_URI, RUN_MONGODB_DB } = process.env

let cached = global.mongo
if (!cached) cached = global.mongo = {}

export async function connectToDatabase() {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    const conn = {}

    const opts = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }

    cached.promise = MongoClient.connect(RUN_MONGODB_URI, opts)
      .then(client => {
        conn.client = client
        return client.db(RUN_MONGODB_DB)
      })
      .then(db => {
        conn.db = db
        cached.conn = conn
      })
  }

  await cached.promise

  return cached.conn
}
