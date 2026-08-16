import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./app/App.tsx";
import { NetworkError, ApiError } from "./app/lib/api";
import "./styles/index.css";

// UI Adoption F10 — TanStack Query.
//
// Doc 3 §2.5: adopt it BEFORE the wiring sprint, or hand-roll caching, retry,
// stale-while-revalidate and mutation invalidation 22 times, inconsistently.
// (Measured: 55 of the 80 screens already hand-roll a `loading` boolean.)
//
// The defaults below are tuned for a LAN-local server, which is a different
// animal from a public API: latency is ~1ms, so refetching is cheap, but the
// server can vanish entirely when the property's machine is off.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server is on the same network; data going stale for 30s is fine
      // and saves a request storm when several panels mount at once.
      staleTime: 30_000,
      // Refetching on focus is the right default here: a front-desk browser
      // sits open all shift, and coming back to a stale arrivals list is
      // exactly the failure that makes staff distrust the screen.
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry what will not change: a 403 is a permission answer, a
        // 404 is an absent record. Retrying either just delays the message.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        // The server being unreachable IS worth retrying — it is usually a
        // machine rebooting or wifi re-associating, and recovers in seconds.
        if (error instanceof NetworkError) return failureCount < 3;
        return failureCount < 2;
      },
    },
    mutations: {
      // A mutation is a write. Retrying one automatically risks double-posting
      // a charge or a payment, and the server's idempotency keys (B23) are
      // opt-in per call rather than blanket. So: never retry by default;
      // callers that are genuinely idempotent opt in explicitly.
      retry: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
