import { FUNCTIONS_PATH } from './config'

export const fetchCount = () =>
  fetch(`${FUNCTIONS_PATH}/count`)
    .then(response => response.json())
    .catch(error => {
      console.log({ error })
    })
