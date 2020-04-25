import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const schema = new Schema(
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

export const collection = model('run', schema)
