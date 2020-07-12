import dayjs from 'dayjs'

import { DAY_ONE } from './constants'

export default function getDay(date) {
  return dayjs(date).diff(dayjs.unix(DAY_ONE), 'day') + 1
}
