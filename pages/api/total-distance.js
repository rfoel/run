import connectDb from '../../utils/middlewares/connectDb'
import collection from '../../models/run'

const totalDistance = async (req, res) => {
  try {
    const [{ totalDistance }] = await collection.aggregate([
      {
        $group: {
          _id: null,
          totalDistance: { $sum: '$distance' },
        },
      },
    ])

    res.status(200).json({ totalDistance })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default connectDb(totalDistance)
