import { LOW_ATTENDANCE_THRESHOLD, type ClassStats, type Insight } from "@/lib/dashboard-insights";
import { AttendanceRing, SessionTrendChart } from "../../dashboard-charts";

export default function ClassAnalytics({
  stats,
  insights,
  sessionSeries,
  lowAttendanceNames,
}: {
  stats: ClassStats;
  insights: Insight[];
  sessionSeries: { date: string; rate: number }[];
  lowAttendanceNames: string[];
}) {
  const trend = stats.weekTrend;

  return (
    <div className="mt-6 rounded-sm border border-rule bg-white p-4">
      <p className="font-display text-lg font-semibold text-ink">Class analytics</p>

      <div className="mt-3 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <AttendanceRing rate={stats.attendanceRate} />
          <div>
            <p className="text-sm text-ink/70">Average attendance</p>
            {trend && (
              <p className="font-mono text-xs text-ink/50">
                {Math.round(trend.previous * 100)}% → {Math.round(trend.current * 100)}% this week
              </p>
            )}
          </div>
        </div>

        <div className="min-w-[12rem] flex-1">
          <p className="mb-1 text-sm text-ink/70">Attendance per session</p>
          <SessionTrendChart series={sessionSeries} />
        </div>
      </div>

      {insights.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-rule pt-3">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  insight.severity === "warning" ? "bg-danger" : "bg-teal"
                }`}
              />
              {insight.text}
            </li>
          ))}
        </ul>
      )}

      {lowAttendanceNames.length > 0 && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="text-sm text-ink/70">
            Below {Math.round(LOW_ATTENDANCE_THRESHOLD * 100)}% attendance
          </p>
          <p className="mt-1 text-sm text-ink">{lowAttendanceNames.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
