"use client";

import { api } from "@/trpc/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { User, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { GrantCreditsDialog } from "./grant-credits-dialog";
import { DeductCreditsDialog } from "./deduct-credits-dialog";
import { OperationIcon, OperationBadge } from "./operation-status";
import { cn } from "@/lib/utils";
import { useFormatter, useTranslations } from "next-intl";

interface UserCreditsDisplayProps {
  userId: string;
  userName: string | null;
  className?: string;
}

export function UserCreditsDisplay({
  userId,
  userName,
  className,
}: UserCreditsDisplayProps) {
  const t = useTranslations("admin.creditsManagement");
  const format = useFormatter();
  const { data, isLoading, refetch } = api.admin.getUserCredits.useQuery({
    userId,
  });

  // Grants query with pagination
  const grantsQuery = api.admin.listBillingRecords.useInfiniteQuery(
    { userId, operationType: "GRANT", limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  // Consumption query with pagination (CONSUME type includes freeze/consume/unfreeze in Velobase)
  const consumptionQuery = api.admin.listBillingRecords.useInfiniteQuery(
    { userId, operationType: "CONSUME", limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const grantRecords = grantsQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const consumeRecords =
    consumptionQuery.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className={cn("space-y-6 rounded-lg border p-6", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
            <User className="text-muted-foreground h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">{userName || t("unknown")}</p>
            <p className="text-muted-foreground text-sm">{userId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <GrantCreditsDialog
            userId={userId}
            userName={userName}
            onSuccess={() => refetch()}
          />
          <DeductCreditsDialog
            userId={userId}
            userName={userName}
            onSuccess={() => refetch()}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-md p-4">
          <p className="text-muted-foreground text-sm">{t("available")}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold text-green-600">
              {format.number(data?.totalSummary?.available ?? 0)}
            </p>
          )}
        </div>
        <div className="bg-muted/50 rounded-md p-4">
          <p className="text-muted-foreground text-sm">{t("total")}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold">
              {format.number(data?.totalSummary?.total ?? 0)}
            </p>
          )}
        </div>
        <div className="bg-muted/50 rounded-md p-4">
          <p className="text-muted-foreground text-sm">{t("used")}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold text-amber-600">
              {format.number(data?.totalSummary?.used ?? 0)}
            </p>
          )}
        </div>
        <div className="bg-muted/50 rounded-md p-4">
          <p className="text-muted-foreground text-sm">{t("frozen")}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold text-blue-600">
              {format.number(data?.totalSummary?.frozen ?? 0)}
            </p>
          )}
        </div>
      </div>

      {data?.accounts && data.accounts.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">{t("accountBreakdown")}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("type")}</TableHead>
                <TableHead className="text-right">{t("available")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
                <TableHead className="text-right">{t("used")}</TableHead>
                <TableHead>{t("expires")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accounts.map((account, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">
                    {account.source}
                  </TableCell>
                  <TableCell className="text-right">
                    {format.number(account.available)}
                  </TableCell>
                  <TableCell className="text-right">
                    {format.number(account.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    {format.number(account.used)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {account.expiresAt
                      ? format.dateTime(new Date(account.expiresAt), {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Tabs defaultValue="grants" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="grants" className="gap-2">
            <ArrowDownCircle className="h-4 w-4" />
            {t("grantsTab", {
              count: grantRecords.length,
              more: grantsQuery.hasNextPage ? "+" : "",
            })}
          </TabsTrigger>
          <TabsTrigger value="consumption" className="gap-2">
            <ArrowUpCircle className="h-4 w-4" />
            {t("consumptionTab", {
              count: consumeRecords.length,
              more: consumptionQuery.hasNextPage ? "+" : "",
            })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grants" className="mt-4">
          {grantsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : grantRecords.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("noGrantRecords")}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("source")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead>
                    <TableHead>{t("description")}</TableHead>
                    <TableHead>{t("time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grantRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {record.source}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        +{format.number(record.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">
                        {record.description || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format.dateTime(new Date(record.createdAt), {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {grantsQuery.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => grantsQuery.fetchNextPage()}
                    disabled={grantsQuery.isFetchingNextPage}
                  >
                    {grantsQuery.isFetchingNextPage
                      ? t("loading")
                      : t("loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="consumption" className="mt-4">
          {consumptionQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : consumeRecords.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("noConsumptionRecords")}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("operation")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead>
                    <TableHead>{t("source")}</TableHead>
                    <TableHead>{t("description")}</TableHead>
                    <TableHead>{t("time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumeRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <OperationIcon type={record.operationType} />
                          <OperationBadge type={record.operationType} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-amber-600">
                        -{format.number(record.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {record.source}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">
                        {record.description || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format.dateTime(new Date(record.createdAt), {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {consumptionQuery.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => consumptionQuery.fetchNextPage()}
                    disabled={consumptionQuery.isFetchingNextPage}
                  >
                    {consumptionQuery.isFetchingNextPage
                      ? t("loading")
                      : t("loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
