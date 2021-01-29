import { NextApiRequest, NextApiResponse } from 'next'

import addActivity from '../../utils/addActivity'
import strava from '../../utils/strava'

const webhook = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { body, query } = req

    if (query['hub.mode'] === 'subscribe') {
      return res.json({
        'hub.challenge': query['hub.challenge'],
      })
    }

    const { aspect_type, object_id, object_type } = body

    if (aspect_type === 'create' && object_type === 'activity') {
      const activity = await strava.activities.getActivityById(object_id)

      const run = await addActivity(activity)

      return res
        .status(201)
        .json({ message: `run ${run._id} successfully added` })
    }

    return res.json({ message: 'nothing to do here' })
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ message: 'activity not found' })
    }

    return res.status(500).json({ message: error.message })
  }
}

export default webhook
