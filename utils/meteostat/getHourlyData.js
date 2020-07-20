import dayjs from 'dayjs'
import qs from 'querystring'

const METEOSTAT_URL = 'https://api.meteostat.net/v2/point/hourly'

export default function getHourlyData(
  lat,
  lon,
  date,
  tz = 'America/Sao_Paulo',
) {
  const params = qs.stringify({
    lat,
    lon,
    start: dayjs(date).format('YYYY-MM-DD'),
    end: dayjs(date).format('YYYY-MM-DD'),
    tz,
  })
  const url = `${METEOSTAT_URL}?${params}`

  return fetch(url, {
    headers: {
      'x-api-key': process.env.METEOSTAT_API_KEY,
    },
  })
    .then(response => response.json())
    .catch(error => {
      throw error
    })
}
