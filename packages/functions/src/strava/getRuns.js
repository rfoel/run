import axios from 'axios'
import qs from 'qs'

import getToken from './getToken'

const STRAVA_URL = 'https://www.strava.com/api/v3/athlete/activities'
const DAY_ONE = 1580083200

export default async () => {
  const params = qs.stringify({
    page: 1,
    per_page: 100,
    after: DAY_ONE,
  })

  const token = await getToken()

  const url = `${STRAVA_URL}?${params}`

  const runs = await axios
    .get(url, { params, headers: { Authorization: `Bearer ${token}` } })
    .then(response => response.data)
    .catch(error => {
      throw error
    })

  return runs
}
