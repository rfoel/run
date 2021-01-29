import { Strava } from 'strava'

export default new Strava({
  client_id: process.env.STRAVA_CLIENT_ID,
  client_secret: process.env.STRAVA_CLIENT_SECRET,
  refresh_token: process.env.STRAVA_REFRESH_TOKEN,
})
