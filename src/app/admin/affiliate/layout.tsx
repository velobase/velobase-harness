import { installedFeatures } from "@velobase/example-composition";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
/** An omitted capability has no page; an operationally disabled one retains management/history. */
export default function Layout({ children }: { children: ReactNode }) {
  if (!(installedFeatures as readonly string[]).includes("affiliate"))
    notFound();
  return children;
}
