import getRuns from './strava/getRuns'

const getCount = data => data.runs.length

const getFastestPace = data => {
  const fastestPace = Math.max(...data.averageSpeeds)
  return data.runs.find(run => run.average_speed === fastestPace)
}

const getShortestTime = data => {
  const shortestTime = Math.min(...data.movingTimes)
  return data.runs.find(run => run.moving_time === shortestTime)
}

const getLongestRun = data => {
  const longestDistance = Math.max(...data.distances)
  return data.runs.find(run => run.distance === longestDistance)
}

const getShortestRun = data => {
  const shortestDistance = Math.min(...data.distances)
  return data.runs.find(run => run.distance === shortestDistance)
}

const getSlowestPace = data => {
  const slowestPace = Math.min(...data.averageSpeeds)
  return data.runs.find(run => run.average_speed === slowestPace)
}

const getLongestTime = data => {
  const longestTime = Math.max(...data.movingTimes)
  return data.runs.find(run => run.moving_time === longestTime)
}

export const handler = async () => {
  try {
    const runs = await getRuns()

    const data = runs.reduce(
      (acc, run) => {
        return {
          averageSpeeds: [...acc.averageSpeeds, run.average_speed],
          distances: [...acc.distances, run.distance],
          movingTimes: [...acc.movingTimes, run.moving_time],
        }
      },
      {
        averageSpeeds: [],
        distances: [],
        movingTimes: [],
      },
    )

    data.runs = runs

    const body = {
      count: getCount(data),
      fastestPace: getFastestPace(data),
      shortestTime: getShortestTime(data),
      longestRun: getLongestRun(data),
      slowestPace: getSlowestPace(data),
      longestTime: getLongestTime(data),
      shortestRun: getShortestRun(data),
    }

    return {
      statusCode: 200,
      body: JSON.stringify(body),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err.message }),
    }
  }
}
