import { NextApiRequest, NextApiResponse } from 'next'
import dayjs from 'dayjs'

import connectToDatabase from '../../utils/connectToDatabase'
import { Period } from '../../models'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const collection = await connectToDatabase()

    const { start, end }: Period = req.query

    const runs = await collection
      .find(
        {
          date: {
            $gte: dayjs(start).toDate(),
            $lte: dayjs(end).toDate(),
          },
        },
        { sort: { day: -1 } },
      )
      .toArray()

    return res.json({ runs })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
