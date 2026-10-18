import { motion, useReducedMotion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

type Status = "active" | "idle" | "complete";

export function AgentCard({
  name,
  task,
  icon: Icon,
  progress,
  confidence,
  status = "active",
  responseTime,
}: {
  name: string;
  task: string;
  icon: LucideIcon;
  progress: number;
  confidence: number;
  status?: Status;
  responseTime?: string;
}) {
  const { t } = useTranslation("dashboard");
  const shouldReduceMotion = useReducedMotion();
  const statusColor =
    status === "active" ? "bg-primary" : status === "complete" ? "bg-success" : "bg-muted-foreground";
  const statusLabel = t(`status.${status}`, {
    defaultValue: status === "idle" ? "Waiting" : status === "complete" ? "Complete" : "Active",
  });
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="rounded-3xl border border-border bg-card p-5 shadow-soft hover:shadow-medical transition-shadow"
    >
      <div className="flex min-h-12 items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-mint text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-sm">{name}</div>
            <div className="text-xs text-muted-foreground">{task}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${statusColor} ${status === "active" ? "animate-pulse" : ""}`}
            aria-hidden="true"
          />
          <span>{statusLabel}</span>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{t("progress", { defaultValue: "Progress" })}</span><span>{progress}%</span>
        </div>
        <div
          className="h-2 rounded-full bg-mint overflow-hidden"
          role="progressbar"
          aria-label={`${name} ${t("progress", { defaultValue: "progress" })}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <motion.div
            initial={shouldReduceMotion ? false : { width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.2, ease: "easeOut" }}
            className="h-full bg-gradient-primary"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {t("confidenceShort", { defaultValue: "Confidence" })}{" "}
          <span className="font-semibold text-foreground">{confidence}%</span>
        </span>
        {responseTime && (
          <span className="text-muted-foreground">
            <span className="sr-only">{t("responseTime", { defaultValue: "Response time" })}: </span>
            {responseTime}
          </span>
        )}
      </div>
    </motion.div>
  );
}
