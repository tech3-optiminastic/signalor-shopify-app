import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/shopify.server";

/**
 * Splat route for App Proxy requests.
 *
 * Shopify App Proxy sends:
 *   https://store.myshopify.com/apps/signalor/llms.txt
 *     → https://app.signalor.ai/api/llms.txt?shop=...&signature=...
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const splatPath = params["*"] || "";

  if (splatPath === "llms.txt") return handleLlmsTxt(url);
  if (splatPath === "llms-full.txt") return handleLlmsTxt(url, true);

  return new Response("Not found", { status: 404 });
}

// In-memory cache: shop → { content, generatedAt }
const llmsCache = new Map<string, { content: string; full: string; at: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function handleLlmsTxt(url: URL, full = false) {
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return textResponse("# llms.txt\n\nShop parameter required.", 400);
  }

  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
  });
  if (!session?.accessToken) {
    return textResponse("# llms.txt\n\nApp not installed on this store.", 404);
  }

  // Check cache
  const cached = llmsCache.get(shop);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return textResponse(full ? cached.full : cached.content, 200, 3600);
  }

  // Check for custom metafield first (user-provided content)
  const customContent = await fetchMetafield(shop, session.accessToken);
  if (customContent) {
    return textResponse(customContent, 200, 3600);
  }

  // Auto-generate from store data
  try {
    const { standard, fullVersion } = await generateLlmsTxt(shop, session.accessToken);
    llmsCache.set(shop, { content: standard, full: fullVersion, at: Date.now() });
    return textResponse(full ? fullVersion : standard, 200, 3600);
  } catch (err) {
    console.error("llms.txt generation failed:", err);
    return textResponse("# llms.txt\n\nGeneration failed. Try again later.", 500);
  }
}

function textResponse(body: string, status: number, maxAge = 0) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...(maxAge > 0 ? { "Cache-Control": `public, max-age=${maxAge}` } : {}),
    },
  });
}

async function fetchMetafield(shop: string, token: string): Promise<string | null> {
  const resp = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      query: `{ shop { metafield(namespace: "signalor", key: "llms_txt") { value } } }`,
    }),
  });
  const data = await resp.json();
  return data?.data?.shop?.metafield?.value || null;
}

async function gql(shop: string, token: string, query: string, variables?: Record<string, unknown>) {
  const resp = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  return resp.json();
}

async function generateLlmsTxt(shop: string, token: string) {
  // Fetch shop info
  const shopData = await gql(shop, token, `{
    shop { name description url currencyCode primaryDomain { url host } }
  }`);
  const s = shopData?.data?.shop;
  const storeName = s?.name || shop;
  const storeUrl = s?.primaryDomain?.url || `https://${shop}`;
  const storeDesc = s?.description || "";
  const currency = s?.currencyCode || "USD";

  // Fetch products (first 100)
  const productsData = await gql(shop, token, `{
    products(first: 100, sortKey: BEST_SELLING) {
      nodes {
        title
        handle
        productType
        description(truncateAt: 200)
        priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
        status
        totalInventory
        featuredMedia { preview { image { url } } }
      }
    }
  }`);
  const products = productsData?.data?.products?.nodes || [];

  // Fetch collections (first 50)
  const collectionsData = await gql(shop, token, `{
    collections(first: 50) {
      nodes { title handle description(truncateAt: 200) productsCount { count } }
    }
  }`);
  const collections = collectionsData?.data?.collections?.nodes || [];

  // Fetch pages (first 20)
  const pagesData = await gql(shop, token, `{
    pages(first: 20) {
      nodes { title handle body(truncateAt: 300) }
    }
  }`);
  const pages = pagesData?.data?.pages?.nodes || [];

  // Build standard llms.txt
  const lines: string[] = [];
  lines.push(`# ${storeName}`);
  lines.push("");
  if (storeDesc) {
    lines.push(`> ${storeDesc}`);
    lines.push("");
  }
  lines.push(`## About`);
  lines.push(`${storeName} is an online store at ${storeUrl}.`);
  if (storeDesc) lines.push(storeDesc);
  lines.push("");

  // Key pages
  lines.push(`## Key Pages`);
  lines.push(`- Homepage: ${storeUrl}`);
  lines.push(`- All Products: ${storeUrl}/collections/all`);
  if (collections.length > 0) {
    for (const c of collections.slice(0, 10)) {
      lines.push(`- ${c.title}: ${storeUrl}/collections/${c.handle}`);
    }
  }
  for (const p of pages) {
    lines.push(`- ${p.title}: ${storeUrl}/pages/${p.handle}`);
  }
  lines.push("");

  // Products grouped by type
  const byType = new Map<string, typeof products>();
  for (const p of products) {
    if (p.status !== "ACTIVE") continue;
    const type = p.productType || "Other";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(p);
  }

  lines.push(`## Products`);
  for (const [type, items] of byType) {
    lines.push(`### ${type}`);
    for (const item of items.slice(0, 20)) {
      const min = item.priceRangeV2?.minVariantPrice?.amount;
      const max = item.priceRangeV2?.maxVariantPrice?.amount;
      const price = min === max ? `${currency} ${min}` : `${currency} ${min}–${max}`;
      lines.push(`- [${item.title}](${storeUrl}/products/${item.handle}): ${price}`);
    }
    lines.push("");
  }

  // Collections
  if (collections.length > 0) {
    lines.push(`## Collections`);
    for (const c of collections) {
      const count = c.productsCount?.count || 0;
      lines.push(`- [${c.title}](${storeUrl}/collections/${c.handle}) (${count} products)`);
    }
    lines.push("");
  }

  lines.push(`## Contact`);
  lines.push(`- Website: ${storeUrl}`);
  lines.push("");

  const standard = lines.join("\n");

  // Full version — add product descriptions
  const fullLines = [...lines];
  fullLines.push(`## Product Details`);
  for (const p of products) {
    if (p.status !== "ACTIVE" || !p.description) continue;
    const desc = p.description.replace(/<[^>]+>/g, "").trim();
    if (!desc) continue;
    fullLines.push(`### ${p.title}`);
    fullLines.push(desc);
    fullLines.push(`URL: ${storeUrl}/products/${p.handle}`);
    fullLines.push("");
  }

  return { standard, fullVersion: fullLines.join("\n") };
}

// Export for webhook cache invalidation
export function invalidateLlmsCache(shop: string) {
  llmsCache.delete(shop);
}
