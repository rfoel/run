import getRunCount from './strava/getRunCount'

export const handler = async () => {
  try {
    const count = await getRunCount()

    return {
      statusCode: 200,
      body: JSON.stringify({ count }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err.message }),
    }
  }
}
