import dayjs from 'dayjs'
import { NextApiRequest, NextApiResponse } from 'next'

import addActivity from '../../utils/addActivity'
import connectToDatabase from '../../utils/connectToDatabase'
import strava from '../../utils/strava'

type Query = {
  after?: string
  page?: string
  per_page?: string
}

const sync = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const collection = await connectToDatabase()

    let { after }: Query = req.query
    if (!after) {
      const [{ date }] = await collection
        .find({}, { sort: { date: -1 } })
        .toArray()
      after = date
    }
    after = dayjs(after).unix().toString()

    const { page, per_page }: Query = req.query
    const activities = await strava.activities.getLoggedInAthleteActivities({
      after: Number(after),
      page: Number(page),
      per_page: Number(per_page),
    })
    const { fulfilled, rejected, errors } = await Promise.allSettled(
      activities.map(addActivity),
    ).then(result =>
      result.reduce(
        (
          acc: { fulfilled: number; rejected: number; errors: string[] },
          current,
        ) => {
          if (current.status === 'fulfilled') acc.fulfilled += 1
          if (current.status === 'rejected') {
            acc.rejected += 1
            acc.errors = [...acc.errors, current.reason?.message]
          }
          return acc
        },
        { fulfilled: 0, rejected: 0, errors: [] },
      ),
    )

    return res
      .status(200)
      .json({ message: `${fulfilled} ok, ${rejected} not ok`, errors })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
}

export default sync
