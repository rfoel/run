import mongoose from 'mongoose'

const { Schema, model, models } = mongoose

const Location = {
  city: String,
  country: String,
  lat: Number,
  lon: Number,
}

const Weather = {
  temperature: Number,
  condition: String,
}

const schema = new Schema(
  {
    date: Date,
    day: Number,
    distance: Number,
    location: Location,
    name: String,
    stravaId: String,
    time: Number,
    timezone: String,
    utcOffset: Number,
    weather: Weather,
  },
  { timestamps: true },
)

export default models.run || model('run', schema)
