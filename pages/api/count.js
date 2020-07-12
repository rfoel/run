import connectDb from '../../utils/connectDb'
import collection from '../../models/run'

export default async function count(req, res) {
  try {
    await connectDb()
    const count = await collection.countDocuments()
    res.statusCode = 200
    res.json({ count })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
