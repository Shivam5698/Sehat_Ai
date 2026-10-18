import { Request, Response } from 'express';
import { prisma } from '../database/client.js';
import { AIOrchestratorService } from '../services/aiOrchestratorService.js';
import { config } from '../config/index.js';
import { safeErrorName } from '../services/aiResponseBoundary.js';
import type { AuthRequest } from '../middleware/auth.js';

const orchestrator = new AIOrchestratorService(config.aiServiceUrl);

export async function generateReport(req: Request, res: Response) {
  try {
    const userId = (req as AuthRequest).user?.sub;
    const consultationId = req.body?.consultationId;

    if (!userId) {
      return res.status(401).json({ ok: false, message: 'Authentication required' });
    }
    if (typeof consultationId !== 'string' || !consultationId.trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Missing consultationId',
      });
    }

    // Verify consultation belongs to user
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        transcripts: true,
        symptoms: true,
        risk: true,
      },
    });

    if (!consultation || consultation.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: 'Unauthorized',
      });
    }

    // Generate report using AI
    const reportContent = await orchestrator.generateReport(consultationId);
    if (typeof reportContent !== 'string' || !reportContent.trim()) {
      return res.status(502).json({
        ok: false,
        message: 'Report generation returned no report content',
      });
    }

    // Save report to database
    const report = await prisma.medicalReport.create({
      data: {
        consultationId,
        title: 'Clinical Summary',
        summary: reportContent,
      },
    });

    res.json({
      ok: true,
      report: {
        id: report.id,
        content: report.summary,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    console.error('Generate report error', { errorName: safeErrorName(error) });
    res.status(500).json({
      ok: false,
      message: 'Failed to generate report',
    });
  }
}

export async function getReport(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { reportId } = req.params;

    if (!reportId) {
      return res.status(400).json({
        ok: false,
        message: 'Missing reportId',
      });
    }

    const report = await prisma.medicalReport.findUnique({
      where: { id: reportId },
      include: {
        consultation: {
          select: { userId: true },
        },
      },
    });

    if (!report || !report.consultation || report.consultation.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: 'Unauthorized',
      });
    }

    res.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error('Get report error', { errorName: safeErrorName(error) });
    res.status(500).json({
      ok: false,
      message: 'Failed to get report',
    });
  }
}

export async function listReports(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;

    const reports = await prisma.medicalReport.findMany({
      where: {
        consultation: {
          userId,
        },
      },
      include: {
        consultation: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      ok: true,
      reports,
    });
  } catch (error) {
    console.error('List reports error', { errorName: safeErrorName(error) });
    res.status(500).json({
      ok: false,
      message: 'Failed to list reports',
    });
  }
}

export async function deleteReport(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { reportId } = req.params;

    if (!reportId) {
      return res.status(400).json({
        ok: false,
        message: 'Missing reportId',
      });
    }

    const report = await prisma.medicalReport.findUnique({
      where: { id: reportId },
      include: {
        consultation: {
          select: { userId: true },
        },
      },
    });

    if (!report || !report.consultation || report.consultation.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: 'Unauthorized',
      });
    }

    await prisma.medicalReport.delete({
      where: { id: reportId },
    });

    res.json({
      ok: true,
      message: 'Report deleted',
    });
  } catch (error) {
    console.error('Delete report error', { errorName: safeErrorName(error) });
    res.status(500).json({
      ok: false,
      message: 'Failed to delete report',
    });
  }
}

export async function downloadReport(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { reportId } = req.params;

    if (!reportId) {
      return res.status(400).json({
        ok: false,
        message: 'Missing reportId',
      });
    }

    const report = await prisma.medicalReport.findUnique({
      where: { id: reportId },
      include: {
        consultation: {
          select: { userId: true },
        },
      },
    });

    if (!report || !report.consultation || report.consultation.userId !== userId) {
      return res.status(403).json({
        ok: false,
        message: 'Unauthorized',
      });
    }

    // For now, return as JSON. In production, generate PDF
    res.json({
      ok: true,
      report: {
        id: report.id,
        content: report.summary,
        format: 'json',
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    console.error('Download report error', { errorName: safeErrorName(error) });
    res.status(500).json({
      ok: false,
      message: 'Failed to download report',
    });
  }
}
