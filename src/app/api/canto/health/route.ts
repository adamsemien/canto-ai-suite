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
  access_token_length: number;
  access_token_preview: string | null;
  tenant: string | null;
  oauth_request_body_preview: string | null;
};

type HealthResponse = {
  status: "ok" | "error";
  auth_flow_used: "direct_token" | "oauth" | null;
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

async function callSearch(
  tenant: string,
  token: string,
): Promise<
  | { ok: true; authMethod: "bearer" | "query_param"; title: string | null }
  | { ok: false; authMethod: "bearer" | "query_param"; status: number; body: string }
> {
  const base = `https://${tenant}.canto.com/api/v1/search?keyword=logo&limit=1`;

  let res = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  let authMethod: "bearer" | "query_param" = "bearer";

  if (res.status === 401) {
    authMethod = "query_param";
    res = await fetch(`${base}&access_token=${encodeURIComponent(token)}`);
  }

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, authMethod, status: res.status, body };
  }

  const json = (await res.json()) as {
    results?: Array<{ name?: string; title?: string }>;
  };
  const first = json.results?.[0];
  return { ok: true, authMethod, title: first?.name ?? first?.title ?? null };
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const appId = process.env.CANTO_APP_ID;
  const appSecret = process.env.CANTO_APP_SECRET;
  const tenant = process.env.CANTO_TENANT;
  const directToken = process.env.CANTO_ACCESS_TOKEN;

  const debug: Debug = {
    app_id_length: appId?.length ?? 0,
    app_id_preview: maskPreview(appId, 4, 4),
    app_id_has_whitespace: appId ? appId !== appId.trim() : false,
    app_secret_length: appSecret?.length ?? 0,
    app_secret_preview: maskPreview(appSecret, 2, 2),
    app_secret_has_whitespace: appSecret ? appSecret !== appSecret.trim() : false,
    access_token_length: directToken?.length ?? 0,
    access_token_preview: maskPreview(directToken, 4, 4),
    tenant: tenant ?? null,
    oauth_request_body_preview: null,
  };

  if (!tenant) {
    return NextResponse.json({
      status: "error",
      auth_flow_used: null,
      oauth_endpoint_used: null,
      auth_method: null,
      token_received: false,
      search_sample_title: null,
      error_step: "oauth",
      error_detail: "missing env var: CANTO_TENANT",
      debug,
    });
  }

  if (directToken) {
    const search = await callSearch(tenant, directToken);
    if (!search.ok) {
      return NextResponse.json({
        status: "error",
        auth_flow_used: "direct_token",
        oauth_endpoint_used: null,
        auth_method: search.authMethod,
        token_received: true,
        search_sample_title: null,
        error_step: "search",
        error_detail: `status=${search.status} body=${search.body.slice(0, 500)}`,
        debug,
      });
    }
    return NextResponse.json({
      status: "ok",
      auth_flow_used: "direct_token",
      oauth_endpoint_used: null,
      auth_method: search.authMethod,
      token_received: true,
      search_sample_title: search.title,
      error_step: null,
      error_detail: null,
      debug,
    });
  }

  if (!appId || !appSecret) {
    return NextResponse.json({
      status: "error",
      auth_flow_used: null,
      oauth_endpoint_used: null,
      auth_method: null,
      token_received: false,
      search_sample_title: null,
      error_step: "oauth",
      error_detail: `missing env vars: ${[
        !appId && "CANTO_APP_ID",
        !appSecret && "CANTO_APP_SECRET",
      ]
        .filter(Boolean)
        .join(", ")} (and no CANTO_ACCESS_TOKEN provided)`,
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
      auth_flow_used: "oauth",
      oauth_endpoint_used: null,
      auth_method: null,
      token_received: false,
      search_sample_title: null,
      error_step: "oauth",
      error_detail: lastOauthError || "oauth failed on all endpoint/scope combinations",
      debug,
    });
  }

  const search = await callSearch(tenant, token);
  if (!search.ok) {
    return NextResponse.json({
      status: "error",
      auth_flow_used: "oauth",
      oauth_endpoint_used: endpointUsed,
      auth_method: search.authMethod,
      token_received: true,
      search_sample_title: null,
      error_step: "search",
      error_detail: `status=${search.status} body=${search.body.slice(0, 500)}`,
      debug,
    });
  }

  return NextResponse.json({
    status: "ok",
    auth_flow_used: "oauth",
    oauth_endpoint_used: endpointUsed,
    auth_method: search.authMethod,
    token_received: true,
    search_sample_title: search.title,
    error_step: null,
    error_detail: null,
    debug,
  });
}
