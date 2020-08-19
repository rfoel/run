import connectDb from '../../utils/middlewares/connectDb'
import collection from '../../models/run'

const runs = async (req, res) => {
  try {
    const runs = await collection.find({}, {}, { limit: 10, sort: { day: -1 } })

    res.status(200).json({ runs })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default connectDb(runs)
