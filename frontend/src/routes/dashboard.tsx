import { createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Hospital,
  Shield,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AgentCard } from "@/components/dashboard/AgentCard";
import { SectionHeading } from "@/components/shared/SectionHeading";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Live Agent Dashboard | Sehat AI" },
      {
        name: "description",
        content: "Real-time multi-agent activity, workflow timeline, risk monitoring and AI feed.",
      },
      { property: "og:title", content: "Sehat AI Dashboard" },
      { property: "og:description", content: "Watch every AI agent reason in real-time." },
    ],
  }),
  component: DashboardPage,
});

const agents = [
  {
    name: "Understanding Symptoms",
    task: "Parsing transcript",
    icon: Activity,
    progress: 92,
    confidence: 96,
    status: "active",
    responseTime: "240 ms",
  },
  {
    name: "Analyzing Condition",
    task: "Scoring risk",
    icon: ShieldAlert,
    progress: 78,
    confidence: 91,
    status: "active",
    responseTime: "180 ms",
  },
  {
    name: "Checking Risk",
    task: "Monitoring",
    icon: Shield,
    progress: 100,
    confidence: 99,
    status: "complete",
    responseTime: "60 ms",
  },
  {
    name: "Finding Nearby Care",
    task: "Searching nearby",
    icon: Hospital,
    progress: 65,
    confidence: 88,
    status: "active",
    responseTime: "320 ms",
  },
  {
    name: "Preparing Medical Summary",
    task: "Booking slot",
    icon: CalendarCheck,
    progress: 45,
    confidence: 84,
    status: "active",
    responseTime: "410 ms",
  },
  {
    name: "Finalizing Report",
    task: "Awaiting inputs",
    icon: FileText,
    progress: 12,
    confidence: 70,
    status: "idle",
    responseTime: "—",
  },
] as const;

const timeline = [
  "Symptoms collected",
  "Fever detected",
  "Severity analyzed",
  "Hospital recommended",
  "Appointment booked",
  "Report generated",
];

const feed = [
  "Analyzing symptoms…",
  "Checking emergency risk…",
  "Searching nearest hospitals…",
  "Verifying doctor availability…",
  "Booking appointment…",
  "Generating AI report…",
];

const revealDelays = [0, 180, 360, 540, 720, 900];

