import React from 'react'
import styled from 'styled-components'
import polyline from '@mapbox/polyline'

const Svg = styled.svg`
  overflow: visible;
  height: auto;
`

const convertLatLngToPoint = ([lat, lng]) => {
  return {
    x: (lng + 180) * (256 / 360),
    y:
      256 / 2 -
      (256 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2))) /
        (2 * Math.PI),
  }
}

const getPolylineProps = latLng => {
  const points = []
  let minX = 256
  let minY = 256
  let maxX = 0
  let maxY = 0

  for (var pp = 0; pp < latLng.length; ++pp) {
    const currentLatLng = latLng[pp]
    for (var p = 0; p < currentLatLng.length; ++p) {
      const point = convertLatLngToPoint(currentLatLng)
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
      points.push([point.x, point.y].join(','))
    }
  }

  return {
    points: points.join(' '),
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

const Map = ({ summaryPolyline }) => {
  const latLng = polyline.decode(summaryPolyline)
  const { height, points, x, y, width } = getPolylineProps(latLng)

  return (
    <Svg
      id="svg"
      height="150"
      width="150"
      preserveAspectRatio="xMinYMin"
      viewBox={[x, y, width, height].join(' ')}
    >
      <polyline
        points={points}
        fill="none"
        stroke="black"
        strokeWidth="0.0001"
        strokeLinecap="round"
        strokeLinejoin="round"
      ></polyline>
    </Svg>
  )
}

export default Map
