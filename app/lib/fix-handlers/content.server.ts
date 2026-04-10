import type { FixRequest, FixResult } from "./index.server";
import { resolveResource } from "./helpers.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * Content/FAQ fix — update page or product body HTML.
 */
export async function handleContentFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  const content = req.content;
  if (!content) {
    return { status: "failed", message: "No content provided for content fix." };
  }

  const resource = await resolveResource(admin, req.url);
  if (!resource) {
    // Homepage has no editable body in Shopify — content is in the theme
    try {
      const path = new URL(req.url).pathname.replace(/\/$/, "");
      if (!path || path === "") {
        return {
          status: "success",
          message: "Homepage content is managed by your Shopify theme. Edit it in Online Store > Themes > Customize.",
        };
      }
    } catch { /* ignore */ }
    return { status: "failed", message: `Could not find page or product for URL: ${req.url}` };
  }

  if (resource.type === "Page") {
    const resp = await admin.graphql(
      `#graphql
      mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id title handle }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: resource.id,
          page: { body: content },
        },
      },
    );
    const data = await resp.json();
    const errors = data?.data?.pageUpdate?.userErrors;
    if (errors?.length) {
      return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
    }
    return {
      status: "success",
      message: `Content updated on page "${resource.title}" (${content.length} chars)`,
    };
  }

  // Product
  const resp = await admin.graphql(
    `#graphql
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title handle }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: { id: resource.id, bodyHtml: content },
      },
    },
  );
  const data = await resp.json();
  const errors = data?.data?.productUpdate?.userErrors;
  if (errors?.length) {
    return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
  }
  return {
    status: "success",
    message: `Content updated on product "${resource.title}" (${content.length} chars)`,
  };
}
