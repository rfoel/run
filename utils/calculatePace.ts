const calculatePace = (distance: number, time: number): number => {
  return time / 60 / (distance / 1000)
}

export default calculatePace
