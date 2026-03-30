import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const fixLogs = await prisma.fixLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const stats = {
    total: fixLogs.length,
    success: fixLogs.filter((l) => l.status === "success").length,
    failed: fixLogs.filter((l) => l.status === "failed").length,
    skipped: fixLogs.filter((l) => l.status === "skipped").length,
  };

  return json({
    shop,
    stats,
    fixLogs: fixLogs.map((l) => ({
      id: l.id,
      fixType: l.fixType,
      url: l.url,
      status: l.status,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}

export default function Dashboard() {
  const { shop, stats, fixLogs } = useLoaderData<typeof loader>();

  const statusBadge = (status: string) => {
    if (status === "success") return <Badge tone="success">Success</Badge>;
    if (status === "failed") return <Badge tone="critical">Failed</Badge>;
    return <Badge tone="attention">Skipped</Badge>;
  };

  const rows = fixLogs.map((log: { id: number; fixType: string; url: string; status: string; message: string | null; createdAt: string }) => [
    log.fixType,
    log.url.length > 50 ? log.url.slice(0, 50) + "..." : log.url,
    statusBadge(log.status),
    log.message || "—",
    new Date(log.createdAt).toLocaleString(),
  ]);

  return (
    <Page title="Signalor GEO">
      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Store</Text>
                <Text as="p" variant="bodyMd">{shop}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Status</Text>
                <Badge tone="success">Active</Badge>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Fixes Applied</Text>
                <InlineStack gap="300">
                  <Text as="span" variant="bodyMd">{stats.success} success</Text>
                  <Text as="span" variant="bodyMd">{stats.failed} failed</Text>
                  <Text as="span" variant="bodyMd">{stats.skipped} skipped</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Recent Fix History</Text>
            {fixLogs.length === 0 ? (
              <EmptyState
                heading="No fixes yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Fixes will appear here after you run a GEO analysis and apply
                  recommendations from the Signalor dashboard.
                </p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Fix Type", "URL", "Status", "Message", "Date"]}
                rows={rows}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
