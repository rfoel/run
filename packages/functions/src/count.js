import getCount from './utils/getCount'

export const handler = async () => {
  try {
    const count = await getCount()

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
