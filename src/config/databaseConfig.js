const PLACEHOLDER_HOSTS = new Set([
  'db.example.com',
  'replace-with-host',
  'example.com'
]);

const isPostgresProtocol = (protocol) => {
  if (!protocol) {
    return false;
  }

  const normalized = protocol.toLowerCase();
  return normalized === 'postgres:' || normalized === 'postgresql:';
};

export const getDatabaseConnectionString = () => {
  const rawValue = process.env.DATABASE_URL;
  const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (!trimmedValue) {
    throw new Error('DATABASE_URL environment variable is required to connect to PostgreSQL.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch (error) {
    throw new Error(`DATABASE_URL is not a valid URL: ${error.message}`);
  }

  if (!isPostgresProtocol(parsedUrl.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol.');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const usesExampleHost = hostname.endsWith('.example.com') || PLACEHOLDER_HOSTS.has(hostname);
  if (usesExampleHost) {
    throw new Error(
      `DATABASE_URL is using the placeholder host "${hostname}". Update it to point to your PostgreSQL instance.`
    );
  }

  return trimmedValue;
};
