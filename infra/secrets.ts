/// <reference path="../.sst/platform/config.d.ts" />

export const stravaClientId = new sst.Secret("StravaClientId");
export const stravaClientSecret = new sst.Secret("StravaClientSecret");
export const stravaVerifyToken = new sst.Secret("StravaVerifyToken");
export const anthropicApiKey = new sst.Secret("AnthropicApiKey");
export const writePassword = new sst.Secret("WritePassword");
export const garminEmail = new sst.Secret("GarminEmail");
export const garminPassword = new sst.Secret("GarminPassword");

export const allSecrets = [
  stravaClientId,
  stravaClientSecret,
  stravaVerifyToken,
  anthropicApiKey,
  writePassword,
  garminEmail,
  garminPassword,
];
