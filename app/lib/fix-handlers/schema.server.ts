import type { FixRequest, FixResult } from "./index.server";
import { resolveResource } from "./helpers.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * Schema fix — store JSON-LD in signalor.schema metafield.
 * The Theme App Extension reads this and renders it in <head>.
 *
 * This is the correct Shopify approach (same as Yoast, Smart SEO, etc.).
 * We do NOT inject into body_html — that's a hack that pollutes merchant content.
 */
export async function handleSchemaFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  const schema = req.schema || req.content;
  if (!schema) {
    return { status: "failed", message: "No schema content provided." };
  }

  const resource = await resolveResource(admin, req.url);
  if (!resource) {
    return { status: "failed", message: `Could not find page or product for URL: ${req.url}` };
  }

  // Strip <script> tags if present — store raw JSON only
  const jsonContent = schema.replace(/<\/?script[^>]*>/gi, "").trim();

  // Validate JSON
  try {
    JSON.parse(jsonContent);
  } catch {
    try {
      JSON.parse(`[${jsonContent}]`);
    } catch {
      return { status: "failed", message: "Schema is not valid JSON-LD." };
    }
  }

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
            key: "schema",
            type: "json",
            value: jsonContent,
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
    message: `JSON-LD schema stored on ${resource.type.toLowerCase()} "${resource.title}". Make sure the Signalor SEO app embed is enabled in your theme editor.`,
  };
}
