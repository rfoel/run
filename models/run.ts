import { Location, Weather } from './common'

export interface Run {
  _id: string
  date: Date
  distance: number
  location: Location
  name: string
  stravaId: string
  polyline: string
  time: number
  timezone: string
  utcOffset: number
  weather: Weather
}
