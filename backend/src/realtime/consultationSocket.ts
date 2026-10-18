import { Server, Socket } from 'socket.io';
import { getSocketUserId } from './socketAuth.js';
import { prisma } from '../database/client.js';
import { AudioStreamProcessor } from '../services/mediaService.js';
import { ConversationContext, Transcript } from '../types/consultation.js';
import { config } from '../config/index.js';
import { createRedisPublisher } from '../database/redisClient.js';
import { VideoSessionManager } from '../video/session-manager/sessionManager.js';
import { SocketService } from '../video/websocket/socket.service.js';
import { WebRTCService } from '../video/websocket/webrtc.service.js';
import { DashboardEventsService } from '../video/dashboard-events/dashboardEvents.service.js';
import { EmergencyService } from '../video/emergency/emergency.service.js';
import { AIGatewayService } from '../integrations/ai-gateway/aiGateway.service.js';
import { SpeechService } from '../video/stt/speech.service.js';
import { InvalidAIResponseError, safeErrorName } from '../services/aiResponseBoundary.js';
import { ACCESS_TOKEN_COOKIE, getCookieValue } from '../middleware/authCookies.js';

interface ConsultationSession {
  consultationId: string;
  userId: string;
  socketId: string;
  language: string;
  status: 'active' | 'paused' | 'ended';
  audioProcessor: AudioStreamProcessor;
  transcripts: Transcript[];
  isProcessing: boolean;
}

const activeSessions = new Map<string, ConsultationSession>();

