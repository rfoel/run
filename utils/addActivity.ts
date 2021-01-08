import { SummaryActivity } from 'strava'

import connectToDatabase from './connectToDatabase'
import getDay from './getDay'
import getLocation from './getLocation'
import getWeather from './getWeather'
import { Run } from '../models/run'

const addActivity = async (activity: SummaryActivity): Promise<Run> => {
  const collection = await connectToDatabase()

  const {
    distance,
    id: stravaId,
    moving_time: time,
    name,
    start_date: date,
    start_latitude,
    start_longitude,
    map: { summary_polyline: map },
    timezone,
    utc_offset: utcOffset,
  } = activity
  const day = getDay(date)

  const [weather, location] = await Promise.all([
    getWeather(start_latitude, start_longitude, date),
    getLocation(start_latitude, start_longitude),
  ])

  const run = {
    date: new Date(date),
    day,
    distance,
    location,
    name,
    stravaId,
    map,
    time,
    timezone,
    utcOffset,
    weather,
  }

  return collection
    .findOneAndUpdate(
      {
        stravaId,
      },
      { $set: run },
      { returnOriginal: false, upsert: true },
    )
    .then(response => response.value)
}

export default addActivity
