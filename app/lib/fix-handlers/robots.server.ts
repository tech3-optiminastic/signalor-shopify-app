import type { FixRequest, FixResult } from "./index.server";

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const AI_BOT_RULES = `
# Signalor GEO — Allow AI crawlers
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: CCBot
Allow: /
`.trim();

/**
 * Robots.txt fix — add AI bot allow rules to robots.txt.liquid theme template.
 *
 * Shopify lets merchants customize robots.txt via a Liquid template.
 * We read the current template, check if our rules are already there,
 * and append them if not.
 */
export async function handleRobotsFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  // 1. Get the active theme ID
  const themeResp = await admin.graphql(`#graphql
    query {
      themes(first: 10, roles: [MAIN]) {
        edges { node { id name role } }
      }
    }
  `);
  const themeData = await themeResp.json();
  const mainTheme = themeData?.data?.themes?.edges?.[0]?.node;

  if (!mainTheme) {
    return { status: "failed", message: "Could not find the active theme." };
  }

  // 2. Read current robots.txt.liquid (if it exists)
  const assetResp = await admin.graphql(
    `#graphql
    query getAsset($themeId: ID!, $filenames: [String!]!) {
      theme(id: $themeId) {
        files(filenames: $filenames) {
          edges {
            node {
              filename
              body {
                ... on OnlineStoreThemeFileBodyText {
                  content
                }
              }
            }
          }
        }
      }
    }`,
    {
      variables: {
        themeId: mainTheme.id,
        filenames: ["templates/robots.txt.liquid"],
      },
    },
  );

  const assetData = await assetResp.json();
  const fileEdge = assetData?.data?.theme?.files?.edges?.[0];
  const currentContent = fileEdge?.node?.body?.content || "";

  // 3. Check if our rules are already present
  if (currentContent.includes("Signalor GEO")) {
    return {
      status: "success",
      message: "AI bot rules already present in robots.txt.",
    };
  }

  // 4. Append our rules
  const newContent = currentContent
    ? `${currentContent}\n\n${AI_BOT_RULES}\n`
    : `{% content_for_header %}\n{{ content_for_layout }}\n\n${AI_BOT_RULES}\n`;

  // 5. Write back via theme file upsert
  const writeResp = await admin.graphql(
    `#graphql
    mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        themeId: mainTheme.id,
        files: [
          {
            filename: "templates/robots.txt.liquid",
            body: {
              type: "TEXT",
              value: newContent,
            },
          },
        ],
      },
    },
  );

  const writeData = await writeResp.json();
  const writeErrors = writeData?.data?.themeFilesUpsert?.userErrors;
  if (writeErrors?.length) {
    return { status: "failed", message: writeErrors.map((e: { message: string }) => e.message).join("; ") };
  }

  return {
    status: "success",
    message: `AI bot allow rules added to robots.txt on theme "${mainTheme.name}".`,
  };
}
