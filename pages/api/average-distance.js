import connectDb from '../../utils/connectDb'
import collection from '../../models/run'

export default async function averageDistance(req, res) {
  try {
    await connectDb()
    const [{ averageDistance }] = await collection.aggregate([
      {
        $group: {
          _id: null,
          averageDistance: { $avg: '$distance' },
        },
      },
    ])

    res.statusCode = 200
    res.json({ averageDistance })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
