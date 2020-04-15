import React, { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import styled, { css } from 'styled-components/macro'
import { Box, Heading, Text } from '@1e3/ui'

import Loader from '../components/Loader'

import { getDistance, getPace, getRuns, getTime } from '../utils'

const StyledText = styled(Text)(
  ({ theme: { scale } }) => css`
    margin: ${scale(1)} 0;
  `,
)

export default () => {
  const [runs, setRuns] = useState(null)

  useEffect(() => {
    if (!runs) getRuns().then(setRuns)
  }, [runs])

  if (!runs) return <Loader />

  const {
    count,
    fastestPace,
    shortestTime,
    longestRun,
    slowestPace,
    longestTime,
    shortestRun,
  } = runs

  return (
    <Box>
      <Heading>I ran {count} days in a row</Heading>
      <StyledText>
        Fastest pace was {getPace(fastestPace)} on{' '}
        {dayjs(fastestPace.start_date_local).format('DD/MM/YYYY')}
      </StyledText>
      <StyledText>
        Slowest pace was {getPace(slowestPace)} on{' '}
        {dayjs(slowestPace.start_date_local).format('DD/MM/YYYY')}
      </StyledText>
      <StyledText>
        Longest run was {getDistance(longestRun)} on{' '}
        {dayjs(longestRun.start_date_local).format('DD/MM/YYYY')}
      </StyledText>
      <StyledText>
        Shortest run was {getDistance(shortestRun)} on{' '}
        {dayjs(shortestRun.start_date_local).format('DD/MM/YYYY')}
      </StyledText>
      <StyledText>
        Shortest time was {getTime(shortestTime)} on{' '}
        {dayjs(shortestTime.start_date_local).format('DD/MM/YYYY')}
      </StyledText>
      <StyledText>
        Longest time was {getTime(longestTime)} on{' '}
        {dayjs(longestTime.start_date_local).format('DD/MM/YYYY')}
      </StyledText>
    </Box>
  )
}
