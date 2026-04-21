"use client";

import { useCallback, useEffect, useState } from "react";

type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";

type TestResult = {
  name: string;
  method: string;
  url: string | null;
  status_code: number | null;
  status_class: StatusClass | null;
  pass: boolean;
  skipped: boolean;
  skip_reason: string | null;
  content_type: string | null;
  error_preview: string | null;
  notes: string | null;
};

type DiagnosticsResponse = {
  status: "ok" | "degraded" | "error";
  tenant: string | null;
  access_token_present: boolean;
  summary: { passed: number; failed: number; skipped: number; total: number };
  tests: TestResult[];
};

const STATUS_COLORS: Record<"ok" | "degraded" | "error", string> = {
  ok: "bg-green-100 text-green-800 border-green-200",
  degraded: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-red-100 text-red-800 border-red-200",
};

function StatusBadge({ test }: { test: TestResult }) {
  if (test.skipped) {
    return (
      <span className="inline-flex rounded-full border border-[#E5E5E5] bg-[#F6F6F6] px-2 py-0.5 text-xs text-[#6B6B6B]">
        skipped
      </span>
    );
  }
  if (test.pass) {
    return (
      <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
        pass
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
      fail
    </span>
  );
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/diagnostics/canto", { cache: "no-store" });
      const json = (await res.json()) as DiagnosticsResponse;
      setData(json);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#1A1A1A]">
            Canto API Diagnostics
          </h1>
          <p className="mt-2 text-sm text-[#6B6B6B]">
            Runs the underlying API calls that back the Runtype agent tools. If a
            tool fails in chat, check here first.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="rounded-md border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm font-medium text-[#1A1A1A] transition-colors hover:border-[#D5D5D5] disabled:opacity-50"
        >
          {loading ? "Running..." : "Re-run"}
        </button>
      </div>

      {data ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-[#6B6B6B]">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              STATUS_COLORS[data.status]
            }`}
          >
            {data.status}
          </span>
          <span>
            tenant: <span className="font-mono text-[#1A1A1A]">{data.tenant ?? "(missing)"}</span>
          </span>
          <span>
            token:{" "}
            <span className="font-mono text-[#1A1A1A]">
              {data.access_token_present ? "present" : "missing"}
            </span>
          </span>
          <span>
            {data.summary.passed} pass · {data.summary.failed} fail · {data.summary.skipped} skip
          </span>
        </div>
      ) : null}

      {fetchError ? (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to call /api/diagnostics/canto: {fetchError}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-[#F0F0F0]">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[#FAFAFA] text-left text-xs uppercase tracking-wide text-[#6B6B6B]">
            <tr>
              <th className="px-4 py-3 font-medium">Tool</th>
              <th className="px-4 py-3 font-medium">HTTP</th>
              <th className="px-4 py-3 font-medium">Result</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[#6B6B6B]">
                  Running diagnostics...
                </td>
              </tr>
            ) : null}
            {data?.tests.map((test) => (
              <tr key={test.name} className="border-t border-[#F0F0F0] align-top">
                <td className="px-4 py-3">
                  <div className="font-mono text-[#1A1A1A]">{test.name}</div>
                  {test.url ? (
                    <div
                      className="mt-1 break-all font-mono text-xs text-[#9A9A9A]"
                      title={test.url}
                    >
                      {test.method} {test.url}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {test.status_code !== null ? (
                    <span className="font-mono text-[#1A1A1A]">
                      {test.status_code}
                      {test.status_class ? ` (${test.status_class})` : ""}
                    </span>
                  ) : (
                    <span className="text-[#9A9A9A]">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge test={test} />
                </td>
                <td className="px-4 py-3">
                  {test.skipped && test.skip_reason ? (
                    <span className="text-[#6B6B6B]">{test.skip_reason}</span>
                  ) : null}
                  {test.error_preview ? (
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs text-red-700">
                      {test.error_preview}
                    </pre>
                  ) : null}
                  {test.notes ? (
                    <div className="font-mono text-xs text-[#6B6B6B]">{test.notes}</div>
                  ) : null}
                  {!test.skipped && !test.error_preview && !test.notes ? (
                    <span className="text-[#9A9A9A]">—</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
