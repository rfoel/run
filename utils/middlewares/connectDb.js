import mongoose from 'mongoose'

const connectDb = handler => async (req, res) => {
  const { RUN_ATLAS_URL } = process.env

  await mongoose.connect(RUN_ATLAS_URL, {
    useNewUrlParser: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
  })

  await handler(req, res)

  mongoose.disconnect()
}

export default connectDb
