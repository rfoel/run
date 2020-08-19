import qs from 'querystring'

const MAPBOX_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places'

const getLocation = async (lat, lon) => {
  const params = qs.stringify({
    access_token: process.env.MAPBOX_TOKEN,
  })
  const url = `${MAPBOX_URL}/${lon},${lat}.json?${params}`

  const { features } = await fetch(url)
    .then(response => response.json())
    .catch(error => {
      throw error
    })

  if (!features) return null

  const city = features.find(({ id }) => id.startsWith('place')).text
  const country = features.find(({ id }) => id.startsWith('country')).text

  return { city, country }
}

export default getLocation
