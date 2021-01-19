import React, { useRef, useEffect } from 'react'
import styled, { css } from 'styled-components'
import mapboxgl, { LngLatLike } from 'mapbox-gl'
import polyline from '@mapbox/polyline'

mapboxgl.accessToken = process.env.MAPBOX_TOKEN

const StyledMap = styled.div(
  () => css`
    height: 70px;
    overflow: hidden;
    width: 70px;

    * {
      outline: none;
    }
  `,
)

type Props = {
  map: string
}

const Map = ({ map }: Props) => {
  const ref = useRef(null)

  const coordinates: LngLatLike[] = polyline
    .decode(map)
    .map(([lat, lng]) => [lng, lat])

  useEffect(() => {
    const bounds = coordinates.reduce((bounds, coord) => {
      return bounds.extend(coord)
    }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]))

    const map = new mapboxgl.Map({
      center: bounds.getCenter(),
      container: ref.current,
      interactive: false,
      style: 'mapbox://styles/rfoel/ckk33or0z1ghj17n3ixrq0ifb',
      zoom: 12,
    })

    map.on('load', () => {
      map.addSource('lines', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                color: '#000',
              },
              geometry: {
                type: 'LineString',
                coordinates,
              },
            },
          ],
        },
      })

      map.addLayer({
        id: 'lines',
        type: 'line',
        source: 'lines',
        paint: {
          'line-width': 1,
          'line-color': ['get', 'color'],
        },
      })
    })

    return () => map.remove()
  }, [])

  return <StyledMap ref={ref} />
}

export default Map
