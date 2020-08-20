import dayjs from 'dayjs'
import qs from 'querystring'

const METEOSTAT_URL = 'https://api.meteostat.net/v2/point/hourly'

const getHourlyData = async (lat, lon, date, tz = 'America/Sao_Paulo') => {
  const params = qs.stringify({
    lat,
    lon,
    start: dayjs(date).format('YYYY-MM-DD'),
    end: dayjs(date).format('YYYY-MM-DD'),
    tz,
  })
  const url = `${METEOSTAT_URL}?${params}`
  const headers = {
    'x-api-key': process.env.METEOSTAT_API_KEY,
  }

  return fetch(url, {
    headers,
  })
    .then(response => response.json())
    .catch(() => ({}))
}

export default getHourlyData
