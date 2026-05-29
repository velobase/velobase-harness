"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Coins, LogOut, Loader2, MessageCircle, Mail, Trash2 } from "lucide-react";
import { api } from "@/trpc/react";
import { useAuthStore } from "@/components/auth/store/auth-store";
import { logout } from "@/lib/logout";
import { PaymentMethodRow } from "./payment-method-row";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { SUPPORT_EMAIL, supportMailto } from "@/config/brand";

export function ProfilePage() {
  const { data: session, status } = useSession();
  const { setLoginModalOpen } = useAuthStore();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const { data: billingStatus, isLoading: isLoadingBilling } = api.account.getBillingStatus.useQuery(undefined, {
    enabled: !!session,
  });

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] p-6 space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Welcome to AI SaaS</h2>
          <p className="text-muted-foreground">Sign in to get started with AI SaaS</p>
        </div>
        <Button
          size="lg"
          className="w-full max-w-xs rounded-full text-lg h-12"
          onClick={() => setLoginModalOpen(true, undefined, "header")}
        >
          Sign In Now
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 space-y-8 pt-12 animate-in fade-in duration-300">
      {/* User Info */}
      <div className="flex items-center space-x-5">
        <Avatar className="w-20 h-20 border-2 border-primary/20 shadow-lg">
          <AvatarImage src={session.user.image ?? undefined} />
          <AvatarFallback className="text-2xl bg-muted">
            {session.user.name?.[0]?.toUpperCase() ?? "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 overflow-hidden">
          <h2 className="text-2xl font-bold truncate">{session.user.name}</h2>
          <p className="text-sm text-muted-foreground truncate">{session.user.email}</p>
        </div>
      </div>

      {/* Credits Card */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-primary">
            <div className="p-2 bg-primary/10 rounded-full">
              <Coins className="w-5 h-5" />
            </div>
            <span className="font-semibold">Credits</span>
          </div>
          {isLoadingBilling ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-3xl font-bold font-mono tracking-tight">
              {billingStatus?.creditsBalance?.toLocaleString() ?? 0}
            </span>
          )}
        </div>
        <Button 
          className="w-full rounded-xl font-semibold h-12" 
          size="lg"
          onClick={() => router.push("/pricing")}
        >
          Add Credits
        </Button>
      </div>

      {/* Settings Group */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground ml-1">Settings</h3>
        
        <div className="bg-card/50 border rounded-2xl overflow-hidden divide-y">
          <div className="flex items-center justify-between p-4">
            <span className="font-medium">Appearance</span>
            <ThemeToggle />
          </div>
          <PaymentMethodRow />
        </div>
      </div>

      {/* Support Group */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground ml-1">Support</h3>
        
        <div className="bg-card/50 border rounded-2xl overflow-hidden divide-y">
          <a 
            href="https://discord.gg/UnzEZJRnUf" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center p-4 hover:bg-muted/50 transition-colors"
          >
            <MessageCircle className="w-5 h-5 mr-3 text-[#5865F2]" />
            <span className="font-medium">Join Discord</span>
          </a>
          <a 
            href={supportMailto()}
            className="flex items-center p-4 hover:bg-muted/50 transition-colors"
          >
            <Mail className="w-5 h-5 mr-3 text-primary" />
            <span className="font-medium">{SUPPORT_EMAIL}</span>
          </a>
        </div>
      </div>

      {/* Sign Out */}
      <div className="space-y-3">
        <Button 
          variant="outline" 
          className="w-full justify-start h-14 rounded-2xl text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20"
          onClick={() => logout({ source: "profile" })}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-destructive/70 ml-1">Danger Zone</h3>
        
        <Button 
          variant="outline" 
          className="w-full justify-start h-14 rounded-2xl text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="w-5 h-5 mr-3" />
          Delete Account
        </Button>
      </div>

      <DeleteAccountDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        userEmail={session.user.email ?? null}
      />
    </div>
  );
}
