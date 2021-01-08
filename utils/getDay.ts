import dayjs from 'dayjs'

import { DAY_ONE_UNIX } from './constants'

const getDay = (date: string): Number =>
  dayjs(date).diff(dayjs.unix(DAY_ONE_UNIX), 'day') + 1

export default getDay
