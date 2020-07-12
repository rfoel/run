import qs from 'querystring'

import getRefreshedToken from './getRefreshedToken'

import { DAY_ONE } from '../constants'

const STRAVA_URL = 'https://www.strava.com/api/v3/athlete/activities'

export default async function getLoggedInAthleteActivities({
  after = DAY_ONE,
  page = 1,
  per_page = 10,
}) {
  const token = await getRefreshedToken()
  const params = qs.stringify({
    page,
    per_page,
    after,
  })
  const url = `${STRAVA_URL}?${params}`

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  })
    .then(response => response.json())
    .catch(error => {
      throw error
    })
}
