import dayjs from 'dayjs'

export default function formatDate(date) {
  if (dayjs().isSame(dayjs(date), 'day')) return 'Today'
  if (dayjs().subtract(1, 'day').isSame(dayjs(date), 'day')) return 'Yesterday'
  return dayjs(date).format('MMMM DD, YYYY')
}
