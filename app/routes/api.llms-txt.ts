import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * GET /api/llms.txt — Serves llms.txt content as plain text.
 *
 * This is called via Shopify App Proxy:
 *   https://store.myshopify.com/apps/signalor/llms.txt
 *     → proxied to → https://signalor-shopify.fly.dev/api/llms.txt?shop=store.myshopify.com
 *
 * The URL redirect /llms.txt → /apps/signalor/llms.txt makes it accessible at root.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("# llms.txt\n\nShop parameter required.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Fetch llms.txt content from shop metafield via Shopify Admin API
  // We need the offline session token for this shop
  const { prisma } = await import("~/shopify.server");

  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
  });

  if (!session?.accessToken) {
    return new Response("# llms.txt\n\nApp not installed on this store.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Fetch the metafield
  const resp = await fetch(
    `https://${shop}/admin/api/2024-10/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `#graphql
          query {
            shop {
              metafield(namespace: "signalor", key: "llms_txt") {
                value
              }
            }
          }
        `,
      }),
    },
  );

  const data = await resp.json();
  const content = data?.data?.shop?.metafield?.value;

  if (!content) {
    return new Response("# llms.txt\n\nNo content configured yet.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
