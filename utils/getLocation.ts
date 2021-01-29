import qs from 'querystring'

import { Location } from '../models'

const getLocation = async (
  lat: number,
  lon: number,
): Promise<Location | null> => {
  if (!lon || !lat) {
    return null
  }

  const params = qs.stringify({
    access_token: process.env.MAPBOX_TOKEN,
    types: 'country,place',
  })
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?${params}`

  const { features } = await fetch(url).then(response => response.json())

  if (!features) return null

  const city = features.find(({ id }: { id: string }) => id.startsWith('place'))
    .text
  const country = features.find(({ id }: { id: string }) =>
    id.startsWith('country'),
  ).text

  return { city, country, lat, lon }
}

export default getLocation
