import connectDb from '../../utils/middlewares/connectDb'
import getActivityById from '../../utils/strava/getActivityById'
import addRun from '../../utils/addRun'

const webhook = async (req, res) => {
  try {
    const { body, query } = req

    if (query['hub.mode'] === 'subscribe') {
      res.statusCode = 200
      res.json({
        'hub.challenge': query['hub.challenge'],
      })
    }

    const { aspect_type, object_id, object_type } = body

    if (aspect_type === 'create' && object_type === 'activity') {
      const activity = await getActivityById(object_id)

      if (activity.errors) throw activity

      const run = await addRun(activity)

      res.status(201).json({ message: `run ${run.id} successfully added` })
    }

    res.status(200).json({ message: 'nothing to do here' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default connectDb(webhook)
