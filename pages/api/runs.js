import connectDb from '../../utils/connectDb'
import collection from '../../models/run'

export default async function runs(req, res) {
  try {
    await connectDb()
    const runs = await collection.find({}, {}, { limit: 10, sort: { day: -1 } })

    res.statusCode = 200
    res.json({ runs })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
