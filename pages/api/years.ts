import { NextApiRequest, NextApiResponse } from 'next'
import dayjs from 'dayjs'

import connectToDatabase from '../../utils/connectToDatabase'

export const getYears = async () => {
  const collection = await connectToDatabase()

  const years = await collection
    .aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y', date: '$date' } },
        },
      },
      { $sort: { _id: -1 } },
    ])
    .toArray()

  return years
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const years = await getYears()

    return res.json({ years: years.map(({ _id: year }) => year) })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
