/**
 * Shared helpers for fix handlers — resolve Shopify resources by URL.
 */

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export interface ResolvedResource {
  id: string; // GID e.g. "gid://shopify/Page/123"
  type: "Page" | "Product";
  title: string;
  handle: string;
}

/**
 * Extract handle from a Shopify URL.
 * e.g. "https://mystore.myshopify.com/pages/about-us" → "about-us"
 * e.g. "https://mystore.myshopify.com/products/cool-shirt" → "cool-shirt"
 */
export function extractHandle(url: string): { handle: string; resourceHint: "pages" | "products" | null } {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);

    if (segments.length >= 2 && segments[0] === "pages") {
      return { handle: segments[1], resourceHint: "pages" };
    }
    if (segments.length >= 2 && segments[0] === "products") {
      return { handle: segments[1], resourceHint: "products" };
    }
    // Fallback: last segment
    return { handle: segments[segments.length - 1] || "", resourceHint: null };
  } catch {
    return { handle: "", resourceHint: null };
  }
}

/**
 * Resolve a page or product by URL handle using GraphQL.
 */
export async function resolveResource(
  admin: AdminClient,
  url: string,
): Promise<ResolvedResource | null> {
  const { handle, resourceHint } = extractHandle(url);
  if (!handle) return null;

  // Try page first (or if hint says pages)
  if (resourceHint !== "products") {
    const page = await findPageByHandle(admin, handle);
    if (page) return page;
  }

  // Try product
  if (resourceHint !== "pages") {
    const product = await findProductByHandle(admin, handle);
    if (product) return product;
  }

  // If hint said one type but failed, try the other
  if (resourceHint === "products") {
    const page = await findPageByHandle(admin, handle);
    if (page) return page;
  }
  if (resourceHint === "pages") {
    const product = await findProductByHandle(admin, handle);
    if (product) return product;
  }

  return null;
}

async function findPageByHandle(
  admin: AdminClient,
  handle: string,
): Promise<ResolvedResource | null> {
  const resp = await admin.graphql(
    `#graphql
    query getPageByHandle($handle: String!) {
      pageByHandle(handle: $handle) {
        id
        title
        handle
      }
    }`,
    { variables: { handle } },
  );
  const data = await resp.json();
  const page = data?.data?.pageByHandle;
  if (!page) return null;
  return { id: page.id, type: "Page", title: page.title, handle: page.handle };
}

async function findProductByHandle(
  admin: AdminClient,
  handle: string,
): Promise<ResolvedResource | null> {
  const resp = await admin.graphql(
    `#graphql
    query getProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
      }
    }`,
    { variables: { handle } },
  );
  const data = await resp.json();
  const product = data?.data?.productByHandle;
  if (!product) return null;
  return { id: product.id, type: "Product", title: product.title, handle: product.handle };
}
