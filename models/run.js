import mongoose from 'mongoose'

const { Schema, model, models } = mongoose

const schema = new Schema(
  {
    date: Date,
    day: Number,
    distance: Number,
    name: String,
    stravaId: String,
    time: Number,
    utcOffset: Number,
  },
  { timestamps: true },
)

export default models.run || model('run', schema)
