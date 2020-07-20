import connectDb from './connectDb'
import collection from '../models/run'
import getDay from './getDay'
import getLocation from './mapbox/getLocation'
import getWeather from './meteostat/getWeather'

export default async function addRun(run) {
  await connectDb()
  const {
    distance,
    id: stravaId,
    moving_time: time,
    name,
    start_date: date,
    start_latitude,
    start_longitude,
    timezone,
    utc_offset: utcOffset,
  } = run
  const day = getDay(date)

  const [weather, { city, country }] = await Promise.all([
    getWeather(start_latitude, start_longitude, date),
    getLocation(start_latitude, start_longitude),
  ])

  const location = { city, country, lat: start_latitude, lon: start_longitude }

  return collection.findOneAndUpdate(
    {
      stravaId,
    },
    {
      date,
      day,
      distance,
      location,
      name,
      stravaId,
      time,
      timezone,
      utcOffset,
      weather,
    },
    { returnOriginal: false, upsert: true },
  )
}
