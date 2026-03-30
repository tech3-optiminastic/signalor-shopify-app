import type { FixRequest, FixResult } from "./index.server";
import { resolveResource } from "./helpers.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * Meta fix — update SEO title and description on a page or product.
 */
export async function handleMetaFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  let seoTitle = req.seo_title || "";
  let seoDescription = req.seo_description || "";

  // If content is JSON with seo_title/seo_description, parse it
  if (!seoTitle && !seoDescription && req.content) {
    try {
      const parsed = JSON.parse(req.content);
      seoTitle = parsed.seo_title || "";
      seoDescription = parsed.seo_description || "";
    } catch {
      seoTitle = req.content;
    }
  }

  if (!seoTitle && !seoDescription) {
    return { status: "failed", message: "No SEO title or description provided." };
  }

  const resource = await resolveResource(admin, req.url);
  if (!resource) {
    return { status: "failed", message: `Could not find page or product for URL: ${req.url}` };
  }

  const seo: Record<string, string> = {};
  if (seoTitle) seo.title = seoTitle;
  if (seoDescription) seo.description = seoDescription;

  if (resource.type === "Page") {
    const resp = await admin.graphql(
      `#graphql
      mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id title }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: resource.id,
          page: { seo },
        },
      },
    );
    const data = await resp.json();
    const errors = data?.data?.pageUpdate?.userErrors;
    if (errors?.length) {
      return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
    }
  } else {
    const resp = await admin.graphql(
      `#graphql
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: { id: resource.id, seo },
        },
      },
    );
    const data = await resp.json();
    const errors = data?.data?.productUpdate?.userErrors;
    if (errors?.length) {
      return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
    }
  }

  const parts = [];
  if (seoTitle) parts.push(`title: "${seoTitle}"`);
  if (seoDescription) parts.push(`description: "${seoDescription.slice(0, 60)}..."`);

  return {
    status: "success",
    message: `SEO updated on ${resource.type.toLowerCase()} "${resource.title}" — ${parts.join(", ")}`,
  };
}
