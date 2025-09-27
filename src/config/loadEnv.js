import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const resolveEnvFile = () => {
  const explicitPath = process.env.ENV_FILE?.trim();
  if (explicitPath) {
    return path.resolve(process.cwd(), explicitPath);
  }

  return path.resolve(process.cwd(), '.env');
};

const envFilePath = resolveEnvFile();

if (fs.existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath, override: false });
}
