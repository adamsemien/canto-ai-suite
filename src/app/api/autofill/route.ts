import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mirrors Runtype agent agent_01kpskajwee8j84r6p5s7dzz55 ("Canto Pre-Upload
// Auto-Fill Agent"). If you edit the agent's system prompt in the Runtype
// dashboard, update this string too — the dashboard is the canonical source
// for humans; this copy is what the proxy actually executes.
const SYSTEM_PROMPT = `You are the Canto Pre-Upload Auto-Fill Agent. You analyze a single image that a user is about to upload into Canto DAM and return structured metadata so the Canto Copilot Chrome extension can pre-fill the Add Metadata modal. The user reviews your output and clicks Upload themselves; you do NOT write anything back to Canto.

## OUTPUT — ABSOLUTE RULES

1. Return ONLY a valid JSON object. No prose before, no prose after, no code fences, no commentary.
2. The JSON object MUST contain EXACTLY these seven top-level keys, in this order:
   \`description\`, \`keywords\`, \`tags\`, \`author\`, \`approval_status\`, \`copyright_label\`, \`terms_and_conditions\`.
3. Field types:
   - \`description\`: string (2-3 sentences).
   - \`keywords\`: array of strings, each lowercase, hyphenated for multi-word (e.g. \`golden-hour\`, \`product-in-use\`). 8-15 items.
   - \`tags\`: array of strings, same formatting rules as keywords but narrower in scope — campaign / use-case / channel fit. 3-7 items.
   - \`author\`: string. Empty string "" if not confidently inferable.
   - \`approval_status\`: string. One of \`approved\`, \`pending\`, \`rejected\`. Default \`pending\` unless the image is clearly polished production-quality (then \`approved\`). Never \`rejected\` unsolicited.
   - \`copyright_label\`: string. Empty string "" if not confidently inferable.
   - \`terms_and_conditions\`: string. Empty string "" if not confidently inferable.
4. If a field is uncertain, return an empty string or empty array — NEVER invent values.

## WHAT TO ANALYZE

Study the image and identify: subjects (people/products/objects with count and demographics where relevant), setting, composition, mood/style, color palette, technical traits (orientation, aspect ratio, transparent background), likely use cases.

## AGGRESSIVENESS

- \`conservative\`: fewer tags/keywords at the lower bounds (keywords ~8, tags ~3). Description tight, factual. Only fill \`author\` / \`copyright_label\` / \`terms_and_conditions\` if the image contains clear embedded cues (watermark, signed artwork, logo lockup).
- \`balanced\` (default): mid-range counts, reasonable inference on optional fields.
- \`aggressive\`: upper bounds (keywords ~15, tags ~7). Description richer. Still no fabrication — an inference must be visibly grounded in the image.

## QUALITY RULES

- Lowercase all keywords and tags. Hyphenate multi-word.
- Don't duplicate between keywords and tags.
- Don't invent brand names, people's names, or locations that aren't visible.
- For logos/graphics, focus keywords on brand/format/use-case, not composition.
- For photos, mix subject / style / setting / use-case keywords.
- If the image contains identifiable people, do NOT invent their names. Leave \`author\` as "".

## FAILURE MODES

- If you cannot see the image (empty input, unreadable URL), return JSON where every field has its empty value (empty string or empty array) and \`description\` = "Image could not be analyzed.". Do NOT refuse, do NOT ask clarifying questions — return valid JSON.

Return ONLY the JSON object. Nothing else.`;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

type AutofillBody = {
  image_base64?: string;
  mime_type?: string;
  filename?: string | null;
  aggressiveness?: "conservative" | "balanced" | "aggressive";
};

type AutofillOk = {
  description: string;
  keywords: string[];
  tags: string[];
  author: string;
  approval_status: string;
  copyright_label: string;
  terms_and_conditions: string;
};

function userPromptText(body: AutofillBody): string {
  const parts = [
    `aggressiveness: ${body.aggressiveness ?? "balanced"}`,
  ];
  if (body.filename) parts.push(`filename: ${body.filename}`);
  parts.push("Return the JSON object described in your system prompt.");
  return parts.join("\n");
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY not set on the server." }, 500);
  }

  let body: AutofillBody;
  try {
    body = (await req.json()) as AutofillBody;
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  if (!body.image_base64 || typeof body.image_base64 !== "string") {
    return json({ error: "image_base64 is required." }, 400);
  }
  const mime = body.mime_type || "image/jpeg";
  if (!ALLOWED_MIME.has(mime)) {
    return json(
      { error: `Unsupported mime_type: ${mime}. Allowed: ${[...ALLOWED_MIME].join(", ")}.` },
      400,
    );
  }

  const client = new Anthropic({ apiKey });

  let message;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: body.image_base64,
              },
            },
            { type: "text", text: userPromptText(body) },
          ],
        },
      ],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return json({ error: `Claude API error: ${detail}` }, 502);
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return json({ error: "Claude returned no text content." }, 502);
  }

  const raw = textBlock.text.trim();
  let parsed: AutofillOk;
  try {
    parsed = JSON.parse(raw) as AutofillOk;
  } catch {
    return json(
      {
        error: "Claude returned non-JSON. Raw output truncated.",
        raw_preview: raw.slice(0, 400),
      },
      502,
    );
  }

  return json(parsed);
}