export function initConsultationSocket(io: Server) {
  const sttService = new SpeechService();
  const aiGateway = new AIGatewayService();
  const redisPublisher = createRedisPublisher();
  const videoSessionManager = new VideoSessionManager();
  const socketService = new SocketService(io);
  const webrtcService = new WebRTCService(io);
  const dashboardEvents = new DashboardEventsService(io);
  const emergencyService = new EmergencyService();

  io.use((socket, next) => {
    const token =
      getCookieValue(socket.handshake.headers.cookie, ACCESS_TOKEN_COOKIE) ??
      socket.handshake.auth?.token;
    const userId = getSocketUserId(token, config.jwtSecret);
    if (!userId) {
      next(new Error('Authentication required'));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket: Socket) => {
    console.log('[SOCKET] Client connected:', socket.id);

    // ======================
    // CONSULTATION LIFECYCLE
    // ======================

    socket.on('consultation:start', async (payload) => {
      try {
        const { consultationId, language = 'en' } = payload;
        const userId = socket.data.userId;
        if (typeof userId !== 'string' || !(await socketOwnsConsultation(socket, consultationId))) {
          socket.emit('consultation:error', { message: 'Unauthorized' });
          return;
        }

        const videoSession = await videoSessionManager.createSession(consultationId, userId, language);

        // Create session
        const session: ConsultationSession = {
          consultationId,
          userId,
          socketId: socket.id,
          language,
          status: 'active',
          audioProcessor: new AudioStreamProcessor(),
          transcripts: [],
          isProcessing: false,
        };

        activeSessions.set(consultationId, session);
        socket.join(consultationId);

        // Update consultation status
        await prisma.consultation.update({
          where: { id: consultationId },
          data: { status: 'started', startedAt: new Date() },
        });

        socketService.emit(consultationId, 'consultation_started', {
          consultationId,
          status: 'active',
          language,
          timestamp: new Date(),
        });
        socketService.emit(consultationId, 'consultation:started', {
          consultationId,
          status: 'active',
          language,
          timestamp: new Date(),
        });

        await dashboardEvents.recordStatus(consultationId, userId, 'Listening...');
        await redisPublisher.publish('sehat:consultation:events', JSON.stringify({ consultationId, event: 'consultation_started', language, status: 'active', timestamp: new Date().toISOString(), videoSessionId: videoSession.id }));

        console.log(`[SOCKET] Consultation started: ${consultationId}`);
      } catch (error) {
        console.error('[SOCKET] Consultation start error:', error);
        socket.emit('consultation:error', { message: 'Failed to start consultation' });
      }
    });

    socket.on('consultation:join', async (payload) => {
      try {
        const { consultationId } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) {
          socket.emit('consultation:error', { message: 'Unauthorized' });
          return;
        }
        await videoSessionManager.joinSession(consultationId, socket.id);
        socket.join(consultationId);
        socketService.emit(consultationId, 'consultation_joined', { consultationId, socketId: socket.id });
      } catch (error) {
        console.error('[SOCKET] Consultation join error:', error);
        socket.emit('consultation:error', { message: 'Failed to join consultation' });
      }
    });

    socket.on('consultation:leave', async (payload) => {
      try {
        const { consultationId } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) {
          socket.emit('consultation:error', { message: 'Unauthorized' });
          return;
        }
        await videoSessionManager.leaveSession(consultationId, socket.id);
        socket.leave(consultationId);
        socketService.emit(consultationId, 'consultation_left', { consultationId, socketId: socket.id });
      } catch (error) {
        console.error('[SOCKET] Consultation leave error:', error);
        socket.emit('consultation:error', { message: 'Failed to leave consultation' });
      }
    });

    socket.on('consultation:reconnect', async (payload) => {
      try {
        const { consultationId } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) {
          socket.emit('consultation:error', { message: 'Unauthorized' });
          return;
        }
        await videoSessionManager.reconnectSession(consultationId, socket.id);
        socket.join(consultationId);
        socketService.emit(consultationId, 'consultation_reconnected', { consultationId, socketId: socket.id });
      } catch (error) {
        console.error('[SOCKET] Consultation reconnect error:', error);
        socket.emit('consultation:error', { message: 'Failed to reconnect consultation' });
      }
    });

    socket.on('consultation:heartbeat', async (payload) => {
      try {
        const { consultationId } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) return;
        socketService.emit(consultationId, 'consultation:heartbeat', { timestamp: new Date() });
      } catch (error) {
        console.error('[SOCKET] Consultation heartbeat error:', error);
      }
    });

    socket.on('consultation:stop', async (payload) => {
      try {
        const { consultationId } = payload;
        const session = activeSessions.get(consultationId);

        if (!session || session.userId !== socket.data.userId) {
          socket.emit('consultation:error', { message: 'Unauthorized' });
          return;
        }

        session.status = 'ended';

        await videoSessionManager.endSession(consultationId);

        // Update consultation
        await prisma.consultation.update({
          where: { id: consultationId },
          data: { status: 'ended', endedAt: new Date() },
        });

        socketService.emit(consultationId, 'consultation_completed', {
          consultationId,
          timestamp: new Date(),
        });
        io.to(consultationId).emit('consultation:ended', {
          consultationId,
          timestamp: new Date(),
        });
        await redisPublisher.publish('sehat:consultation:events', JSON.stringify({ consultationId, event: 'consultation_completed', timestamp: new Date().toISOString() }));

        activeSessions.delete(consultationId);
        socket.leave(consultationId);

        console.log(`[SOCKET] Consultation ended: ${consultationId}`);
      } catch (error) {
        console.error('[SOCKET] Consultation stop error:', error);
        socket.emit('consultation:error', { message: 'Failed to stop consultation' });
      }
    });

    // ======================
    // AUDIO STREAMING
    // ======================

    socket.on('audio:stream', async (payload) => {
      try {
        const { consultationId, chunk } = payload;
        const session = getOwnedActiveSession(socket, consultationId);

        if (!session || session.status !== 'active') {
          socket.emit('audio:error', { message: 'Session not active' });
          return;
        }

        // Add audio chunk to buffer
        const buffer = Buffer.from(chunk, 'base64');
        session.audioProcessor.addChunk(buffer);

        // Emit acknowledgment
        socket.emit('audio:received', { size: buffer.length });

        // Process audio every N chunks or after buffer size threshold
        if (session.audioProcessor.getChunkCount() >= 5 || session.audioProcessor.getBufferSize() > 16000) {
          await processAudioBuffer(session, consultationId, io, sttService, aiGateway, dashboardEvents, emergencyService, socketService, redisPublisher);
        }
      } catch (error) {
        console.error('[SOCKET] Audio stream error:', error);
        socket.emit('audio:error', { message: 'Failed to process audio' });
      }
    });

    socket.on('audio:flush', async (payload) => {
      try {
        const { consultationId } = payload;
        const session = getOwnedActiveSession(socket, consultationId);

        if (!session) return;

        // Process remaining audio in buffer
        if (session.audioProcessor.getBufferSize() > 0) {
          await processAudioBuffer(session, consultationId, io, sttService, aiGateway, dashboardEvents, emergencyService, socketService, redisPublisher);
        }

        socket.emit('audio:flushed', { consultationId });
      } catch (error) {
        console.error('[SOCKET] Audio flush error:', error);
      }
    });

    // ======================
    // WEBRTC SIGNALING
    // ======================

    socket.on('webrtc:offer', async (payload) => {
      try {
        const { consultationId, offer } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) return;
        webrtcService.handleOffer(consultationId, socket.id, offer);
        console.log(`[SOCKET] WebRTC offer from ${socket.id}`);
      } catch (error) {
        console.error('[SOCKET] WebRTC offer error:', error);
      }
    });

    socket.on('webrtc:answer', async (payload) => {
      try {
        const { consultationId, answer, toSocketId } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) return;
        webrtcService.handleAnswer(consultationId, socket.id, answer, toSocketId);
        console.log(`[SOCKET] WebRTC answer from ${socket.id}`);
      } catch (error) {
        console.error('[SOCKET] WebRTC answer error:', error);
      }
    });

    socket.on('webrtc:ice-candidate', async (payload) => {
      try {
        const { consultationId, candidate } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) return;
        webrtcService.handleIceCandidate(consultationId, socket.id, candidate);
      } catch (error) {
        console.error('[SOCKET] ICE candidate error:', error);
      }
    });

    socket.on('webrtc:connected', async (payload) => {
      try {
        const { consultationId } = payload;
        if (!(await socketOwnsConsultation(socket, consultationId))) return;
        webrtcService.notifyConnectionStatus(consultationId, 'connected');
      } catch (error) {
        console.error('[SOCKET] WebRTC connected error:', error);
      }
    });

    // ======================
    // AVATAR MANAGEMENT
    // ======================

    socket.on('avatar:init', () => {
      socket.emit('avatar:error', {
        message: 'Avatar unavailable until an approved-response integration is verified.',
      });
    });

    socket.on('avatar:speak', () => {
      socket.emit('avatar:error', {
        message: 'Avatar speech is unavailable until approved response text can be enforced.',
      });
    });

    // ======================
    // DASHBOARD EVENTS
    // ======================

    socket.on('dashboard:join', (payload) => {
      try {
        const { userId } = payload;
        if (userId !== socket.data.userId) {
          socket.emit('dashboard:error', { message: 'Unauthorized' });
          return;
        }
        const dashboardRoom = `dashboard:${userId}`;
        socket.join(dashboardRoom);
        socket.emit('dashboard:joined', { room: dashboardRoom });
      } catch (error) {
        console.error('[SOCKET] Dashboard join error:', error);
      }
    });

    // ======================
    // DISCONNECT
    // ======================

    socket.on('disconnect', () => {
      console.log('[SOCKET] Client disconnected:', socket.id);
      // Cleanup any active sessions for this socket
      activeSessions.forEach((session, consultationId) => {
        if (session.socketId === socket.id) {
          activeSessions.delete(consultationId);
        }
      });
    });
  });
}

