import dayjs from 'dayjs'

import { DAY_ONE } from './constants'

export default date => dayjs(date).diff(dayjs.unix(DAY_ONE), 'day') + 1
