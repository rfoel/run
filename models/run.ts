import { ObjectId } from 'mongodb'

import { Location, Weather } from './common'

export interface Run {
  id: ObjectId
  date: Date
  day: number
  distance: number
  location: Location
  name: string
  stravaId: string
  map: string
  time: number
  timezone: string
  utcOffset: number
  weather: Weather
}
