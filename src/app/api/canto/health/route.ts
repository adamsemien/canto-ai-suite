import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_ENDPOINTS = [
  "https://oauth.canto.com/oauth/api/oauth2/token",
  "https://oauth.canto.global/oauth/api/oauth2/token",
];

const SCOPES = ["admin:all", "", "content"];

type HealthResponse = {
  status: "ok" | "error";
  oauth_endpoint_used: string | null;
  auth_method: "bearer" | "query_param" | null;
  token_received: boolean;
  search_sample_title: string | null;
  error_step: "oauth" | "search" | null;
  error_detail: string | null;
};

async function tryOauth(
  endpoint: string,
  appId: string,
  appSecret: string,
  scope: string,
): Promise<
  | { ok: true; token: string }
  | { ok: false; status: number; body: string }
> {
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("app_id", appId);
  params.set("app_secret", appSecret);
  if (scope) params.set("scope", scope);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
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
    });
  }

  let token: string | null = null;
  let endpointUsed: string | null = null;
  let lastOauthError = "";

  outer: for (const endpoint of OAUTH_ENDPOINTS) {
    for (const scope of SCOPES) {
      const result = await tryOauth(endpoint, appId, appSecret, scope);
      if (result.ok) {
        token = result.token;
        endpointUsed = endpoint;
        break outer;
      }
      lastOauthError = `endpoint=${endpoint} scope=${scope || "(none)"} status=${result.status} body=${result.body.slice(0, 300)}`;
      // Per spec: endpoint fallback on 404/500, scope fallback on 400.
      if (result.status === 400) continue; // try next scope
      if (result.status === 404 || result.status === 500) break; // try next endpoint
      break; // other errors: try next endpoint
    }
  }

  if (!token || !endpointUsed) {
    return NextResponse.json({
      status: "error",
      oauth_endpoint_used: null,
      auth_method: null,
      token_received: false,
      search_sample_title: null,
      error_step: "oauth",
      error_detail: lastOauthError || "oauth failed on all endpoint/scope combinations",
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
  });
}
