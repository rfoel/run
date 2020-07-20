import dayjs from 'dayjs'

import codes from './weather-condition-codes.json'
import getHourlyData from './getHourlyData'

export default async function getWeather(lat, lon, date) {
  const { data } = await getHourlyData(lat, lon, date)

  if (!data) return null

  const { temp: temperature, coco } = data.find(({ time_local }) =>
    dayjs(date).minute(0).second(0).isSame(dayjs(time_local)),
  )
  const condition = codes[coco]
  return { temperature, condition }
}
