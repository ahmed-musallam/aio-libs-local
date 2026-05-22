/**
 * Ensure tests never pick up local Azure / OpenWhisk credentials from the environment.
 */
const cloudEnvKeys = [
  "AZURE_STORAGE_ACCOUNT",
  "AZURE_STORAGE_ACCESS_KEY",
  "AZURE_STORAGE_CONTAINER",
  "AIO_STATE_REGION",
  "AIO_STATE_ENDPOINT",
  "__OW_API_KEY",
  "__OW_NAMESPACE",
  "__OW_AUTH",
  "RUN_PARITY",
] as const;

for (const key of cloudEnvKeys) {
  delete process.env[key];
}
