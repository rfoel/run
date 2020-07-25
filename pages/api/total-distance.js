import connectDb from '../../utils/connectDb'
import collection from '../../models/run'

export default async function totalDistance(req, res) {
  try {
    await connectDb()
    const [{ totalDistance }] = await collection.aggregate([
      {
        $group: {
          _id: null,
          totalDistance: { $sum: '$distance' },
        },
      },
    ])

    res.statusCode = 200
    res.json({ totalDistance })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
