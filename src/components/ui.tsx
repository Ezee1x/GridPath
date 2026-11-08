import { ReactNode } from "react";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "teal" | "green" | "red";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        value === "Engineer verified" ||
        value === "Verified" ||
        value === "Ready for review"
          ? "green"
          : value === "Conflicting evidence"
            ? "red"
            : value === "Source-backed"
              ? "teal"
              : value === "Missing" ||
                  value === "Needs review" ||
                  value === "Requested"
                ? "amber"
                : "neutral"
      }
    >
      {value}
    </Badge>
  );
}
export function Progress({ percent }: { percent: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Required fields populated"
    >
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
