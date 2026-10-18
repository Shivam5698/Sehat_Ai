import { Server } from 'socket.io';
import axios from 'axios';
import { SymptomAgent } from './symptomAgent.js';
import { SeverityAgent } from './severityAgent.js';
import { SafetyAgent } from './safetyAgent.js';
import { HospitalAgent } from './hospitalAgent.js';
import { AppointmentAgent } from './appointmentAgent.js';
import { ReportAgent } from './reportAgent.js';
import { prisma } from '../database/client.js';

export class Orchestrator {
  io: Server;
  constructor(io: Server) {
    this.io = io;
  }

  async handleTranscript(payload: any) {
    const { consultationId, text, language } = payload;
    // Step 1: symptom extraction
    const symptomAgent = new SymptomAgent();
    const symptoms = await symptomAgent.run({ text, language });
    this.io.to(consultationId).emit('consultation:agent-update', { agent: 'symptom', data: symptoms });

    // Step 2: severity
    const severityAgent = new SeverityAgent();
    const risk = await severityAgent.run({ symptoms });
    this.io.to(consultationId).emit('consultation:risk-update', risk);

    // Step 3: safety
    const safetyAgent = new SafetyAgent();
    const safety = await safetyAgent.run({ text, symptoms, risk });
    this.io.to(consultationId).emit('consultation:agent-update', { agent: 'safety', data: safety });

    if (safety.escalate) {
      this.io.to(consultationId).emit('consultation:emergency-alert', { message: safety.message });
      await prisma.emergencyEvent.create({ data: { consultationId, type: 'safety', message: safety.message } });
    }

    const urgency = safety.escalate
      ? 'emergency'
      : risk.level === 'critical' || risk.level === 'high'
        ? 'urgent'
        : 'routine';
    const hospitals =
      urgency === 'urgent' || urgency === 'emergency'
        ? await new HospitalAgent().run()
        : [];
    this.io.to(consultationId).emit('consultation:hospital-update', hospitals);

    const appointment =
      hospitals.length > 0
        ? await new AppointmentAgent().run({ hospitals, consultationId })
        : undefined;
    if (appointment) {
      this.io.to(consultationId).emit('consultation:appointment-update', appointment);
    }

    // Step 6: report generation
    const reportAgent = new ReportAgent();
    const report = await reportAgent.run({ consultationId, symptoms, risk, hospitals, appointment });
    this.io.to(consultationId).emit('consultation:report-update', report);

    // localized report event (use translation service to produce localized text)
    try {
      const { translateText } = await import('../services/translationService.js');
      const localized = await translateText(report.text || report.summary || '', language);
      this.io.to(consultationId).emit('consultation:localized-report', { ...report, localized });
    } catch (err) {
      this.io.to(consultationId).emit('consultation:localized-report', { ...report, localized: { text: report.text || report.summary || '', translated: false, targetLang: language } });
    }

    // persist agent logs
    await prisma.agentLog.createMany({ data: [
      { consultationId, agentName: 'symptom', payload: JSON.stringify(symptoms) },
      { consultationId, agentName: 'severity', payload: JSON.stringify(risk) },
      { consultationId, agentName: 'safety', payload: JSON.stringify(safety) },
    ] });
  }
}
