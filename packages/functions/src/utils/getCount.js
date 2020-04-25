import connectDb from './connectDb'
import { collection } from '../models/run'

export default async () => {
  await connectDb()

  return collection.countDocuments()
}
