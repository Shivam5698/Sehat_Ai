import axios from 'axios';
import { Router } from 'express';
import { prisma } from '../database/client.js';
import { redisClient } from '../database/redisClient.js';
import { config } from '../config/index.js';

export const healthRouter = Router();

const checkEndpoint = async (url: string) => {
  try {
    const response = await axios.get(`${url.replace(/\/$/, '')}/health`, { timeout: 3000 });
    return {
      healthy: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      details: response.data,
    };
  } catch (error) {
    return {
      healthy: false,
      statusCode: (error as any)?.response?.status || 503,
      details: (error as Error).message,
    };
  }
};

healthRouter.get('/', async (_req, res) => {
  let database = 'connected';
  let redis = 'connected';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'disconnected';
  }

  try {
    const pong = await redisClient.ping();
    if (pong !== 'PONG') redis = 'disconnected';
  } catch {
    redis = 'disconnected';
  }

  const agentHealth = await checkEndpoint(config.aiGatewayUrl || config.aiServiceUrl);
  const ragHealth = await checkEndpoint(config.aiServiceUrl);
  const healthy =
    database === 'connected' &&
    redis === 'connected' &&
    agentHealth.healthy &&
    ragHealth.healthy;

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    server: 'running',
    database,
    redis,
    agents: agentHealth.healthy ? 'healthy' : 'unhealthy',
    rag: ragHealth.healthy ? 'healthy' : 'unhealthy',
    agentHealth,
    ragHealth,
  });
});

healthRouter.get('/agents', async (_req, res) => {
  const agentCheck = await checkEndpoint(config.aiGatewayUrl || config.aiServiceUrl);
  return res.json({
    service: config.aiGatewayUrl || config.aiServiceUrl,
    healthy: agentCheck.healthy,
    statusCode: agentCheck.statusCode,
    details: agentCheck.details,
  });
});

healthRouter.get('/rag', async (_req, res) => {
  const ragCheck = await checkEndpoint(config.aiServiceUrl);
  return res.json({
    service: config.aiServiceUrl,
    healthy: ragCheck.healthy,
    statusCode: ragCheck.statusCode,
    details: ragCheck.details,
  });
});

healthRouter.get('/database', async (_req, res) => {
  let database = 'connected';
  let redis = 'connected';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'disconnected';
  }

  try {
    const pong = await redisClient.ping();
    if (pong !== 'PONG') redis = 'disconnected';
  } catch {
    redis = 'disconnected';
  }

  const healthy = database === 'connected' && redis === 'connected';
  return res.status(healthy ? 200 : 503).json({ healthy, database, redis });
});
