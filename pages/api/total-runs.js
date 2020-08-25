import connectDb from '../../utils/middlewares/connectDb'
import collection from '../../models/run'

const totalRuns = async (req, res) => {
  try {
    const totalRuns = await collection.countDocuments()

    res.status(200).json(totalRuns)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

export default connectDb(totalRuns)
