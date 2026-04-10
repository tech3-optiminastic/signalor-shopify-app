import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate, prisma } from "~/shopify.server";

/**
 * OAuth callback — after merchant installs/reinstalls the app.
 *
 * 1. Complete Shopify OAuth
 * 2. Ensure an offline session row exists (needed for /api/apply-fix)
 * 3. Create metafield definitions so Liquid can read our metafields
 * 4. Redirect to app settings page
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);

  const shop = session.shop;

  // Ensure offline session exists for API access
  try {
    const sessionId = `offline_${shop}`;
    await prisma.session.upsert({
      where: { id: sessionId },
      update: {
        accessToken: session.accessToken,
        scope: session.scope || "",
        isOnline: false,
        state: "installed",
      },
      create: {
        id: sessionId,
        shop,
        state: "installed",
        isOnline: false,
        scope: session.scope || "",
        accessToken: session.accessToken || "",
      },
    });
  } catch (e) {
    console.error("Failed to upsert offline session:", e);
  }

  // Create metafield definitions so Liquid blocks can read them
  try {
    await ensureMetafieldDefinitions(admin);
  } catch (e) {
    console.error("Failed to create metafield definitions:", e);
  }

  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) {
    throw new Response("SHOPIFY_APP_URL is not configured", { status: 500 });
  }
  return redirect(`${appUrl}/app`);
}

/**
 * Create metafield definitions for signalor namespace.
 * Without these, Liquid cannot access the metafields in storefront context.
 */
async function ensureMetafieldDefinitions(admin: { graphql: Function }) {
  const definitions = [
    {
      name: "Schema Markup",
      namespace: "signalor",
      key: "schema",
      type: "json",
      ownerType: "PAGE",
      description: "JSON-LD structured data for GEO optimization",
    },
    {
      name: "Schema Markup",
      namespace: "signalor",
      key: "schema",
      type: "json",
      ownerType: "PRODUCT",
      description: "JSON-LD structured data for GEO optimization",
    },
    {
      name: "AI Meta Directives",
      namespace: "signalor",
      key: "ai_meta",
      type: "json",
      ownerType: "PAGE",
      description: "AI crawler meta tag directives",
    },
    {
      name: "AI Meta Directives",
      namespace: "signalor",
      key: "ai_meta",
      type: "json",
      ownerType: "PRODUCT",
      description: "AI crawler meta tag directives",
    },
  ];

  for (const def of definitions) {
    try {
      const resp = await admin.graphql(
        `#graphql
        mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            definition: {
              name: def.name,
              namespace: def.namespace,
              key: def.key,
              type: def.type,
              ownerType: def.ownerType,
              description: def.description,
              pin: true,
            },
          },
        },
      );
      const data = await resp.json();
      const errors = data?.data?.metafieldDefinitionCreate?.userErrors;
      if (errors?.length) {
        // "already exists" is fine — skip it
        const nonDuplicateErrors = errors.filter(
          (e: { message: string }) => !e.message.includes("already exists")
        );
        if (nonDuplicateErrors.length) {
          console.warn(`Metafield def ${def.ownerType}.${def.namespace}.${def.key}:`, nonDuplicateErrors);
        }
      }
    } catch (e) {
      console.error(`Failed to create metafield def ${def.ownerType}.${def.namespace}.${def.key}:`, e);
    }
  }
}
