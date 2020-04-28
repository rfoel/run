import connectDb from './utils/connectDb'
import { collection } from './models/run'

export const handler = async () => {
  try {
    await connectDb()
    const count = await collection.countDocuments()

    return {
      statusCode: 200,
      body: JSON.stringify({ count }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err.message }),
    }
  }
}
