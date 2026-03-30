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
 * 3. Auto-create URL redirect: /llms.txt → /apps/signalor/llms.txt
 *
 * This is the correct Shopify approach (same as LLMs.txt Generator app).
 * We do NOT create a Shopify Page — that would serve HTML with theme chrome.
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
  // Use the shop's GID for the metafield owner
  const shopResp = await admin.graphql(`#graphql
    query { shop { id } }
  `);
  const shopData = await shopResp.json();
  const shopId = shopData?.data?.shop?.id;
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

  // 2. Create URL redirect: /llms.txt → /apps/signalor/llms.txt
  // First check if redirect already exists
  const redirectCheck = await admin.graphql(`#graphql
    query {
      urlRedirects(first: 5, query: "path:/llms.txt") {
        edges { node { id path target } }
      }
    }
  `);
  const redirectData = await redirectCheck.json();
  const existingRedirects = redirectData?.data?.urlRedirects?.edges || [];
  const hasRedirect = existingRedirects.some(
    (e: { node: { path: string } }) => e.node.path === "/llms.txt"
  );

  if (!hasRedirect) {
    const redirectResp = await admin.graphql(
      `#graphql
      mutation urlRedirectCreate($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect { id path target }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          urlRedirect: {
            path: "/llms.txt",
            target: "/apps/signalor/llms.txt",
          },
        },
      },
    );
    const rData = await redirectResp.json();
    const rErrors = rData?.data?.urlRedirectCreate?.userErrors;
    if (rErrors?.length) {
      // Non-fatal — redirect might already exist or be blocked
      console.warn("URL redirect creation warning:", rErrors);
    }
  }

  return {
    status: "success",
    message: `llms.txt created (${content.length} chars). Accessible at /llms.txt via redirect.`,
  };
}
