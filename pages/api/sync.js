import dayjs from 'dayjs'

import addRun from '../../utils/addRun'
import connectDb from '../../utils/connectDb'
import collection from '../../models/run'
import getLoggedInAthleteActivities from '../../utils/strava/getLoggedInAthleteActivities'

export default async function sync(req, res) {
  try {
    await connectDb()
    const { query } = req
    let after = query.after
    if (!after) {
      const [{ date }] = await collection.find({}, {}, { sort: { date: -1 } })
      after = dayjs(date).unix()
    }
    const activities = await getLoggedInAthleteActivities({
      after,
      per_page: 100,
    })
    await Promise.all(activities.map(addRun))

    res.statusCode = 201
    res.json({ message: `${activities.length} activities successfully synced` })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
