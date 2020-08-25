import collection from '../models/run'
import getDay from './getDay'
import getLocation from './mapbox/getLocation'
import getWeather from './meteostat/getWeather'

const addRun = async run => {
  const {
    distance,
    id: stravaId,
    moving_time: time,
    name,
    start_date: date,
    start_latitude,
    start_longitude,
    map: { summary_polyline: summaryPolyline },
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
      summaryPolyline,
      time,
      timezone,
      utcOffset,
      weather,
    },
    { returnOriginal: false, upsert: true },
  )
}

export default addRun
