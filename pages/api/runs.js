import connectDb from '../../utils/middlewares/connectDb'
import collection from '../../models/run'

const runs = async (req, res) => {
  try {
    const {
      query: { limit = 1, skip = 0 },
    } = req

    const runs = await collection.find(
      {},
      {},
      { limit: Number(limit), skip: Number(skip), sort: { day: -1 } },
    )

    res.status(200).json(runs)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default connectDb(runs)
