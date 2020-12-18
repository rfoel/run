declare namespace NodeJS {
  export interface ProcessEnv {
    METEOSTAT_API_KEY: string
    RUN_MONGODB_URI: string
    STRAVA_CLIENT_ID: string
    STRAVA_CLIENT_SECRET: string
    STRAVA_REFRESH_TOKEN: string
  }
}
