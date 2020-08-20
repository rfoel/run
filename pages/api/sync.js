import dayjs from 'dayjs'

import addRun from '../../utils/addRun'
import connectDb from '../../utils/middlewares/connectDb'
import collection from '../../models/run'
import getLoggedInAthleteActivities from '../../utils/strava/getLoggedInAthleteActivities'

const sync = async (req, res) => {
  try {
    const { query } = req
    let after = query.after
    if (!after) {
      const [{ date }] = await collection.find({}, {}, { sort: { date: -1 } })
      after = dayjs(date).unix()
    }
    const { page, per_page } = query
    const activities = await getLoggedInAthleteActivities({
      after,
      page,
      per_page,
    })
    await Promise.all(activities.map(addRun))

    res
      .status(201)
      .json({ message: `${activities.length} activities successfully synced` })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default connectDb(sync)
