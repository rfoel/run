import { NextApiRequest, NextApiResponse } from 'next'

import connectToDatabase from '../../utils/connectToDatabase'

const handler = async (
  _req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> => {
  try {
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

    return res.json(years.map(({ _id: year }): number => year))
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
