import { Collection, MongoClient } from 'mongodb'

let collection: Collection

const connectToDatabase = async (): Promise<Collection> => {
  if (!collection) {
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
    const uri: string = process.env.RUN_MONGODB_URI

    const client = await MongoClient.connect(uri, options)
    const db = await client.db('run')
    collection = db.collection('runs')
  }

  return collection
}

export default connectToDatabase
