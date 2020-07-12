import connectDb from './connectDb'
import getDay from './getDay'
import collection from '../models/run'

export default async function addRun(run) {
  await connectDb()
  const {
    distance,
    id: stravaId,
    moving_time: time,
    name,
    start_date: date,
    utc_offset: utcOffset,
  } = run
  const day = getDay(date)

  return collection.findOneAndUpdate(
    {
      stravaId,
    },
    { date, day, distance, name, stravaId, time, utcOffset },
    { returnOriginal: false, upsert: true },
  )
}
