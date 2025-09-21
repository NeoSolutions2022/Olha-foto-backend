import fs from 'fs';
import os from 'os';

const bytesToMegabytes = (bytes) => Number((bytes / 1024 / 1024).toFixed(2));
const microsecondsToSeconds = (value) => Number((value / 1_000_000).toFixed(3));

const readProcCmdline = (pid) => {
  if (!pid || pid < 0) {
    return undefined;
  }

  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    if (!cmdline) {
      return undefined;
    }

    return cmdline.replace(/\0+$/, '').split('\0');
  } catch (error) {
    return undefined;
  }
};

const removeEmpty = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const filtered = value.map(removeEmpty).filter((item) => item !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).reduce((accumulator, [key, currentValue]) => {
      const cleaned = removeEmpty(currentValue);
      if (cleaned !== undefined) {
        accumulator[key] = cleaned;
      }
      return accumulator;
    }, {});

    return Object.keys(entries).length > 0 ? entries : undefined;
  }

  return value;
};

const buildEnvironmentSnapshot = () => removeEmpty({
  nodeEnv: process.env.NODE_ENV,
  host: process.env.HOST,
  port: process.env.PORT,
  lifecycleEvent: process.env.npm_lifecycle_event,
  containerHostname: process.env.HOSTNAME,
  databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
  kubernetesDetected: Boolean(process.env.KUBERNETES_SERVICE_HOST),
  ecsMetadataDetected: Boolean(process.env.ECS_CONTAINER_METADATA_URI || process.env.ECS_CONTAINER_METADATA_URI_V4)
});

const buildContainerSnapshot = () => removeEmpty({
  insideDocker: fs.existsSync('/.dockerenv'),
  hostname: os.hostname(),
  parentCommand: readProcCmdline(process.ppid),
  initProcess: readProcCmdline(1)
});

const buildMemorySnapshot = () => {
  const usage = process.memoryUsage();
  return removeEmpty(Object.fromEntries(
    Object.entries(usage).map(([key, value]) => [key, bytesToMegabytes(value)])
  ));
};

const buildResourceUsageSnapshot = () => {
  if (typeof process.resourceUsage !== 'function') {
    return undefined;
  }

  const usage = process.resourceUsage();

  return removeEmpty({
    userCpuSeconds: microsecondsToSeconds(usage.userCPUTime),
    systemCpuSeconds: microsecondsToSeconds(usage.systemCPUTime),
    maxRssMb: Number((usage.maxRSS / 1024).toFixed(2)),
    involuntaryContextSwitches: usage.involuntaryContextSwitches,
    voluntaryContextSwitches: usage.voluntaryContextSwitches,
    fsRead: usage.fsRead,
    fsWrite: usage.fsWrite
  });
};

const summarizeActiveHandles = () => {
  if (typeof process._getActiveHandles !== 'function') {
    return undefined;
  }

  const handles = process._getActiveHandles();
  if (!Array.isArray(handles) || handles.length === 0) {
    return undefined;
  }

  const summary = handles.reduce((accumulator, handle) => {
    const type = handle?.constructor?.name || typeof handle;
    accumulator[type] = (accumulator[type] || 0) + 1;
    return accumulator;
  }, {});

  return { total: handles.length, byType: summary };
};

const summarizeActiveRequests = () => {
  if (typeof process._getActiveRequests !== 'function') {
    return undefined;
  }

  const requests = process._getActiveRequests();
  if (!Array.isArray(requests) || requests.length === 0) {
    return undefined;
  }

  const summary = requests.reduce((accumulator, request) => {
    const type = request?.constructor?.name || typeof request;
    accumulator[type] = (accumulator[type] || 0) + 1;
    return accumulator;
  }, {});

  return { total: requests.length, byType: summary };
};

const buildDatabaseSnapshot = (pool) => {
  if (!pool) {
    return undefined;
  }

  const snapshot = removeEmpty({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  });

  if (!snapshot) {
    return undefined;
  }

  if (typeof snapshot.total === 'number' && typeof snapshot.idle === 'number') {
    snapshot.active = snapshot.total - snapshot.idle;
  }

  return snapshot;
};

export const collectShutdownDiagnostics = (signal, { dbPool } = {}) => {
  const diagnostics = removeEmpty({
    timestamp: new Date().toISOString(),
    signal,
    pid: process.pid,
    ppid: process.ppid,
    uptimeSeconds: Number(process.uptime().toFixed(3)),
    runtime: removeEmpty({
      nodeVersion: process.version,
      execPath: process.execPath,
      argv: process.argv,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release()
    }),
    environment: buildEnvironmentSnapshot(),
    container: buildContainerSnapshot(),
    memoryMb: buildMemorySnapshot(),
    resourceUsage: buildResourceUsageSnapshot(),
    activeHandles: summarizeActiveHandles(),
    activeRequests: summarizeActiveRequests(),
    databasePool: buildDatabaseSnapshot(dbPool)
  });

  return diagnostics;
};

export const logShutdownDiagnostics = (signal, context) => {
  try {
    const diagnostics = collectShutdownDiagnostics(signal, context);
    console.warn('Shutdown diagnostics snapshot:', JSON.stringify(diagnostics, null, 2));
  } catch (error) {
    console.error('Failed to capture shutdown diagnostics:', error);
  }
};
