const formatPace = (pace: number): string => {
  const minutes = Math.trunc(pace)
  const seconds = (((pace % 1) * 60) / 100).toFixed(3).substring(2, 4)
  return `${minutes}'${seconds}"`
}

export default formatPace
