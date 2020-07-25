import connectDb from '../../utils/connectDb'
import collection from '../../models/run'

export default async function totalRuns(req, res) {
  try {
    await connectDb()
    const totalRuns = await collection.countDocuments()

    res.statusCode = 200
    res.json({ totalRuns })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
