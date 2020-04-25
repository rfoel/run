/* eslint-disable camelcase */

import getActivityById from './strava/getActivityById'
import addRun from './utils/addRun'

export const handler = async event => {
  try {
    const { body, queryStringParameters } = event

    if (queryStringParameters['hub.mode'] === 'subscribe')
      return {
        statusCode: 200,
        body: JSON.stringify({ 'hub.challenge': queryStringParameters['hub.challenge'] }),
      }

    const { aspect_type, object_id, object_type } = JSON.parse(body)

    if (aspect_type === 'create' && object_type === 'activity') {
      const activity = await getActivityById(object_id)

      if (activity.errors) throw activity

      const run = await addRun(activity)

      return {
        statusCode: 200,
        body: JSON.stringify({ message: `run ${run.id} successfully added` }),
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'nothing to do here' }),
    }
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error.message }),
    }
  }
}
