import getActivityById from '../../utils/strava/getActivityById'
import addRun from '../../utils/addRun'

export default async function webhook(req, res) {
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

      res.statusCode = 201
      res.json({ message: `run ${run.id} successfully added` })
    }

    res.statusCode = 200
    res.json({ message: 'nothing to do here' })
  } catch (error) {
    res.statusCode = 400
    res.json({ message: error.message })
  }
}
