"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Gift, ArrowRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { api } from "@/trpc/react";

interface WelcomeBackDialogProps {
  onTopUp: () => void;
  /** 受控模式：外部控制是否打开 */
  open?: boolean;
  /** 受控模式：外部控制关闭回调 */
  onOpenChange?: (open: boolean) => void;
}

export function WelcomeBackDialog({ onTopUp, open: controlledOpen, onOpenChange }: WelcomeBackDialogProps) {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  
  // 受控 vs 非受控模式
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (isControlled) {
      onOpenChange?.(open);
    } else {
      setInternalOpen(open);
    }
  };
  
  // 获取当前积分余额，用于辅助判断（仅非受控模式需要）
  const { data: balance } = api.billing.getBalance.useQuery(
    {},
    { 
      enabled: !!session?.user?.id && !isControlled,
      staleTime: 60000 
    }
  );

  // 自动触发逻辑（仅非受控模式）
  useEffect(() => {
    if (isControlled) return;
    if (!session?.user) return;
    if (balance === undefined) return;

    // 触发条件：
    // 1. 非首账号 (isPrimaryDeviceAccount === false)
    // 2. 积分余额 <= 100 (确保没有充值过)
    // 3. 本地没有记录显示已弹过
    const isSecondaryAccount = session.user.isPrimaryDeviceAccount === false;
    const lowBalance = balance.totalSummary.available <= 100;
    
    if (isSecondaryAccount && lowBalance) {
      const storageKey = `app_welcome_back_${session.user.id}`;
      const hasSeen = localStorage.getItem(storageKey);
      
      if (!hasSeen) {
        setInternalOpen(true);
        localStorage.setItem(storageKey, "true");
      }
    }
  }, [session, balance, isControlled]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleTopUp = () => {
    setIsOpen(false);
    onTopUp();
  };

  const Content = () => (
    <div className="flex flex-col items-center text-center p-6 pt-10 pb-8">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
        <Gift className="w-8 h-8 text-primary" />
      </div>
      
      <div className="space-y-4 mb-8">
        <h2 className="text-xl font-bold tracking-tight">
          Welcome Back!
        </h2>
        <div className="text-muted-foreground text-sm space-y-3 max-w-[280px] mx-auto leading-relaxed">
          <p>It looks like you&apos;re already familiar with our platform!</p>
          <p>
            We&apos;ve added <span className="font-semibold text-foreground">100 bonus credits</span> to your new account as a welcome gift.
          </p>
          <p>
            Top up now to combine your credits and start creating instantly.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        <Button 
          size="lg" 
          onClick={handleTopUp}
          className="w-full gap-2 font-semibold shadow-lg shadow-primary/20"
        >
          Get More Credits
          <ArrowRight className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" 
          onClick={handleClose}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          View Dashboard
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="bg-background">
          <Content />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden bg-background border-border shadow-2xl">
        <Content />
      </DialogContent>
    </Dialog>
  );
}
