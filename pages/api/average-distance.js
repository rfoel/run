import connectDb from '../../utils/middlewares/connectDb'
import collection from '../../models/run'

const averageDistance = async (req, res) => {
  try {
    const [{ averageDistance }] = await collection.aggregate([
      {
        $group: {
          _id: null,
          averageDistance: { $avg: '$distance' },
        },
      },
    ])

    res.status(200).json({ averageDistance })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default connectDb(averageDistance)
