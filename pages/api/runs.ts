import { NextApiRequest, NextApiResponse } from 'next'

import { connectToDatabase } from '../util/mongodb'

const handler = (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { client } = connectToDatabase()

    res.status(200).json(sampleUserData)
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: err.message })
  }
}

export default handler
