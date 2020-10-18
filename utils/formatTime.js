import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import utc from 'dayjs/plugin/utc'

dayjs.extend(duration)
dayjs.extend(utc)

const formatTime = time => {
  return dayjs
    .utc(dayjs.duration(time, 'second').asMilliseconds())
    .format('m:ss')
}

export default formatTime
