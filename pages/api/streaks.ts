import dayjs, { Dayjs } from 'dayjs'
import { NextApiRequest, NextApiResponse } from 'next'

import { Range } from '../../models'
import connectToDatabase from '../../utils/connectToDatabase'
import { DATE_FORMAT, MINIMUM_STREAK_LENGTH } from '../../utils/constants'

const dateToTimestamp = ({
  date,
  utcOffset,
}: {
  date: Date
  utcOffset: number
}): Dayjs => dayjs(date).add(utcOffset, 'second')

const handler = async (
  _req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> => {
  try {
    const collection = await connectToDatabase()

    const dates = await collection
      .find({}, { projection: { date: 1, utcOffset: 1 }, sort: { date: -1 } })
      .toArray()

    let streakCount = 0
    const streaks = dates
      .map(dateToTimestamp)
      .reduce(
        (previousValue: Dayjs[][], currentDate): Dayjs[][] => {
          const currentStreak = previousValue[streakCount]
          const previousDate = currentStreak
            ? currentStreak[currentStreak.length - 1]
            : dates[0]

          if (!currentDate.add(1, 'day').isSame(previousDate, 'day')) {
            streakCount++
          }

          if (!previousValue[streakCount]) {
            previousValue[streakCount] = []
          }

          previousValue[streakCount].push(currentDate)

          return previousValue
        },
        [[]],
      )
      .filter((streak): boolean => streak.length >= MINIMUM_STREAK_LENGTH)
      .sort((a, b): number => b.length - a.length)
      .map(
        (streak): Range => ({
          label: `${streak[streak.length - 1].format(
            'DD/MM/YYYY',
          )} - ${streak[0].format('DD/MM/YYYY')}`,
          value: {
            start: streak[streak.length - 1].format(DATE_FORMAT),
            end: streak[0].format(DATE_FORMAT),
          },
        }),
      )

    return res.json(streaks)
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

export default handler
