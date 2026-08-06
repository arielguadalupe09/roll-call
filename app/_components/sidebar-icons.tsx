type IconName =
  | "logo"
  | "dashboard"
  | "schedule"
  | "students"
  | "attendance"
  | "admin"
  | "class"
  | "user"
  | "logout";

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  logo: (
    <>
      <path
        d="M5.5 2.5h5a1 1 0 0 1 1 1V4h.3a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1h-7.6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h.3v-.5a1 1 0 0 1 1-1z"
        strokeLinejoin="round"
      />
      <path d="M5.8 8.3l1.7 1.7L10.3 6.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  dashboard: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  schedule: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 2v2.5M11 2v2.5" strokeLinecap="round" />
    </>
  ),
  students: (
    <>
      <circle cx="6" cy="5.5" r="2.3" />
      <path d="M1.8 14c0-2.6 1.9-4.3 4.2-4.3s4.2 1.7 4.2 4.3" strokeLinecap="round" />
      <circle cx="11.6" cy="6.2" r="1.7" />
      <path d="M9.8 14c0-2 .9-3.5 2.4-4.1" strokeLinecap="round" />
    </>
  ),
  attendance: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.4 8.2l1.8 1.8L11 6.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  admin: (
    <path
      d="M8 1.8l5 1.8v4c0 3.6-2.2 6-5 6.7-2.8-.7-5-3.1-5-6.7v-4l5-1.8z"
      strokeLinejoin="round"
    />
  ),
  class: (
    <path
      d="M2 4.2A1.2 1.2 0 0 1 3.2 3h3.1l1.3 1.4H13A1.2 1.2 0 0 1 14 5.6V12a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 12V4.2z"
      strokeLinejoin="round"
    />
  ),
  user: (
    <>
      <circle cx="8" cy="5.6" r="2.6" />
      <path d="M2.6 14c0-2.9 2.4-4.8 5.4-4.8s5.4 1.9 5.4 4.8" strokeLinecap="round" />
    </>
  ),
  logout: (
    <path
      d="M6.2 2H3.2A1.2 1.2 0 0 0 2 3.2v9.6A1.2 1.2 0 0 0 3.2 14h3M10.2 11l3-3-3-3M13 8H6.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export default function SidebarIcon({
  name,
  className = "h-4 w-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
