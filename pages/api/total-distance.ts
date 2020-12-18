import { NextApiRequest, NextApiResponse } from 'next'
import dayjs from 'dayjs'

import connectToDatabase from '../../utils/connectToDatabase'
import { Period } from '../../models'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { start, end }: Period = req.query

    const collection = await connectToDatabase()
    const [{ totalDistance }] = await collection
      .aggregate([
        {
          $match: {
            date: {
              $gte: dayjs(start).startOf('day').toDate(),
              $lte: dayjs(end).startOf('day').toDate(),
            },
          },
        },
        {
          $group: {
            _id: null,
            totalDistance: { $sum: '$distance' },
          },
        },
      ])
      .toArray()

    return res.json({ totalDistance })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
