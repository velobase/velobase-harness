"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Copy, AlertCircle } from "lucide-react";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { useAuthStore } from "@/components/auth/store/auth-store";
import Image from "next/image";

interface SharedConversationBannerProps {
  ownerName?: string | null;
  ownerImage?: string | null;
  isGuest: boolean;
  conversationId: string;
}

export function SharedConversationBanner({
  ownerName,
  ownerImage,
  isGuest,
  conversationId,
}: SharedConversationBannerProps) {
  const router = useRouter();
  const { setLoginModalOpen } = useAuthStore();
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [missingAgents, setMissingAgents] = useState<Array<{ id: string; name: string }>>([]);

  const utils = api.useUtils();

  // Fork conversation mutation
  const forkMutation = api.conversation.fork.useMutation({
    onSuccess: (data) => {
      toast.success("Conversation forked to your account");
      router.push(`/chat/${data.conversationId}`);
    },
    onError: (error) => {
      // Check if error is due to missing agents
      if (error.message === "AGENT_NOT_INSTALLED") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorData: any = error.data;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const cause = errorData?.cause as { missingAgents?: Array<{ id: string; name: string }> } | undefined;
          if (cause?.missingAgents) {
            setMissingAgents(cause.missingAgents);
            setShowAgentDialog(true);
            return;
          }
        } catch {
          // Ignore parsing errors
        }
      }
      toast.error("Failed to fork conversation");
    },
  });

  // Install agent mutation
  const installAgentMutation = api.userAgent.install.useMutation({
    onSuccess: () => {
      void utils.userAgent.list.invalidate();
    },
    onError: () => {
      toast.error("Failed to install agent");
    },
  });

  const handleFork = () => {
    forkMutation.mutate({ conversationId });
  };

  const handleInstallAgent = async (agentId: string) => {
    await installAgentMutation.mutateAsync({ agentId, setAsDefault: false });
  };

  const handleInstallAllAndFork = async () => {
    try {
      // Install all missing agents
      for (const agent of missingAgents) {
        await installAgentMutation.mutateAsync({ 
          agentId: agent.id, 
          setAsDefault: false 
        });
      }
      toast.success("All agents installed");
      setShowAgentDialog(false);
      // Retry fork
      forkMutation.mutate({ conversationId });
    } catch {
      toast.error("Failed to install agents");
    }
  };

  return (
    <>
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            {ownerImage && (
              <Image 
                src={ownerImage} 
                alt={ownerName || "User"} 
                width={32}
                height={32}
                className="w-8 h-8 rounded-full"
              />
            )}
            <div>
              <p className="text-sm font-medium">
                Shared by {ownerName || "Anonymous"}
              </p>
              <p className="text-xs text-muted-foreground">
                This is a read-only view
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isGuest ? (
              <Button 
                size="sm" 
                onClick={() => {
                  // Pass current URL so user returns here after login
                  const currentPath = window.location.pathname;
                  setLoginModalOpen(true, currentPath);
                }}
              >
                Sign in to Fork
              </Button>
            ) : (
              <Button 
                size="sm" 
                onClick={handleFork}
                disabled={forkMutation.isPending}
              >
                <Copy className="h-4 w-4 mr-2" />
                Fork to My Chats
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Agent Installation Dialog */}
      <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Agents Required
            </DialogTitle>
            <DialogDescription>
              To fork this conversation, you need to install the following agents first:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            {missingAgents.map((agent) => (
              <div 
                key={agent.id} 
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium text-sm">{agent.name}</p>
                  <p className="text-xs text-muted-foreground">System Agent</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleInstallAgent(agent.id)}
                  disabled={installAgentMutation.isPending}
                >
                  Install
                </Button>
              </div>
            ))}
          </div>

          <Button 
            onClick={() => void handleInstallAllAndFork()}
            disabled={installAgentMutation.isPending || forkMutation.isPending}
            className="w-full"
          >
            Install All & Fork
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

