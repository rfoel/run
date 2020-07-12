import qs from 'querystring'

const {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_REFRESH_TOKEN,
} = process.env

const STRAVA_URL = 'https://www.strava.com/oauth/token'

export default async function getRefreshedToken() {
  const params = qs.stringify({
    client_id: Number(STRAVA_CLIENT_ID),
    client_secret: STRAVA_CLIENT_SECRET,
    refresh_token: STRAVA_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })
  const url = `${STRAVA_URL}?${params}`

  const { access_token } = await fetch(url, { method: 'post' })
    .then(response => response.json())
    .catch(error => {
      throw error
    })

  return access_token
}
