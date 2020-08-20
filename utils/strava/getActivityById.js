import getRefreshedToken from './getRefreshedToken'

const STRAVA_URL = 'https://www.strava.com/api/v3/activities'

const getActivityById = async id => {
  const token = await getRefreshedToken()
  const url = `${STRAVA_URL}/${id}`

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(response => response.json())
    .catch(error => {
      throw error
    })
}

export default getActivityById
