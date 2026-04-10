import type { FixRequest, FixResult } from "./index.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * LLMS fix — create a Shopify Page with llms.txt content.
 *
 * Creates a page titled "llms.txt" with handle "llms-txt"
 * accessible at https://store.myshopify.com/pages/llms-txt
 *
 * If the page already exists, updates it with new content.
 */
export async function handleLlmsFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  const content = req.llms_content || req.content;
  if (!content) {
    return { status: "failed", message: "No llms.txt content provided." };
  }

  const shopDomain = req.shop || "";

  // Format content as HTML (preserve line breaks and structure)
  const htmlContent = contentToHtml(content);

  // Check if page already exists
  const existing = await findPageByHandle(admin, "llms-txt");

  if (existing) {
    // Update existing page
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
          id: existing.id,
          page: {
            title: "llms.txt",
            body: htmlContent,
            isPublished: true,
          },
        },
      },
    );
    const data = await resp.json();
    const errors = data?.data?.pageUpdate?.userErrors;
    if (errors?.length) {
      return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
    }

    const pageUrl = `https://${shopDomain}/pages/llms-txt`;
    return {
      status: "success",
      message: `llms.txt page updated (${content.length} chars). View it at ${pageUrl}`,
    };
  }

  // Create new page
  const resp = await admin.graphql(
    `#graphql
    mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id title handle }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        page: {
          title: "llms.txt",
          handle: "llms-txt",
          body: htmlContent,
          isPublished: true,
        },
      },
    },
  );

  const data = await resp.json();
  const errors = data?.data?.pageCreate?.userErrors;
  if (errors?.length) {
    // Handle "already taken" — find the existing page and update it
    const handleTaken = errors.some((e: { message: string }) => e.message.toLowerCase().includes("already been taken"));
    if (handleTaken) {
      // Search for the page and update it
      const existingRetry = await findPageByHandle(admin, "llms-txt");
      if (existingRetry) {
        const updateResp = await admin.graphql(
          `#graphql
          mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
            pageUpdate(id: $id, page: $page) {
              page { id title handle }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: existingRetry.id,
              page: { body: htmlContent, isPublished: true },
            },
          },
        );
        const updateData = await updateResp.json();
        const updateErrors = updateData?.data?.pageUpdate?.userErrors;
        if (updateErrors?.length) {
          return { status: "failed", message: updateErrors.map((e: { message: string }) => e.message).join("; ") };
        }
        const pageUrl = `https://${shopDomain}/pages/llms-txt`;
        return { status: "success", message: `llms.txt page updated (${content.length} chars). View it at ${pageUrl}` };
      }
    }
    return { status: "failed", message: errors.map((e: { message: string }) => e.message).join("; ") };
  }

  const pageUrl = `https://${shopDomain}/pages/llms-txt`;
  return {
    status: "success",
    message: `llms.txt page created (${content.length} chars). View it at ${pageUrl}`,
  };
}


async function findPageByHandle(
  admin: AdminClient,
  handle: string,
): Promise<{ id: string; title: string } | null> {
  // Try pageByHandle first
  try {
    const resp = await admin.graphql(
      `#graphql
      query getPage($handle: String!) {
        pageByHandle(handle: $handle) {
          id
          title
        }
      }`,
      { variables: { handle } },
    );
    const data = await resp.json();
    const page = data?.data?.pageByHandle;
    if (page) return { id: page.id, title: page.title };
  } catch {
    // pageByHandle may not be available in all API versions
  }

  // Fallback: search all pages for matching handle
  try {
    const resp = await admin.graphql(
      `#graphql
      query findLlmsPage {
        pages(first: 50, query: "title:llms") {
          nodes {
            id
            title
            handle
          }
        }
      }`,
    );
    const data = await resp.json();
    const pages = data?.data?.pages?.nodes || [];
    const match = pages.find((p: { handle: string }) => p.handle === handle);
    if (match) return { id: match.id, title: match.title };
  } catch {
    // ignore
  }

  return null;
}


/**
 * Convert plain-text llms.txt content to HTML while preserving structure.
 * Headings (#, ##) become <h2>, <h3>
 * Lines starting with - become list items
 * URLs become links
 * Everything else becomes paragraphs
 */
function contentToHtml(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Close open list if we hit a non-list line
    if (inList && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      html.push("</ul>");
      inList = false;
    }

    if (!trimmed) {
      if (!inList) html.push("<br>");
      continue;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      html.push(`<h4>${escapeHtml(trimmed.slice(4))}</h4>`);
    } else if (trimmed.startsWith("## ")) {
      html.push(`<h3>${escapeHtml(trimmed.slice(3))}</h3>`);
    } else if (trimmed.startsWith("# ")) {
      html.push(`<h2>${escapeHtml(trimmed.slice(2))}</h2>`);
    }
    // List items
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${linkify(escapeHtml(trimmed.slice(2)))}</li>`);
    }
    // Blockquote (> prefix)
    else if (trimmed.startsWith("> ")) {
      html.push(`<blockquote>${escapeHtml(trimmed.slice(2))}</blockquote>`);
    }
    // Regular paragraph
    else {
      html.push(`<p>${linkify(escapeHtml(trimmed))}</p>`);
    }
  }

  if (inList) html.push("</ul>");

  return html.join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(text: string): string {
  // Convert URLs to clickable links
  return text.replace(
    /(https?:\/\/[^\s<>)"]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>',
  );
}
