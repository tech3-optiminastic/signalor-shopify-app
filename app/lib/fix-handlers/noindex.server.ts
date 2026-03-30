import type { FixRequest, FixResult } from "./index.server";
import { resolveResource } from "./helpers.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * Noindex fix — ensure the page/product is published (indexable).
 */
export async function handleNoindexFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  const resource = await resolveResource(admin, req.url);
  if (!resource) {
    return { status: "failed", message: `Could not find page or product for URL: ${req.url}` };
  }

  if (resource.type === "Page") {
    const resp = await admin.graphql(
      `#graphql
      mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id title isPublished }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: resource.id,
          page: { isPublished: true },
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
          product { id title status }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: { id: resource.id, status: "ACTIVE" },
        },
      },
    );
    const data = await resp.json();
    const errors = data?.data?.productUpdate?.userErrors;
    if (errors?.length) {
      return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
    }
  }

  return {
    status: "success",
    message: `${resource.type} "${resource.title}" is now published and indexable.`,
  };
}
