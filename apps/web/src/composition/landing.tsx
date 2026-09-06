"use client";

import { cn } from "@/lib/utils";
import { Header } from "@/components/layout/header";
import { Background } from "@/components/layout/background";
import { SiteFooter } from "@/components/layout/site-footer";
import { Features } from "@/components/landing/features";
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("landing");

  return (
    <div
      className={cn(
        "w-full bg-background text-foreground font-sans selection:bg-primary/30 relative",
        "min-h-screen overflow-y-auto overflow-x-hidden"
      )}
    >
      <Background />
      <Header />

      <main className="relative z-10 flex flex-col items-center w-full px-4 pt-24 pb-8 min-h-[calc(100vh-80px)] justify-center">
        <div className="relative w-full max-w-4xl mx-auto text-center mb-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 fill-mode-both">
          <h1 className="font-poppins font-medium text-5xl md:text-7xl tracking-tight text-foreground drop-shadow-sm">
            {t("hero.titleLine1")}{" "}
            <br className="hidden md:block" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-gradient-x">
              {t("hero.titleLine2")}
            </span>
          </h1>
          <p className="font-sans text-lg md:text-xl text-muted-foreground/80 max-w-2xl mx-auto font-light tracking-wide">
            {t("hero.subtitle")}
            <br className="hidden sm:block" />
            <span className="text-foreground/80">
              {t("hero.subtitleAccent")}
            </span>
          </p>
        </div>
      </main>

      <Features />

      <SiteFooter />
    </div>
  );
}
