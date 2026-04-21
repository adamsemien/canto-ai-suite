import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function classify(status: number): StatusClass {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  return "2xx";
}

function skipped(name: string, method: string, reason: string): TestResult {
  return {
    name,
    method,
    url: null,
    status_code: null,
    status_class: null,
    pass: false,
    skipped: true,
    skip_reason: reason,
    content_type: null,
    error_preview: null,
    notes: null,
  };
}

async function runTest(
  name: string,
  url: string,
  token: string,
): Promise<TestResult & { rawText?: string; rawJson?: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    return {
      name,
      method: "GET",
      url,
      status_code: null,
      status_class: null,
      pass: false,
      skipped: false,
      skip_reason: null,
      content_type: null,
      error_preview: `network error: ${err instanceof Error ? err.message : String(err)}`,
      notes: null,
    };
  }

  const statusClass = classify(res.status);
  const contentType = res.headers.get("content-type");
  const isBinary = !!contentType && !/^(text\/|application\/(json|xml|.*\+json))/i.test(contentType);
  const pass = res.ok;

  let errorPreview: string | null = null;
  let rawText: string | undefined;
  let rawJson: unknown;
  let notes: string | null = null;

  if (isBinary && pass) {
    const buf = await res.arrayBuffer();
    notes = `binary response: ${buf.byteLength} bytes, content-type=${contentType}`;
  } else {
    rawText = await res.text();
    if (!pass) {
      errorPreview = rawText.slice(0, 200);
    } else if (contentType?.includes("json")) {
      try {
        rawJson = JSON.parse(rawText);
      } catch {
        // leave rawJson undefined
      }
    }
  }

  return {
    name,
    method: "GET",
    url,
    status_code: res.status,
    status_class: statusClass,
    pass,
    skipped: false,
    skip_reason: null,
    content_type: contentType,
    error_preview: errorPreview,
    notes,
    rawText,
    rawJson,
  };
}

function extractFirstResultId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { results?: Array<Record<string, unknown>> };
  const first = j.results?.[0];
  if (!first) return null;
  const candidates = ["id", "assetId", "uid", "_id"];
  for (const key of candidates) {
    const v = first[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function extractResultCount(json: unknown): number | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { results?: unknown[]; found?: number };
  if (typeof j.found === "number") return j.found;
  if (Array.isArray(j.results)) return j.results.length;
  return null;
}

function stripInternal(r: TestResult & { rawText?: string; rawJson?: unknown }): TestResult {
  const { rawText: _rawText, rawJson: _rawJson, ...rest } = r;
  void _rawText;
  void _rawJson;
  return rest;
}

export async function GET(): Promise<NextResponse<DiagnosticsResponse>> {
  const token = process.env.CANTO_ACCESS_TOKEN;
  const tenant = process.env.CANTO_TENANT;

  if (!tenant || !token) {
    const missing = [!tenant && "CANTO_TENANT", !token && "CANTO_ACCESS_TOKEN"]
      .filter(Boolean)
      .join(", ");
    const tests: TestResult[] = [
      skipped("search", "GET", `missing env: ${missing}`),
      skipped("image_metadata", "GET", `missing env: ${missing}`),
      skipped("binary_render", "GET", `missing env: ${missing}`),
    ];
    return NextResponse.json({
      status: "error",
      tenant: tenant ?? null,
      access_token_present: !!token,
      summary: { passed: 0, failed: 0, skipped: tests.length, total: tests.length },
      tests,
    });
  }

  const base = `https://${tenant}.canto.com`;

  const searchResult = await runTest(
    "search",
    `${base}/api/v1/search?keyword=NBC&scheme=image&limit=3`,
    token,
  );
  const firstId = searchResult.pass ? extractFirstResultId(searchResult.rawJson) : null;
  const resultCount = searchResult.pass ? extractResultCount(searchResult.rawJson) : null;
  if (searchResult.pass) {
    searchResult.notes = `found=${resultCount ?? "?"} first_id=${firstId ?? "(none)"}`;
  }

  let metadataResult: TestResult & { rawText?: string; rawJson?: unknown };
  let binaryResult: TestResult & { rawText?: string; rawJson?: unknown };

  if (!searchResult.pass) {
    metadataResult = skipped("image_metadata", "GET", "search failed; cannot derive asset id");
    binaryResult = skipped("binary_render", "GET", "search failed; cannot derive asset id");
  } else if (!firstId) {
    metadataResult = skipped(
      "image_metadata",
      "GET",
      "search returned no results or no id field",
    );
    binaryResult = skipped(
      "binary_render",
      "GET",
      "search returned no results or no id field",
    );
  } else {
    metadataResult = await runTest(
      "image_metadata",
      `${base}/api/v1/image/${encodeURIComponent(firstId)}`,
      token,
    );
    binaryResult = await runTest(
      "binary_render",
      `${base}/api_binary/v1/image/${encodeURIComponent(firstId)}?format=jpg&size=1080x1920`,
      token,
    );
  }

  const tests = [searchResult, metadataResult, binaryResult].map(stripInternal);
  const passed = tests.filter((t) => t.pass).length;
  const failed = tests.filter((t) => !t.pass && !t.skipped).length;
  const skippedCount = tests.filter((t) => t.skipped).length;

  const status: "ok" | "degraded" | "error" =
    passed === tests.length ? "ok" : passed === 0 ? "error" : "degraded";

  return NextResponse.json({
    status,
    tenant,
    access_token_present: true,
    summary: { passed, failed, skipped: skippedCount, total: tests.length },
    tests,
  });
}
