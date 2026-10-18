import http from 'http';
import axios from 'axios';
import { Server } from 'socket.io';
import app from './app.js';
import { config } from './config/index.js';
import { initSocket } from './socket/index.js';
import { prisma } from './database/client.js';
import { closeRedisClients, redisClient } from './database/redisClient.js';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      config.frontendUrl,
      'http://localhost:5173',
      'http://localhost:4173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4173',
      'http://127.0.0.1:3000',
    ],
    credentials: true,
  },
});

initSocket(io);

let shutdownTask: Promise<void> | undefined;

async function closeDependencies(): Promise<void> {
  const results = await Promise.allSettled([closeRedisClients(), prisma.$disconnect()]);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Backend dependency shutdown failed:', result.reason);
    }
  }
}

function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shutdownTask) return shutdownTask;

  console.log(`Received ${signal}; shutting down Sehat AI backend`);
  shutdownTask = (async () => {
    if (server.listening) {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    }
    await closeDependencies();
  })();
  return shutdownTask;
}

async function verifyDatabase(): Promise<void> {
  if (!config.databaseUrl.trim()) {
    throw new Error('DATABASE_URL is not configured');
  }

  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  await prisma.$queryRaw`
    SELECT "id", "userId", "refreshTokenHash", "expiresAt", "revokedAt"
    FROM "AuthSession"
    LIMIT 0
  `;
  console.log('Database Connected; authentication schema verified');
}

async function verifyOptionalDependencies(): Promise<void> {
  try {
    const pong = await redisClient.ping();
    if (pong === 'PONG') {
      console.log('Redis Connected');
    } else {
      console.error('Redis health check failed: expected PONG');
    }
  } catch (error) {
    console.error(
      'Redis unavailable; authentication remains available, but Redis-backed video sessions and realtime features are unavailable. Start Redis and restart the backend.',
      error instanceof Error ? error.message : 'Unknown Redis error',
    );
  }

  try {
    const healthUrl = `${config.aiGatewayUrl.replace(/\/\/$/, '')}/health`;
    const response = await axios.get(healthUrl, { timeout: 3000 });
    if (response.status === 200) {
      console.log('AI Services Connected');
    } else {
      console.error('AI service health check failed:', response.status);
    }
  } catch (error) {
    console.error(
      'AI service unavailable:',
      error instanceof Error ? error.message : 'Unknown AI service error',
    );
  }
}

server.on('error', (error: NodeJS.ErrnoException) => {
  if (!server.listening) return;

  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} is already in use. Identify the listener and stop only the intended process, or configure PORT explicitly.`,
    );
  } else {
    console.error('HTTP server error:', error.message);
  }

  void shutdown('SIGTERM').catch((shutdownError: unknown) => {
    console.error('Backend shutdown failed:', shutdownError);
    process.exitCode = 1;
  });
});

process.once('SIGINT', () => {
  void shutdown('SIGINT').catch((error: unknown) => {
    console.error('Backend shutdown failed:', error);
    process.exitCode = 1;
  });
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM').catch((error: unknown) => {
    console.error('Backend shutdown failed:', error);
    process.exitCode = 1;
  });
});

async function startServer(): Promise<void> {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  await verifyDatabase();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(config.port, () => {
      server.off('error', onError);
      resolve();
    });
  });

  console.log(`Sehat AI backend listening on ${config.port}`);
  void verifyOptionalDependencies();
}

void startServer().catch(async (error: unknown) => {
  if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} is already in use. Identify the listener and stop only the intended process, or configure PORT explicitly.`,
    );
  } else {
    console.error('Backend startup failed; the server was not started.', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage:
        error instanceof Error
          ? error.message.replace(/(\/\/)[^/@\s]+@/g, '$1[redacted]@')
          : 'Unknown startup error',
    });
  }

  await closeDependencies();
  process.exitCode = 1;
});
