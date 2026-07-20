import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

function browserIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function ConnectivityBanner() {
  const [online, setOnline] = useState(browserIsOnline);

  useEffect(() => {
    const updateStatus = () => setOnline(browserIsOnline());
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex min-h-10 items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      You are offline. Saved information remains unchanged; reconnect to retry.
    </div>
  );
}
