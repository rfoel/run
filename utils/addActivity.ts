import { SummaryActivity } from 'strava'

import { Run } from '../models/run'

import connectToDatabase from './connectToDatabase'
import getLocation from './getLocation'
import getWeather from './getWeather'

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
    map: { summary_polyline: polyline },
    timezone,
    utc_offset: utcOffset,
  } = activity

  const [weather, location] = await Promise.all([
    getWeather(start_latitude, start_longitude, date),
    getLocation(start_latitude, start_longitude),
  ])

  const run = {
    date: new Date(date),
    distance,
    location,
    name,
    stravaId,
    polyline,
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
