import connectDb from '../../utils/connectDb'
import collection from '../../models/run'
import calculatePace from '../../utils/calculatePace'

export default async function averagePace(req, res) {
  try {
    await connectDb()
    const [{ totalDistance, totalTime }] = await collection.aggregate([
      {
        $group: {
          _id: null,
          totalDistance: { $sum: '$distance' },
          totalTime: { $sum: '$time' },
        },
      },
    ])

    const averagePace = calculatePace(totalTime, totalDistance)

    res.statusCode = 200
    res.json({ averagePace })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
