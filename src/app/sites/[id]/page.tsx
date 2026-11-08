import { SiteDetail } from "@/components/sites/SiteDetail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SiteDetail id={id} />;
}
