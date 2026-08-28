/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, User } from "lucide-react";
import { useTranslations } from "next-intl";

interface CreditsTableProps {
  users: Array<{
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  }>;
  isLoading: boolean;
  onManageClick: (user: { id: string; name: string | null }) => void;
}

export function CreditsTable({
  users,
  isLoading,
  onManageClick,
}: CreditsTableProps) {
  const t = useTranslations("admin.creditsManagement");
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border p-12 text-center">
        <p>{t("noUsers")}</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("user")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                  {user.image ? (
                    <img
                      src={user.image}
                      alt={user.name || ""}
                      className="bg-muted h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
                      <User className="text-muted-foreground h-4 w-4" />
                    </div>
                  )}
                  <span>{user.name || t("notAvailable")}</span>
                </div>
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onManageClick({ id: user.id, name: user.name })
                  }
                >
                  <Coins className="mr-2 h-4 w-4" />
                  {t("manageCredits")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
