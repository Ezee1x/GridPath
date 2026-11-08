import { notFound } from "next/navigation";
import { WorkspacePage } from "@/components/WorkspacePage";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section !== "settings") notFound();
  return <WorkspacePage section={section} />;
}
