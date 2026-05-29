import Link from "next/link";
import { Mail, MessageCircle, ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Background } from "@/components/layout/background";
import { supportMailto } from "@/config/brand";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 relative flex flex-col">
      <Background />
      <Header />

      <main className="flex-1 relative z-10 flex flex-col items-center justify-center w-full px-6 py-20 md:py-32">
        <div className="max-w-2xl w-full text-center space-y-12">
          
          {/* Minimalist Heading */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-foreground">
              Support
          </h1>
            <p className="text-lg text-muted-foreground font-light">
              We are here to help.
            </p>
          </div>

          {/* Clean Action Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-lg mx-auto">
            {/* Email */}
              <a
                href={supportMailto()}
              className="group flex items-center justify-between p-6 rounded-2xl bg-white/50 dark:bg-black/20 border border-border/50 hover:border-orange-500/30 hover:bg-orange-50/50 dark:hover:bg-orange-950/10 transition-all duration-300"
              >
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform duration-300">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-medium text-foreground">Email</h3>
                  <p className="text-xs text-muted-foreground">Get a reply in 24h</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400 group-hover:translate-x-1 transition-all" />
              </a>

            {/* Discord */}
              <a
                href="https://discord.gg/UnzEZJRnUf"
                target="_blank"
                rel="noopener noreferrer"
              className="group flex items-center justify-between p-6 rounded-2xl bg-white/50 dark:bg-black/20 border border-border/50 hover:border-indigo-500/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/10 transition-all duration-300"
              >
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                  <MessageCircle className="w-5 h-5" />
            </div>
                <div className="text-left">
                  <h3 className="font-medium text-foreground">Discord</h3>
                  <p className="text-xs text-muted-foreground">Join community</p>
          </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
            </a>
          </div>

          {/* Links Footer */}
          <div className="pt-8 border-t border-border/40 w-full max-w-xs mx-auto flex justify-center gap-6 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          </div>

        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
