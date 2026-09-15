"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Bot,
  ChevronDown,
  Share2,
  MoreHorizontal,
  Sparkles,
  Archive,
  Trash2,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { AgentLogo } from "@/components/explorer/agent-logo";

// Import types directly from Prisma
import type { UserAgent, Agent } from "@prisma/client";

// Type for user agents with full agent details
type AgentWithDetails = UserAgent & {
  agent: Agent;
};

interface ChatHeaderProps {
  conversationId?: string;
  isGuest?: boolean;
  className?: string;
}

export function ChatHeader({
  conversationId,
  isGuest = false,
  className,
}: ChatHeaderProps) {
  const router = useRouter();
  const { status } = useSession();
  const { selectedUserAgentId } = useAgentStore();
  const [isAgentSelectorOpen, setIsAgentSelectorOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);

  const utils = api.useUtils();
  const { data: enabledFeatures } = api.features.publicState.useQuery(
    undefined,
    { refetchInterval: 15000 },
  );
  const sharingEnabled = enabledFeatures?.includes("sharing") ?? false;

  // Get conversation info (includes sharing status)
  const { data: conversation } = api.conversation.get.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  // Get user agents (for logged-in users)
  const { data: userAgents } = api.userAgent.list.useQuery(undefined, {
    enabled: status === "authenticated" && !isGuest,
  });

  // Get billing status for upgrade prompt
  const { data: billingStatus } = api.account.getBillingStatus.useQuery(
    undefined,
    {
      enabled: status === "authenticated" && !isGuest,
    },
  );

  // Share conversation mutation
  const shareConversation = api.conversation.share.useMutation({
    onSuccess: () => {
      toast.success("Conversation is now public");
      void utils.conversation.get.invalidate();
    },
    onError: () => {
      toast.error("Failed to share conversation");
    },
  });

  // Unshare conversation mutation
  const unshareConversation = api.conversation.unshare.useMutation({
    onSuccess: () => {
      toast.success("Sharing disabled");
      void utils.conversation.get.invalidate();
    },
    onError: () => {
      toast.error("Failed to unshare conversation");
    },
  });

  // Archive conversation mutation
  const archiveConversation = api.conversation.archive.useMutation({
    onSuccess: () => {
      toast.success("Conversation archived");
      router.push("/chat");
    },
    onError: () => {
      toast.error("Failed to archive conversation");
    },
  });

  // Delete conversation mutation
  const deleteConversation = api.conversation.delete.useMutation({
    onSuccess: () => {
      toast.success("Conversation deleted");
      router.push("/chat");
    },
    onError: () => {
      toast.error("Failed to delete conversation");
    },
  });

  const selectedAgent = userAgents?.find(
    (a: AgentWithDetails) => a.id === selectedUserAgentId,
  );
  const isPro = billingStatus?.tier === "PLUS";
  const isShared = conversation?.isShared ?? false;

  const handleAgentChange = (agentId: string) => {
    useAgentStore.getState().setSelectedUserAgentId(agentId);
    setIsAgentSelectorOpen(false);
    toast.success("Agent switched");
  };

  const handleShareConversation = () => {
    setIsShareDialogOpen(true);
  };

  const handleEnableSharing = () => {
    if (!conversationId) return;
    shareConversation.mutate({ conversationId });
  };

  const handleDisableSharing = () => {
    if (!conversationId) return;
    unshareConversation.mutate({ conversationId });
  };

  const handleCopyShareUrl = async () => {
    if (!conversationId) return;
    const shareUrl = `${window.location.origin}/chat/${conversationId}`;
    await navigator.clipboard.writeText(shareUrl);
    setShareUrlCopied(true);
    setTimeout(() => setShareUrlCopied(false), 2000);
    toast.success("Link copied to clipboard");
  };

  const handleArchive = () => {
    if (!conversationId) return;
    archiveConversation.mutate({ conversationId });
  };

  const handleDelete = () => {
    if (!conversationId) return;
    if (
      window.confirm(
        "Are you sure you want to delete this conversation? This action cannot be undone.",
      )
    ) {
      deleteConversation.mutate({ conversationId });
    }
  };

  return (
    <header
      className={cn(
        // Position: sticky on mobile, absolute on larger screens
        "sticky top-0 right-0 left-0 z-20 md:absolute",
        // Layout
        "flex h-14 items-center justify-between px-4",
        // Pointer events: header doesn't block clicks, but children do
        "pointer-events-none [&>*]:pointer-events-auto",
        // Visual
        "select-none",
        // Responsive: transparent on desktop, has background on mobile
        "bg-background/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none",
        "border-border/40 border-b md:border-none",
        // Animation
        "transition-all duration-200",
        className,
      )}
    >
      {/* Left: Agent Switcher - Floating style */}
      <div className="flex items-center gap-2">
        {!isGuest && userAgents && userAgents.length > 0 ? (
          <Popover
            open={isAgentSelectorOpen}
            onOpenChange={setIsAgentSelectorOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="hover:bg-muted/80 bg-background/60 border-border/40 h-9 rounded-full border px-3 font-medium shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
              >
                <AgentLogo
                  avatar={selectedAgent?.agent.avatar}
                  name={selectedAgent?.agent.name ?? "Select Agent"}
                  color={selectedAgent?.agent.color}
                  size="xs"
                />
                <span className="ml-2 max-w-[200px] truncate">
                  {selectedAgent?.agent.name || "Select Agent"}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search agents..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No agents found.</CommandEmpty>
                  <CommandGroup>
                    {userAgents.map((agent: AgentWithDetails) => {
                      const isSelected = agent.id === selectedUserAgentId;
                      const isDefault = agent.isDefault;

                      return (
                        <CommandItem
                          key={agent.id}
                          value={agent.agent.name}
                          onSelect={() => handleAgentChange(agent.id)}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <AgentLogo
                              avatar={agent.agent.avatar}
                              name={agent.agent.name}
                              color={agent.agent.color}
                              size="sm"
                            />
                            <span className="truncate text-sm">
                              {agent.agent.name}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {isDefault && (
                              <span className="text-muted-foreground text-xs">
                                Default
                              </span>
                            )}
                            {isSelected && (
                              <Check className="text-primary h-4 w-4" />
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
              <div className="border-t px-2 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start text-sm"
                  onClick={() => {
                    setIsAgentSelectorOpen(false);
                    window.location.href = "/explorer";
                  }}
                >
                  Browse more agents...
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="text-muted-foreground bg-background/60 border-border/40 flex h-9 items-center gap-2 rounded-full border px-3 text-sm shadow-sm backdrop-blur-sm">
            <Bot className="h-4 w-4" />
            <span>App</span>
          </div>
        )}
      </div>

      {/* Center: Upgrade Prompt (for free users) - Floating style */}
      <div className="absolute left-1/2 -translate-x-1/2">
        {!isGuest && !isPro && (
          <Button
            variant="ghost"
            size="sm"
            className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 h-8 gap-2 rounded-full border px-3 shadow-sm transition-all hover:shadow-md"
            onClick={() => router.push("/account/billing")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Get Plus</span>
          </Button>
        )}
      </div>

      {/* Right: Share and More Options - Floating style */}
      <div className="flex items-center gap-2">
        {/* Share Button */}
        {conversationId && !isGuest && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "hover:bg-muted/80 bg-background/60 h-9 rounded-full border px-3 shadow-sm backdrop-blur-sm transition-all hover:shadow-md",
              isShared ? "border-primary/40 text-primary" : "border-border/40",
            )}
            onClick={handleShareConversation}
          >
            {isShared ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Shared</span>
              </>
            ) : (
              <>
                <Share2 className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </Button>
        )}

        {/* More Options */}
        {conversationId && !isGuest && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-muted/80 bg-background/60 border-border/40 h-9 w-9 rounded-full border shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {sharingEnabled && (
                <DropdownMenuItem onClick={handleShareConversation}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
              )}
              {sharingEnabled && (
                <DropdownMenuItem onClick={handleCopyShareUrl}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </DropdownMenuItem>
              )}
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Share Dialog */}
      <Dialog
        open={isShareDialogOpen && sharingEnabled}
        onOpenChange={setIsShareDialogOpen}
      >
        <DialogContent className="overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Conversation</DialogTitle>
          </DialogHeader>
          {!isShared ? (
            // Not shared yet
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Share this conversation with anyone. They will be able to view
                it but not continue the conversation unless they fork it.
              </p>
              <Button
                onClick={handleEnableSharing}
                className="w-full"
                disabled={shareConversation.isPending}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Enable Public Sharing
              </Button>
            </div>
          ) : (
            // Already shared
            <div className="min-w-0 space-y-4">
              <div className="flex min-w-0 items-center gap-2">
                <div className="bg-muted min-w-0 flex-1 overflow-hidden rounded-md px-3 py-2">
                  <div className="truncate text-sm">
                    {conversationId
                      ? `${window.location.origin}/chat/${conversationId}`
                      : ""}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => void handleCopyShareUrl()}
                  className="flex-shrink-0"
                >
                  {shareUrlCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Anyone with this link can view this conversation.
              </p>
              <Button
                variant="outline"
                onClick={handleDisableSharing}
                className="w-full"
                disabled={unshareConversation.isPending}
              >
                Disable Sharing
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </header>
  );
}