function useDashboardReveal(shouldReduceMotion: boolean | null) {
  const [revealedStep, setRevealedStep] = useState(0);
  const hasPlayed = useRef(false);

  useEffect(() => {
    if (hasPlayed.current || shouldReduceMotion === null) return;
    hasPlayed.current = true;

    if (shouldReduceMotion) {
      setRevealedStep(revealDelays.length);
      return;
    }

    const timers = revealDelays.map((delay, index) =>
      window.setTimeout(() => setRevealedStep(index + 1), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [shouldReduceMotion]);

  return revealedStep;
}

function DashboardPage() {
  const { t } = useTranslation(["common", "dashboard"]);
  const shouldReduceMotion = useReducedMotion();
  const revealedStep = useDashboardReveal(shouldReduceMotion);
  const dashboardText = (key: string, fallback: string) =>
    t(key, { ns: "dashboard", defaultValue: fallback });
  const riskScore = 72;
  const riskLabel =
    riskScore >= 70
      ? dashboardText("riskHigh", "High risk")
      : riskScore >= 40
        ? dashboardText("riskModerate", "Moderate risk")
        : dashboardText("riskLow", "Low risk");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-section py-8 md:py-12">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        <RevealSection order={0} revealedStep={revealedStep} shouldReduceMotion={shouldReduceMotion}>
          <SectionHeading
            align="left"
            eyebrow={dashboardText("liveMonitoring", "Live monitoring")}
            title={dashboardText("multiAgentActivity", "Multi-agent activity dashboard")}
            subtitle={dashboardText(
              "subtitle",
              "A clear view of the current analysis, care coordination, and next steps.",
            )}
          />
        </RevealSection>

        <RevealSection order={1} revealedStep={revealedStep} shouldReduceMotion={shouldReduceMotion}>
          <section aria-labelledby="current-status-title" className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                {dashboardText("currentStatusEyebrow", "At a glance")}
              </p>
              <h2 id="current-status-title" className="mt-1 font-display text-2xl font-bold">
                {dashboardText("currentStatus", "Current status")}
              </h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-mint px-3 py-1.5 text-xs font-semibold text-primary">
              <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
              {dashboardText("analysisInProgress", "Analysis in progress")}
            </span>
          </div>

            <div className="grid gap-4 md:grid-cols-3">
            <StatusCard
              label={dashboardText("riskMonitoring", "Risk monitoring")}
              value={riskLabel}
              detail={`${dashboardText("riskScore", "Risk score")}: ${riskScore}/100`}
              icon={ShieldAlert}
              tone="warning"
            />
            <StatusCard
              label={dashboardText("emergency", "Emergency likelihood")}
              value="12%"
              detail={dashboardText("emergencyDetail", "Continue monitoring for changes")}
              icon={AlertTriangle}
              tone="success"
            />
            <StatusCard
              label={dashboardText("confidence", "Assessment confidence")}
              value="93%"
              detail={dashboardText("confidenceDetail", "Based on current analysis")}
              icon={CheckCircle2}
              tone="primary"
            />
            </div>
          </section>
        </RevealSection>

        <RevealSection order={2} revealedStep={revealedStep} shouldReduceMotion={shouldReduceMotion}>
          <section aria-labelledby="analysis-title" className="mt-10">
            <SectionTitle
              id="analysis-title"
              eyebrow={dashboardText("analysisEyebrow", "Live analysis")}
              title={dashboardText("currentAnalysis", "Current analysis")}
              description={dashboardText(
                "analysisDescription",
                "See current agent progress. This graph uses the progress values already available in this dashboard; it is not a historical trend.",
              )}
            />
            <div className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold">
                    {dashboardText("agentProgressGraph", "Agent progress")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dashboardText("agentProgressDescription", "Current progress by active analysis area.")}
                  </p>
                </div>
                <span className="rounded-full border border-border bg-section px-3 py-1 text-xs font-medium text-muted-foreground">
                  {dashboardText("graphLegendProgress", "Progress (%)")}
                </span>
              </div>
              <div className="mt-5 h-[340px] w-full" aria-label={dashboardText("agentProgressGraph", "Agent progress")}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...agents]}
                    layout="vertical"
                    margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke="var(--color-border)" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                      unit="%"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={152}
                      tick={{ fill: "var(--color-foreground)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-mint)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-card)",
                      }}
                      formatter={(value: unknown) => [`${value}%`, dashboardText("progress", "Progress")]}
                    />
                    <Bar
                      dataKey="progress"
                      name={dashboardText("graphLegendProgress", "Progress (%)")}
                      fill="var(--color-primary)"
                      radius={[0, 8, 8, 0]}
                      barSize={20}
                    >
                      <LabelList dataKey="progress" position="right" formatter={(value: unknown) => `${value}%`} fill="var(--color-foreground)" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard key={agent.name} {...agent} />
              ))}
            </div>
          </section>
        </RevealSection>

        <RevealSection order={3} revealedStep={revealedStep} shouldReduceMotion={shouldReduceMotion}>
          <section aria-labelledby="care-title" className="mt-10">
          <SectionTitle
            id="care-title"
            eyebrow={dashboardText("careEyebrow", "Next steps")}
            title={dashboardText("careRecommendations", "Care recommendations")}
            description={dashboardText(
              "careDescription",
              "Follow the workflow from assessment to coordinated care.",
            )}
          />
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-bold">
                    {dashboardText("workflowTimeline", "Workflow timeline")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dashboardText("workflowDescription", "Completed steps, the active step, and what comes next.")}
                  </p>
                </div>
                <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-primary">
                  {dashboardText("sequenceLabel", "In sequence")}
                </span>
              </div>
              <ol className="mt-7 space-y-1" aria-label={dashboardText("workflowTimeline", "Workflow timeline")}>
                {timeline.map((step, index) => {
                  const agentStatus = agents[index]?.status;
                  const state =
                    agentStatus === "complete"
                      ? "complete"
                      : agentStatus === "active"
                        ? "active"
                        : "upcoming";
                  return (
                    <WorkflowStep
                      key={step}
                      label={step}
                      state={state}
                      index={index}
                      dashboardText={dashboardText}
                    />
                  );
                })}
              </ol>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warning/15 text-warning">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold">
                    {dashboardText("riskMonitoring", "Risk monitoring")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dashboardText("riskDescription", "The current score is shown without changing the underlying assessment.")}
                  </p>
                </div>
              </div>
              <div className="mt-7 flex items-end justify-between gap-4">
                <div>
                  <div className="text-5xl font-bold tracking-tight text-warning">
                    {riskScore}
                    <span className="text-xl text-muted-foreground">/100</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold">{riskLabel}</p>
                </div>
                <span className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-right text-xs font-semibold text-foreground">
                  <span className="block text-muted-foreground">{dashboardText("severity", "Severity score")}</span>
                  {dashboardText("reviewRecommended", "Review recommended")}
                </span>
              </div>
              <div className="mt-5" role="progressbar" aria-label={`${dashboardText("riskScore", "Risk score")}: ${riskScore} out of 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={riskScore}>
                <div className="h-3 overflow-hidden rounded-full bg-mint">
                  <div className="h-full rounded-full bg-warning" style={{ width: `${riskScore}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{dashboardText("riskLow", "Low risk")}</span>
                  <span>{dashboardText("riskHigh", "High risk")}</span>
                </div>
              </div>
            </div>
            </div>
          </section>
        </RevealSection>

        <RevealSection order={4} revealedStep={revealedStep} shouldReduceMotion={shouldReduceMotion}>
          <section aria-labelledby="activity-title" className="mt-10">
          <SectionTitle
            id="activity-title"
            eyebrow={dashboardText("activityEyebrow", "What is happening")}
            title={dashboardText("recentActivity", "Recent activity")}
            description={dashboardText(
              "activityDescription",
              "Latest activity is shown in order. Exact timestamps are not available in the current data.",
            )}
          />
            <div className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <ul className="grid gap-3 md:grid-cols-2" aria-live="polite">
              {feed.map((item, index) => (
                <li key={item} className="flex items-center gap-3 rounded-2xl border border-border bg-section px-4 py-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${index === 0 ? "bg-primary text-primary-foreground" : "bg-mint text-primary"}`}>
                    {index === 0 ? <Sparkles className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {index === 0
                        ? dashboardText("inProgress", "In progress")
                        : dashboardText("queued", "Recorded in current session")}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </li>
              ))}
            </ul>
            </div>
          </section>
        </RevealSection>

        <RevealSection order={5} revealedStep={revealedStep} shouldReduceMotion={shouldReduceMotion}>
          <section aria-labelledby="recommendations-title" className="mt-10">
            <SectionTitle
              id="recommendations-title"
              eyebrow={dashboardText("recommendationsEyebrow", "Care guidance")}
              title={dashboardText("recommendations", "Recommendations")}
              description={dashboardText(
                "recommendationsDescription",
                "Recommendation details will appear here when they are returned by the consultation.",
              )}
            />
            <div className="mt-5 rounded-3xl border border-dashed border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-mint text-primary">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold">{dashboardText("recommendationsPending", "Recommendations are pending")}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {dashboardText(
                      "recommendationsPendingDescription",
                      "The current dashboard data includes agent progress and workflow activity, but no recommendation text to display yet.",
                    )}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </RevealSection>
      </div>
    </div>
  );
}

