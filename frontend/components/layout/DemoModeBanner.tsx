import { isDemoMode } from "@/lib/env";

const DEMO_BANNER_TEXT =
  "🚨 DEMO MODE ACTIVE: This is an interactive sandbox. To run the real-time scanning engine on your own data, please clone the GitHub repository and insert your own API tokens in the .env file.";

export function DemoModeBanner() {
  if (!isDemoMode()) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-[100] border-b border-red-700 bg-red-600 px-4 py-2.5 text-center text-sm font-medium leading-snug text-white shadow-md"
    >
      {DEMO_BANNER_TEXT}
    </div>
  );
}
