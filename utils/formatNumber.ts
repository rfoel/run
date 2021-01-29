const formatNumber = (
  value: number | string,
  options?: Intl.NumberFormatOptions,
) => new Intl.NumberFormat('pt-BR', options).format(Number(value))

export default formatNumber
