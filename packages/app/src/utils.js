import { RUNS_PATH } from './config'

export const getDistance = ({ distance }) => `${(distance / 1000).toFixed(2)} km`

export const getPace = ({ distance, moving_time: time }) => {
  const pace = time / 60 / (distance / 1000)
  const minutes = Math.trunc(pace / 1)
  const seconds = Math.round((pace % 1) * 60)
  return `${minutes}:${seconds}/km`
}

export const getRuns = async () => {
  const runs = await fetch(RUNS_PATH)
    .then(response => response.json())
    .catch(error => {
      console.log(error)
    })

  return runs
}

export const getTime = ({ moving_time: time }) => {
  const minutes = Math.trunc(time / 60 / 1)
  const seconds = Math.round(((time / 60) % 1) * 60)
  return `${minutes}:${seconds}`
}
