import { notFound } from "next/navigation";
import { WorkspacePage } from "@/components/WorkspacePage";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    !["explorer", "verification", "documents", "sources", "settings"].includes(
      section,
    )
  )
    notFound();
  return <WorkspacePage section={section} />;
}
