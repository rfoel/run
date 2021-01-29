import { NextApiRequest, NextApiResponse } from 'next'
import dayjs from 'dayjs'

import calculatePace from '../../utils/calculatePace'
import connectToDatabase from '../../utils/connectToDatabase'
import { Period } from '../../models'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { start, end }: Period = req.query

    const collection = await connectToDatabase()
    const [
      { totalDistance, totalTime } = { totalDistance: 0, totalTime: 0 },
    ] = await collection
      .aggregate([
        {
          $match: {
            date: {
              $gte: dayjs(start).startOf('day').toDate(),
              $lte: dayjs(end).endOf('day').toDate(),
            },
          },
        },
        {
          $group: {
            _id: null,
            totalDistance: { $sum: '$distance' },
            totalTime: { $sum: '$time' },
          },
        },
      ])
      .toArray()

    const averagePace = calculatePace(totalDistance, totalTime)

    return res.json(averagePace)
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
