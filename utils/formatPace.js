const formatPace = pace => {
  const minutes = Math.trunc(pace)
  const seconds = (((pace % 1) * 60) / 100).toFixed(3).substring(2, 4)
  return `${minutes}'${seconds}"`
}

export default formatPace
