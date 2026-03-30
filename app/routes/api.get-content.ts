import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticateSignalor } from "~/lib/signalor-auth.server";
import { resolveResource, extractHandle } from "~/lib/fix-handlers/helpers.server";

/**
 * POST /api/get-content
 *
 * Fetch current page/product content for preview diff.
 * Mirrors WordPress plugin's POST /wp-json/signalor/v1/get-content
 *
 * Body: { "url": "https://store.myshopify.com/pages/about", "shop": "store.myshopify.com" }
 * Returns: { "title": "...", "content": "...", "type": "Page", "id": "gid://..." }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  try {
    const { auth, body } = await authenticateSignalor(request);
    const url = body.url as string;

    if (!url) {
      return json({ error: "url is required" }, 400);
    }

    const adminClient = {
      async graphql(query: string, options?: { variables?: Record<string, unknown> }) {
        const resp = await fetch(
          `https://${auth.shop}/admin/api/2024-10/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": auth.accessToken,
            },
            body: JSON.stringify({ query, variables: options?.variables }),
          },
        );
        return resp;
      },
    };

    const resource = await resolveResource(adminClient, url);
    if (!resource) {
      return json({ error: `Could not find page or product for: ${url}` }, 404);
    }

    // Fetch full content
    let content = "";
    if (resource.type === "Page") {
      const resp = await adminClient.graphql(
        `#graphql
        query getPage($id: ID!) {
          page(id: $id) { body title }
        }`,
        { variables: { id: resource.id } },
      );
      const data = await resp.json();
      content = data?.data?.page?.body || "";
    } else {
      const resp = await adminClient.graphql(
        `#graphql
        query getProduct($id: ID!) {
          product(id: $id) { bodyHtml title }
        }`,
        { variables: { id: resource.id } },
      );
      const data = await resp.json();
      content = data?.data?.product?.bodyHtml || "";
    }

    return json({
      id: resource.id,
      title: resource.title,
      type: resource.type,
      handle: resource.handle,
      content,
      url,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: String(error) }, 500);
  }
}

export async function loader() {
  return json({ error: "POST only" }, 405);
}
