import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_ENDPOINTS = [
  "https://oauth.canto.com/oauth/api/oauth2/token",
  "https://oauth.canto.global/oauth/api/oauth2/token",
];

const SCOPES = ["admin:all", "", "content"];

type Debug = {
  app_id_length: number;
  app_id_preview: string | null;
  app_id_has_whitespace: boolean;
  app_secret_length: number;
  app_secret_preview: string | null;
  app_secret_has_whitespace: boolean;
  tenant: string | null;
  oauth_request_body_preview: string | null;
};

type HealthResponse = {
  status: "ok" | "error";
  oauth_endpoint_used: string | null;
  auth_method: "bearer" | "query_param" | null;
  token_received: boolean;
  search_sample_title: string | null;
  error_step: "oauth" | "search" | null;
  error_detail: string | null;
  debug: Debug;
};

function maskPreview(value: string | undefined, head: number, tail: number): string | null {
  if (!value) return null;
  if (value.length <= head + tail) return "*".repeat(value.length);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function buildRequestBody(appId: string, appSecret: string, scope: string): string {
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("app_id", appId);
  params.set("app_secret", appSecret);
  if (scope) params.set("scope", scope);
  return params.toString();
}

function redactBody(body: string, appId: string, appSecret: string): string {
  return body
    .replace(
      `app_id=${encodeURIComponent(appId)}`,
      `app_id=[REDACTED len=${appId.length}]`,
    )
    .replace(
      `app_secret=${encodeURIComponent(appSecret)}`,
      `app_secret=[REDACTED len=${appSecret.length}]`,
    );
}

async function tryOauth(
  endpoint: string,
  body: string,
): Promise<
  | { ok: true; token: string }
  | { ok: false; status: number; body: string }
> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, body: text };
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    return { ok: false, status: res.status, body: "missing access_token in response" };
  }
  return { ok: true, token: json.access_token };
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const appId = process.env.CANTO_APP_ID;
  const appSecret = process.env.CANTO_APP_SECRET;
  const tenant = process.env.CANTO_TENANT;

  const debug: Debug = {
    app_id_length: appId?.length ?? 0,
    app_id_preview: maskPreview(appId, 4, 4),
    app_id_has_whitespace: appId ? appId !== appId.trim() : false,
    app_secret_length: appSecret?.length ?? 0,
    app_secret_preview: maskPreview(appSecret, 2, 2),
    app_secret_has_whitespace: appSecret ? appSecret !== appSecret.trim() : false,
    tenant: tenant ?? null,
    oauth_request_body_preview: null,
  };

  if (!appId || !appSecret || !tenant) {
    return NextResponse.json({
      status: "error",
      oauth_endpoint_used: null,
      auth_method: null,
      token_received: false,
      search_sample_title: null,
      error_step: "oauth",
      error_detail: `missing env vars: ${[
        !appId && "CANTO_APP_ID",
        !appSecret && "CANTO_APP_SECRET",
        !tenant && "CANTO_TENANT",
      ]
        .filter(Boolean)
        .join(", ")}`,
      debug,
    });
  }

  let token: string | null = null;
  let endpointUsed: string | null = null;
  let lastOauthError = "";
  let lastBody = "";

  outer: for (const endpoint of OAUTH_ENDPOINTS) {
    for (const scope of SCOPES) {
      const body = buildRequestBody(appId, appSecret, scope);
      lastBody = body;
      const result = await tryOauth(endpoint, body);
      if (result.ok) {
        token = result.token;
        endpointUsed = endpoint;
        break outer;
      }
      lastOauthError = `endpoint=${endpoint} scope=${scope || "(none)"} status=${result.status} body=${result.body.slice(0, 300)}`;
      if (result.status === 400) continue;
      if (result.status === 404 || result.status === 500) break;
      break;
    }
  }

  debug.oauth_request_body_preview = lastBody ? redactBody(lastBody, appId, appSecret) : null;

  if (!token || !endpointUsed) {
    return NextResponse.json({
      status: "error",
      oauth_endpoint_used: null,
      auth_method: null,
      token_received: false,
      search_sample_title: null,
      error_step: "oauth",
      error_detail: lastOauthError || "oauth failed on all endpoint/scope combinations",
      debug,
    });
  }

  const searchBase = `https://${tenant}.canto.com/api/v1/search?keyword=logo&limit=1`;

  let searchRes = await fetch(searchBase, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let authMethod: "bearer" | "query_param" = "bearer";

  if (searchRes.status === 401) {
    authMethod = "query_param";
    searchRes = await fetch(`${searchBase}&access_token=${encodeURIComponent(token)}`);
  }

  if (!searchRes.ok) {
    const body = await searchRes.text();
    return NextResponse.json({
      status: "error",
      oauth_endpoint_used: endpointUsed,
      auth_method: authMethod,
      token_received: true,
      search_sample_title: null,
      error_step: "search",
      error_detail: `status=${searchRes.status} body=${body.slice(0, 500)}`,
      debug,
    });
  }

  const searchJson = (await searchRes.json()) as {
    results?: Array<{ name?: string; title?: string }>;
  };
  const first = searchJson.results?.[0];
  const sampleTitle = first?.name ?? first?.title ?? null;

  return NextResponse.json({
    status: "ok",
    oauth_endpoint_used: endpointUsed,
    auth_method: authMethod,
    token_received: true,
    search_sample_title: sampleTitle,
    error_step: null,
    error_detail: null,
    debug,
  });
}
