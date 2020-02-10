import axios from 'axios'

import { RUN_COUNT_PATH } from './config'

export const getRunCount = async () => {
  const { count } = await axios(RUN_COUNT_PATH)
    .then(response => response.data)
    .catch(error => {
      throw error
    })

  return count
}
