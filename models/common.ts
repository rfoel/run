export type Location = {
  city: string
  country: string
  lat: number
  lon: number
}

export type Period = {
  start?: string
  end?: string
}

export type Weather = {
  temperature: number
  condition: string
}
