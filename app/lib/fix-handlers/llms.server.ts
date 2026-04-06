import type { FixRequest, FixResult } from "./index.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * LLMS fix — store llms.txt content and serve via App Proxy.
 *
 * How it works:
 * 1. Store content in shop-level metafield (signalor.llms_txt)
 * 2. App Proxy serves it at /apps/signalor/llms.txt as text/plain
 *
 * Note: Shopify does NOT allow root-level file creation (/llms.txt).
 * Shopify also blocks URL redirects to /apps/* paths.
 * The file is accessible at: https://store.myshopify.com/apps/signalor/llms.txt
 */
export async function handleLlmsFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  const content = req.llms_content || req.content;
  if (!content) {
    return { status: "failed", message: "No llms.txt content provided." };
  }

  // 1. Store llms.txt content in a shop-level metafield
  const shopResp = await admin.graphql(`#graphql
    query { shop { id myshopifyDomain } }
  `);
  const shopData = await shopResp.json();
  const shopId = shopData?.data?.shop?.id;
  const shopDomain = shopData?.data?.shop?.myshopifyDomain || req.shop;
  if (!shopId) {
    return { status: "failed", message: "Could not resolve shop ID." };
  }

  const metaResp = await admin.graphql(
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
            ownerId: shopId,
            namespace: "signalor",
            key: "llms_txt",
            type: "multi_line_text_field",
            value: content,
          },
        ],
      },
    },
  );

  const metaData = await metaResp.json();
  const metaErrors = metaData?.data?.metafieldsSet?.userErrors;
  if (metaErrors?.length) {
    return { status: "failed", message: metaErrors.map((e: { message: string }) => e.message).join("; ") };
  }

  const llmsUrl = `https://${shopDomain}/apps/signalor/llms.txt`;

  return {
    status: "success",
    message: `llms.txt created (${content.length} chars). Accessible at ${llmsUrl}`,
  };
}
