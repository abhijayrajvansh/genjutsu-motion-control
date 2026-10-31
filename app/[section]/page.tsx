import { Workspace } from "@/components/workspace";
import { notFound } from "next/navigation";
const sections = [
  "deploy",
  "automations",
  "course",
  "training",
  "dataset-creation",
  "captions",
  "pricing",
  "terms",
  "privacy",
  "account",
];
export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <Workspace section={section} />;
}
