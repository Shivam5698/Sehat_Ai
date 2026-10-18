import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthenticatedRoute } from "@/components/auth/AuthenticatedRoute";
import {
  apiClient,
  consultationAPI,
  reportAPI,
  type ConsultationSummary,
} from "@/services/api/client";
import { ApiError } from "@/types/aiDoctor";

type ReportSummary = {
  id: string;
  title: string;
  createdAt: string;
};

type ReportsResponse = {
  ok: boolean;
  reports: ReportSummary[];
};

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports | Sehat AI" },
      {
        name: "description",
        content: "Reports saved to your Sehat AI consultations.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <AuthenticatedRoute>
      <ReportsContent />
    </AuthenticatedRoute>
  );
}

function ReportsContent() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [consultationId, setConsultationId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [generationMessage, setGenerationMessage] = useState("");
  const [generationKey, setGenerationKey] = useState(0);
  const generationPending = useRef(false);

  useEffect(() => {
    let active = true;

    Promise.all([apiClient.get<ReportsResponse>("/api/reports/list"), consultationAPI.list()])
      .then(([response, consultationResponse]) => {
        if (!response.ok || !Array.isArray(response.reports)) {
          throw new Error("Invalid reports response");
        }
        if (!consultationResponse.ok || !Array.isArray(consultationResponse.sessions)) {
          throw new Error("Invalid consultation list response");
        }
        if (active) {
          setReports(response.reports);
          setConsultations(consultationResponse.sessions);
          setConsultationId((current) => current || consultationResponse.sessions[0]?.id || "");
        }
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Reports are unavailable right now.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [generationKey]);

  async function generateReport() {
    if (!consultationId || generationPending.current) return;
    generationPending.current = true;
    setGenerating(true);
    setGenerationError("");
    setGenerationMessage("");
    try {
      const response = await reportAPI.generate(consultationId);
      if (
        !response.ok ||
        !response.report ||
        typeof response.report.id !== "string" ||
        typeof response.report.content !== "string" ||
        !response.report.content.trim() ||
        typeof response.report.createdAt !== "string"
      ) {
        throw new Error("The report service did not confirm a complete report.");
      }
      setGenerationMessage("Report generated and saved to your account.");
      setGenerationKey((current) => current + 1);
    } catch (requestError: unknown) {
      setGenerationError(
        requestError instanceof Error ? requestError.message : "Unable to generate a report.",
      );
    } finally {
      generationPending.current = false;
      setGenerating(false);
    }
  }

  return (
    <main className="bg-section min-h-[calc(100vh-4rem)] py-10">
      <div className="container mx-auto max-w-4xl px-4">
        <section className="rounded-3xl border border-border bg-card p-8 shadow-medical">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl font-bold">Your reports</h1>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Reports are generated content and are not a substitute for review by a qualified
            healthcare professional.
          </p>

<<<<<<< HEAD
          <div className="p-5 sm:p-8 space-y-8">
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <strong>For review:</strong> This AI-generated report is a summary to discuss with a qualified clinician. It is not a diagnosis or prescription.
            </div>
            <Grid2>
              <Field label={t('fields.patientName')} value={t('patientNameValue', 'Anonymous User')} />
              <Field label={t('fields.ageSex')} value={t('ageSexValue', '29 / Male')} />
              <Field label={t('fields.consultType')} value={t('consultTypeValue', 'AI Video — Real-Time')} />
              <Field label={t('fields.language')} value={t('languageValue', 'English')} />
            </Grid2>

            <Section icon={Stethoscope} title={t('patientSummaryTitle')}>
              <p className="text-sm text-muted-foreground leading-relaxed">{t('patientSummary')}</p>
            </Section>

            <Section icon={ShieldAlert} title="Severity Analysis">
              <Grid2>
                <Stat label="Severity Score" value="72/100" tone="warning" />
                <Stat label="Emergency Probability" value="12%" tone="success" />
                <Stat label="Confidence" value="93%" tone="primary" />
                <Stat label="Recommended Specialist" value="General Physician" tone="primary" />
              </Grid2>
            </Section>

            <Section icon={Pill} title="Medicines Suggested">
              <ul className="text-sm space-y-1.5 list-disc pl-5">
                <li>Paracetamol 500 mg — every 6 hours as needed for fever.</li>
                <li>Lozenges — for sore throat relief.</li>
                <li>ORS / fluids — maintain hydration.</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground italic">Prescription should be confirmed by attending physician.</p>
            </Section>

            <Section icon={AlertTriangle} title="Precautions">
              <ul className="text-sm space-y-1.5 list-disc pl-5">
                <li>Isolate at home for 48–72 hours.</li>
                <li>Monitor temperature every 6 hours.</li>
                <li>Return to ER if breathlessness or chest pain develops.</li>
              </ul>
            </Section>

            <Section icon={FileText} title="Escalation Details">
              <div className="rounded-2xl bg-mint border border-border p-4 text-sm">
                Appointment auto-booked at <strong>City Care Hospital</strong> with <strong>Dr. Maria Khan</strong> today at <strong>3:30 PM</strong>. Estimated wait 12 minutes. Patient will receive SMS confirmation.
=======
          <section className="mt-8 rounded-2xl border border-border p-5">
            <h2 className="font-semibold">Generate a report</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Generate and save a report from one of your consultations.
            </p>
            {consultations.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground" role="status">
                No consultations are available for report generation.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <select
                  className="min-w-52 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Consultation for report"
                  value={consultationId}
                  onChange={(event) => setConsultationId(event.target.value)}
                  disabled={generating}
                >
                  {consultations.map((consultation) => (
                    <option key={consultation.id} value={consultation.id}>
                      {formatDate(consultation.startedAt || consultation.createdAt)}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => void generateReport()}
                  disabled={generating || !consultationId}
                >
                  {generating ? "Generating…" : "Generate report"}
                </Button>
>>>>>>> origin/dev
              </div>
            )}
            {generationError ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {generationError}
              </p>
            ) : null}
            {generationMessage ? (
              <p className="mt-4 text-sm text-muted-foreground" role="status">
                {generationMessage}
              </p>
            ) : null}
          </section>

          {loading ? (
            <p className="mt-8 text-sm" role="status">
              Loading reports…
            </p>
          ) : error ? (
            <p className="mt-8 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : reports.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground" role="status">
              No reports are available for your consultations.
            </p>
          ) : (
            <ul className="mt-8 divide-y divide-border">
              {reports.map((report) => (
                <li key={report.id} className="py-4">
                  <h2 className="font-semibold">{report.title}</h2>
                  <time
                    className="mt-1 block text-sm text-muted-foreground"
                    dateTime={report.createdAt}
                  >
                    {formatDate(report.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}
