import dayjs from 'dayjs'
import { Meteostat } from 'meteostat'

import { Weather } from '../models'
import codes from './weatherConditionCodes'

const meteostat = new Meteostat(process.env.METEOSTAT_API_KEY)

const getWeather = async (
  lat: number,
  lon: number,
  date: string,
): Promise<Weather | null> => {
  const { data } = await meteostat.point.hourly({
    lat,
    lon,
    start: dayjs(date).format('YYYY-MM-DD'),
    end: dayjs(date).format('YYYY-MM-DD'),
    tz: 'America/Sao_Paulo',
  })

  if (!data) return null

  const found = data.find(({ time_local }) =>
    dayjs(date).minute(0).second(0).isSame(dayjs(time_local)),
  )

  if (!found) return null

  return { temperature: found.temp, condition: codes[found.coco] }
}

export default getWeather
