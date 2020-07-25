export default function calculatePace(pace) {
  const minutes = Math.trunc(pace)
  const seconds = (((pace % 1) * 60) / 100).toFixed(2).substring(2)
  return `${minutes}'${seconds}"`
}
