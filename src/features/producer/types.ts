export interface Config {
  thisAppsName: string;
  brokersCSV: string;
  connectionTimeout: number;
  authenticationTimeout: number;
  reauthenticationThreshold: number;
  retry: {
    initialRetryTime: number;
    retries: number;
  };
}
