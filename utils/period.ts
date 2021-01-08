import dayjs from 'dayjs'
import weekOfYear from 'dayjs/plugin/weekOfYear'
import { DATE_FORMAT } from './constants'

dayjs.extend(weekOfYear)

type Option = {
  value: {
    start: string
    end: string
  }
  label: string
}

export const getMonthNames = () =>
  [...Array(12)].map((_, index) => dayjs().month(index).format('MMMM'))

export const getWeeks = (
  startOfWeek = dayjs().startOf('week'),
  weeks = [],
): Option[] => {
  const endOfWeek = startOfWeek.endOf('week')

  if (startOfWeek.isBefore(dayjs().subtract(5, 'week'))) return weeks

  const getLabel = () => {
    if (startOfWeek.week() === dayjs().week()) return 'This week'
    if (startOfWeek.week() === dayjs().subtract(1, 'week').week())
      return 'Last week'
    return `${startOfWeek.format('DD/MM')} - ${endOfWeek.format('DD/MM')}`
  }

  return getWeeks(startOfWeek.subtract(1, 'week'), [
    ...weeks,
    {
      value: {
        start: startOfWeek.format(DATE_FORMAT),
        end: endOfWeek.format(DATE_FORMAT),
      },
      label: getLabel(),
    },
  ])
}
