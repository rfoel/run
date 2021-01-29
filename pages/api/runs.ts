import dayjs from 'dayjs'
import { NextApiRequest, NextApiResponse } from 'next'

import { Period } from '../../models'
import connectToDatabase from '../../utils/connectToDatabase'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const collection = await connectToDatabase()

    const {
      start,
      end,
      limit,
      skip,
    }: Period & { limit?: number; skip?: number } = req.query

    const runs = await collection
      .find(
        {
          date: {
            $gte: dayjs(start).startOf('day').toDate(),
            $lte: dayjs(end).endOf('day').toDate(),
          },
        },
        { sort: { date: -1 }, limit: Number(limit), skip: Number(skip) },
      )
      .toArray()

    return res.json(runs)
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
