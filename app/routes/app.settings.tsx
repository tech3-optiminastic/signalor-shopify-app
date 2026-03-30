import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Badge,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Check if we have a valid offline session (meaning the app can receive fixes)
  const offlineSession = await prisma.session.findFirst({
    where: { shop, isOnline: false },
  });

  const fixCount = await prisma.fixLog.count({ where: { shop } });
  const successCount = await prisma.fixLog.count({ where: { shop, status: "success" } });

  return json({
    shop,
    hasOfflineToken: !!offlineSession?.accessToken,
    scopes: offlineSession?.scope || "",
    fixCount,
    successCount,
  });
}

export default function Settings() {
  const { shop, hasOfflineToken, scopes, fixCount, successCount } = useLoaderData<typeof loader>();

  const scopeList = scopes.split(",").filter(Boolean);
  const requiredScopes = ["write_products", "write_content", "write_metafields"];
  const missingScopes = requiredScopes.filter((s) => !scopeList.includes(s));

  return (
    <Page title="Settings" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Connection Status</Text>
            <InlineStack gap="300" align="start">
              <Text as="p" variant="bodyMd">Store:</Text>
              <Text as="p" variant="bodyMd"><strong>{shop}</strong></Text>
            </InlineStack>
            <InlineStack gap="300" align="start">
              <Text as="p" variant="bodyMd">App Status:</Text>
              {hasOfflineToken ? (
                <Badge tone="success">Active — Ready to receive fixes</Badge>
              ) : (
                <Badge tone="critical">No access token — Reinstall app</Badge>
              )}
            </InlineStack>
            <InlineStack gap="300" align="start">
              <Text as="p" variant="bodyMd">Fixes Applied:</Text>
              <Text as="p" variant="bodyMd">{successCount} / {fixCount} total</Text>
            </InlineStack>
          </BlockStack>
        </Card>

        {missingScopes.length > 0 && (
          <Banner title="Missing permissions" tone="warning">
            <p>
              This app needs additional scopes to apply all fix types:{" "}
              <strong>{missingScopes.join(", ")}</strong>.
              Reinstall the app to grant these permissions.
            </p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">How It Works</Text>
            <Text as="p" variant="bodyMd">
              This app is automatically linked to your Signalor account when you
              connect Shopify from the Signalor dashboard. No manual setup needed.
            </Text>
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd">1. Run a GEO analysis on signalor.ai</Text>
              <Text as="p" variant="bodyMd">2. Review recommendations in your dashboard</Text>
              <Text as="p" variant="bodyMd">3. Click "Fix" → preview the change → approve</Text>
              <Text as="p" variant="bodyMd">4. The fix is applied to your store automatically</Text>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Granted Scopes</Text>
            <InlineStack gap="200" wrap>
              {scopeList.map((scope) => (
                <Badge key={scope}>{scope}</Badge>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Theme Extension</Text>
            <Text as="p" variant="bodyMd">
              For JSON-LD schema and AI meta tags to appear in your store's{" "}
              <code>&lt;head&gt;</code>, enable the <strong>Signalor SEO</strong>{" "}
              theme extension in your theme editor:
            </Text>
            <Text as="p" variant="bodyMd">
              Online Store → Themes → Customize → App embeds → Enable "Signalor SEO"
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