async function processAudioBuffer(
  session: ConsultationSession,
  consultationId: string,
  io: Server,
  sttService: SpeechService,
  aiGateway: AIGatewayService,
  dashboardEvents: DashboardEventsService,
  emergencyService: EmergencyService,
  socketService: SocketService,
  redisPublisher: any
) {
  if (session.isProcessing) return;

  session.isProcessing = true;

  try {
    // Get buffer
    const audioBuffer = session.audioProcessor.getBuffer();
    if (audioBuffer.length === 0) {
      session.isProcessing = false;
      return;
    }

    socketService.emit(consultationId, 'analysis_started', {
      consultationId,
      status: 'Understanding Symptoms...',
    });
    await dashboardEvents.recordStatus(consultationId, session.userId, 'Understanding Symptoms...');

    // Transcribe audio
    const sttResult = await sttService.transcribeAudioBuffer(audioBuffer, session.language);

    // Save transcript
    const transcript = await prisma.transcript.create({
      data: {
        consultationId,
        speaker: 'patient',
        text: sttResult.transcript,
        language: sttResult.language,
      },
    });

    session.transcripts.push({
      id: transcript.id,
      speaker: 'patient',
      text: sttResult.transcript,
      language: sttResult.language,
      timestamp: new Date(),
    });

    socketService.emit(consultationId, 'transcript_received', {
      speaker: 'patient',
      text: sttResult.transcript,
      language: sttResult.language,
    });
    io.to(consultationId).emit('consultation:transcript', {
      speaker: 'patient',
      text: sttResult.transcript,
      language: sttResult.language,
    });

    await redisPublisher.publish(
      'sehat:consultation:events',
      JSON.stringify({
        consultationId,
        event: 'transcript_received',
        speaker: 'patient',
        text: sttResult.transcript,
        language: sttResult.language,
        confidence: sttResult.confidence,
        timestamp: new Date().toISOString(),
      })
    );
    await dashboardEvents.recordEvent(consultationId, session.userId, 'transcript_received', {
      text: sttResult.transcript,
      language: sttResult.language,
    });

    socketService.emit(consultationId, 'analysis_started', {
      consultationId,
      status: 'Assessing Risk...',
    });
    await dashboardEvents.recordStatus(consultationId, session.userId, 'Assessing Risk...');

    const orchestrationResult = await aiGateway.sendTranscript(
      consultationId,
      sttResult.transcript,
      session.language,
      session.transcripts
    );

    // Save symptoms and risk assessment
    for (const symptom of orchestrationResult.symptoms || []) {
      await prisma.symptom.create({
        data: {
          consultationId,
          name: symptom.name,
          duration: symptom.duration,
          severity: symptom.severity,
        },
      });
    }

    if (orchestrationResult.riskAssessment) {
      await prisma.riskAssessment.upsert({
        where: { consultationId },
        create: {
          consultationId,
          riskScore: orchestrationResult.riskAssessment.riskScore,
          level: orchestrationResult.riskAssessment.level,
          confidence: orchestrationResult.riskAssessment.confidence,
          details: orchestrationResult.riskAssessment.details,
        },
        update: {
          riskScore: orchestrationResult.riskAssessment.riskScore,
          level: orchestrationResult.riskAssessment.level,
          confidence: orchestrationResult.riskAssessment.confidence,
          details: orchestrationResult.riskAssessment.details,
        },
      });
    }

    if (orchestrationResult.shouldEscalate) {
      const emergencyAlert = await emergencyService.createEmergencyAlert(
        consultationId,
        'safety',
        orchestrationResult.emergencyMessage || 'Emergency escalation detected'
      );

      socketService.emit(consultationId, 'emergency_detected', {
        type: 'safety',
        message: orchestrationResult.emergencyMessage,
        emergencyId: emergencyAlert.id,
      });
      await dashboardEvents.recordStatus(consultationId, session.userId, 'Emergency escalation detected');
      await redisPublisher.publish(
        'sehat:consultation:events',
        JSON.stringify({
          consultationId,
          event: 'emergency_detected',
          message: orchestrationResult.emergencyMessage,
          timestamp: new Date().toISOString(),
        })
      );
    }

    if (orchestrationResult.recommendations?.length) {
      socketService.emit(consultationId, 'appointment_found', {
        recommendations: orchestrationResult.recommendations,
      });
    }

    socketService.emit(consultationId, 'risk_detected', {
      riskLevel: orchestrationResult.riskAssessment?.level || 'unknown',
      riskScore: orchestrationResult.riskAssessment?.riskScore || 0,
      confidence: orchestrationResult.riskAssessment?.confidence || 0,
      details: orchestrationResult.riskAssessment?.details,
    });

    socketService.emit(consultationId, 'ai:response', {
      symptoms: orchestrationResult.symptoms,
      riskLevel: orchestrationResult.riskAssessment?.level || 'unknown',
      recommendations: orchestrationResult.recommendations,
      nextAction: orchestrationResult.nextAction,
    });
    await redisPublisher.publish(
      'sehat:consultation:events',
      JSON.stringify({
        consultationId,
        event: 'ai_response',
        symptoms: orchestrationResult.symptoms,
        riskLevel: orchestrationResult.riskAssessment?.level,
        nextAction: orchestrationResult.nextAction,
        timestamp: new Date().toISOString(),
      })
    );

    await dashboardEvents.recordStatus(consultationId, session.userId, 'Preparing Health Summary...');
    socketService.emit(consultationId, 'hospital_found', {
      hospitals: orchestrationResult.recommendations?.filter((r) => r.toLowerCase().includes('hospital')) || [],
    });

    if (orchestrationResult.nextAction === 'appointment-booking') {
      socketService.emit(consultationId, 'appointment_found', {
        nextAction: orchestrationResult.nextAction,
      });
    }

    socketService.emit(consultationId, 'analysis_completed', {
      consultationId,
      status: 'complete',
      timestamp: new Date(),
    });

    session.audioProcessor.clearBuffer();
  } catch (error) {
    console.error('[AUDIO_PROCESS] Processing failed', { errorName: safeErrorName(error) });
    if (error instanceof InvalidAIResponseError && error.shouldEscalate) {
      const message = 'Emergency escalation detected';
      socketService.emit(consultationId, 'emergency_detected', { type: 'safety', message });
      io.to(consultationId).emit('consultation:emergency-alert', { message });
      void emergencyService
        .createEmergencyAlert(consultationId, 'safety', message)
        .then(async () => {
          await dashboardEvents.recordStatus(
            consultationId,
            session.userId,
            'Emergency escalation detected',
          );
          await redisPublisher.publish(
            'sehat:consultation:events',
            JSON.stringify({
              consultationId,
              event: 'emergency_detected',
              message,
              timestamp: new Date().toISOString(),
            }),
          );
        })
        .catch((emergencyError) => {
          console.error('[AUDIO_PROCESS] Emergency persistence failed', {
            errorName: safeErrorName(emergencyError),
          });
        });
    }
    socketService.emit(consultationId, 'ai:error', { message: 'Failed to process audio' });
    io.to(consultationId).emit('ai:error', { message: 'Failed to process audio' });
  } finally {
    session.isProcessing = false;
  }
}

export { activeSessions };

function getOwnedActiveSession(socket: Socket, consultationId: unknown): ConsultationSession | undefined {
  if (typeof consultationId !== 'string') return undefined;
  const session = activeSessions.get(consultationId);
  return session?.userId === socket.data.userId ? session : undefined;
}

async function socketOwnsConsultation(socket: Socket, consultationId: unknown): Promise<boolean> {
  if (typeof consultationId !== 'string' || !consultationId) return false;
  const userId = socket.data.userId;
  if (typeof userId !== 'string' || !userId) return false;
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: { userId: true },
  });
  return consultation?.userId === userId;
}
