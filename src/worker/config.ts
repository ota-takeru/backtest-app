/**
 * Worker設定管理
 * Worker動作に関する設定値を外部化
 */

export interface DuckDBConfig {
  queryConfig: {
    castBigIntToDouble: boolean;
  };
  connectionTimeout: number;
  maxRetries: number;
}

export interface ArrowConfig {
  maxTestRows: number;
  chunkSize: number;
  supportedMethods: readonly string[];
}

export interface WorkerConfig {
  duckdb: DuckDBConfig;
  arrow: ArrowConfig;
  timeouts: {
    operationTimeout: number;
    workerResponseTimeout: number;
  };
  logging: {
    enableDetailedLogs: boolean;
    logArrowBuffer: boolean;
    maxLogEntries: number;
  };
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  duckdb: {
    queryConfig: {
      castBigIntToDouble: true,
    },
    connectionTimeout: 5000,
    maxRetries: 3,
  },
  arrow: {
    maxTestRows: 100,
    chunkSize: 1000,
    supportedMethods: [
      "manual_table_creation",
      "insertArrowFromIPCStream",
      "file_registration_read_arrow",
      "file_registration_arrow_scan",
      "file_registration_parquet",
    ] as const,
  },
  timeouts: {
    operationTimeout: 30000,
    workerResponseTimeout: 30000,
  },
  logging: {
    enableDetailedLogs: true,
    logArrowBuffer: true,
    maxLogEntries: 1000,
  },
};

export function createWorkerConfig(overrides?: Partial<WorkerConfig>): WorkerConfig {
  return {
    ...DEFAULT_WORKER_CONFIG,
    ...overrides,
    duckdb: {
      ...DEFAULT_WORKER_CONFIG.duckdb,
      ...overrides?.duckdb,
      queryConfig: {
        ...DEFAULT_WORKER_CONFIG.duckdb.queryConfig,
        ...overrides?.duckdb?.queryConfig,
      },
    },
    arrow: {
      ...DEFAULT_WORKER_CONFIG.arrow,
      ...overrides?.arrow,
    },
    timeouts: {
      ...DEFAULT_WORKER_CONFIG.timeouts,
      ...overrides?.timeouts,
    },
    logging: {
      ...DEFAULT_WORKER_CONFIG.logging,
      ...overrides?.logging,
    },
  };
}
