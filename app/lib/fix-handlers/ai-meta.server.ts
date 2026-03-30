import type { FixRequest, FixResult } from "./index.server";
import { resolveResource } from "./helpers.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const AI_BOTS = ["GPTBot", "Google-Extended", "anthropic-ai", "ClaudeBot", "PerplexityBot", "ChatGPT-User", "CCBot"];

/**
 * AI Meta fix — store AI bot directives in signalor.ai_meta metafield.
 * The Theme App Extension reads this and renders meta tags in <head>.
 *
 * We do NOT inject into body_html — meta tags in <body> are invalid HTML
 * and may be ignored by crawlers.
 */
export async function handleAiMetaFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  const resource = await resolveResource(admin, req.url);
  if (!resource) {
    return { status: "failed", message: `Could not find page or product for URL: ${req.url}` };
  }

  const metaValue = JSON.stringify({
    enabled: true,
    bots: AI_BOTS,
    directive: "index, follow",
  });

  const resp = await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: resource.id,
            namespace: "signalor",
            key: "ai_meta",
            type: "json",
            value: metaValue,
          },
        ],
      },
    },
  );

  const data = await resp.json();
  const errors = data?.data?.metafieldsSet?.userErrors;
  if (errors?.length) {
    return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
  }

  return {
    status: "success",
    message: `AI meta tags stored on ${resource.type.toLowerCase()} "${resource.title}". Make sure the Signalor SEO app embed is enabled in your theme editor.`,
  };
}