function SectionTitle({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 id={id} className="mt-1 font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function RevealSection({
  order,
  revealedStep,
  shouldReduceMotion,
  children,
}: {
  order: number;
  revealedStep: number;
  shouldReduceMotion: boolean | null;
  children: React.ReactNode;
}) {
  const isVisible = shouldReduceMotion === true || revealedStep > order;
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.35, ease: "easeOut" }
      }
      aria-hidden={!isVisible}
    >
      {children}
    </motion.div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ShieldAlert;
  tone: "warning" | "success" | "primary";
}) {
  const styles = {
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
    primary: "bg-mint text-primary",
  };
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${styles[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function WorkflowStep({
  label,
  state,
  index,
  dashboardText,
}: {
  label: string;
  state: "complete" | "active" | "upcoming";
  index: number;
  dashboardText: (key: string, fallback: string) => string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const stateLabel =
    state === "complete"
      ? dashboardText("completed", "Completed")
      : state === "active"
        ? dashboardText("inProgress", "In progress")
        : dashboardText("upcoming", "Upcoming");
  return (
    <motion.li
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, delay: index * 0.04 }}
      className="relative flex gap-3"
    >
      {index < 5 && <span className="absolute left-4 top-9 h-8 w-px bg-border" aria-hidden="true" />}
      <span
        className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${
          state === "complete"
            ? "border-success bg-success text-white"
            : state === "active"
              ? "border-primary bg-primary text-primary-foreground motion-safe:animate-pulse"
              : "border-border bg-background text-muted-foreground"
        }`}
        aria-hidden="true"
      >
        {state === "complete" ? <Check className="h-4 w-4" /> : index + 1}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pb-4">
        <span className={`text-sm ${state === "active" ? "font-semibold" : "text-foreground"}`}>{label}</span>
        <span className={`shrink-0 text-xs font-medium ${state === "active" ? "text-primary" : "text-muted-foreground"}`}>
          {stateLabel}
        </span>
      </div>
    </motion.li>
  );
}
