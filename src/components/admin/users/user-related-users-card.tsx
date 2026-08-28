/* eslint-disable @next/next/no-img-element */
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import type { RelatedUser } from "./types";
import { useFormatter, useTranslations } from "next-intl";

interface UserRelatedUsersCardProps {
  deviceKeyAtSignup: string | null;
  relatedUsers: RelatedUser[] | undefined;
  isLoading: boolean;
}

export function UserRelatedUsersCard({
  deviceKeyAtSignup,
  relatedUsers,
  isLoading,
}: UserRelatedUsersCardProps) {
  const t = useTranslations("admin.userManagement");
  const format = useFormatter();
  if (!deviceKeyAtSignup) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4" />
          {t("related.title")}
        </CardTitle>
        <CardDescription>{t("related.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !relatedUsers || relatedUsers.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            {t("related.noUsers")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("related.user")}</TableHead>
                <TableHead>{t("related.status")}</TableHead>
                <TableHead>{t("related.primary")}</TableHead>
                <TableHead>{t("related.joined")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatedUsers.map((relUser) => (
                <TableRow key={relUser.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {relUser.image ? (
                        <img
                          src={relUser.image}
                          alt=""
                          className="h-6 w-6 rounded-full"
                        />
                      ) : (
                        <div className="bg-muted flex h-6 w-6 items-center justify-center rounded-full">
                          <User className="text-muted-foreground h-3 w-3" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {relUser.name || t("notAvailable")}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {relUser.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {relUser.isBlocked ? (
                      <Badge variant="destructive">{t("blocked")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("active")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {relUser.isPrimaryDeviceAccount ? (
                      <Badge variant="default">{t("yes")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("no")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format.dateTime(new Date(relUser.createdAt), {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/users/${relUser.id}`}>
                        {t("related.view")}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
