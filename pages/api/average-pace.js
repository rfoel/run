import connectDb from '../../utils/middlewares/connectDb'
import collection from '../../models/run'
import calculatePace from '../../utils/calculatePace'

const averagePace = async (req, res) => {
  try {
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

    res.status(200).json({ averagePace })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default connectDb(averagePace)
