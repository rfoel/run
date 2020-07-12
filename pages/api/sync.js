import dayjs from 'dayjs'

import addRun from '../../utils/addRun'
import connectDb from '../../utils/connectDb'
import collection from '../../models/run'
import getLoggedInAthleteActivities from '../../utils/strava/getLoggedInAthleteActivities'

export default async function sync(req, res) {
  try {
    await connectDb()
    const [{ date }] = await collection.find({}, {}, { sort: { date: -1 } })
    const after = dayjs(date).unix()
    const activities = await getLoggedInAthleteActivities({
      after,
      per_page: 80,
    })
    await Promise.all(activities.map(addRun))

    res.statusCode = 200
    res.json({ message: `${activities.length} activities successfully synced` })
  } catch (err) {
    res.statusCode = 500
    res.json({ message: err.message })
  }
}
