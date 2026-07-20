/// <reference path="../.sst/platform/config.d.ts" />

export const anthropicApiKey = new sst.Secret("AnthropicApiKey");
export const writePassword = new sst.Secret("WritePassword");
export const garminEmail = new sst.Secret("GarminEmail");
export const garminPassword = new sst.Secret("GarminPassword");

export const allSecrets = [
  anthropicApiKey,
  writePassword,
  garminEmail,
  garminPassword,
];
