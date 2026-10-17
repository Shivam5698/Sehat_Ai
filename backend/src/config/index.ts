import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'node:crypto';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../../../.env'),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  console.warn('No .env file found in expected locations:', envCandidates);
}

const isDevelopment = process.env.NODE_ENV === 'development';
const jwtSecret = process.env.JWT_SECRET?.trim();
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
const missingJwtSecret = !jwtSecret;
const missingJwtRefreshSecret = !jwtRefreshSecret;

if (isDevelopment && (missingJwtSecret || missingJwtRefreshSecret)) {
  console.warn('Missing JWT secrets; using ephemeral development keys.');
}

export const config = {
  port: Number(process.env.PORT || 5000),
  jwtSecret: jwtSecret || (isDevelopment ? randomBytes(32).toString('hex') : ''),
  jwtRefreshSecret:
    jwtRefreshSecret || (isDevelopment ? randomBytes(32).toString('hex') : ''),
  validateJwtSecrets() {
    if (!isDevelopment && (missingJwtSecret || missingJwtRefreshSecret)) {
      throw new Error(
        'JWT_SECRET and JWT_REFRESH_SECRET must be set unless NODE_ENV=development.',
      );
    }
  },
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  openaiKey: process.env.OPENAI_API_KEY || '',
  trugen: {
    apiKey: process.env.TRUGEN_API_KEY || '',
    baseUrl: process.env.TRUGEN_BASE_URL || '',
    apiSecret: process.env.TRUGEN_API_SECRET || process.env.TRUGEN_SECRET || '',
    agentId: process.env.TRUGEN_AGENT_ID || '',
    avatarId: process.env.TRUGEN_AVATAR_ID || '',
    region: process.env.TRUGEN_REGION || '',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  aiGatewayUrl: process.env.AI_GATEWAY_URL || process.env.AI_SERVICE_URL || 'http://localhost:8000',
  symptomAgentUrl: process.env.SYMPTOM_AGENT_URL || 'http://localhost:5001',
  severityAgentUrl: process.env.SEVERITY_AGENT_URL || 'http://localhost:5002',
  safetyAgentUrl: process.env.SAFETY_AGENT_URL || 'http://localhost:5003',
  s3: {
    endpoint: process.env.S3_ENDPOINT || '',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    bucket: process.env.S3_BUCKET || ''
  }
}
