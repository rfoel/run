import connectDb from './utils/connectDb'
import { collection } from './models/run'

export const handler = async () => {
  try {
    await connectDb()
    const [{ distance }] = await collection.aggregate([
      {
        $group: {
          _id: null,
          distance: { $avg: '$distance' },
        },
      },
    ])

    return {
      statusCode: 200,
      body: JSON.stringify({ distance }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err.message }),
    }
  }
}
