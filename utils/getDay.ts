import dayjs from 'dayjs'

import { DAY_ONE } from './constants'

const getDay = (date: string): Number =>
  dayjs(date).diff(dayjs.unix(DAY_ONE), 'day') + 1

export default getDay
