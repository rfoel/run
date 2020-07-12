module.exports = {
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      issuer: {
        test: /\.(js)x?$/,
      },
      use: ['@svgr/webpack'],
    })

    return config
  },
}
