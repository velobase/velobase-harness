"use client"

import { ArrowDownCircle, ArrowUpCircle, Snowflake, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

export const OperationIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "GRANT":
      return <ArrowDownCircle className="h-4 w-4 text-foreground" />
    case "CONSUME":
      return <ArrowUpCircle className="h-4 w-4 text-foreground" />
    case "FREEZE":
      return <Snowflake className="h-4 w-4 text-foreground" />
    case "UNFREEZE":
      return <Snowflake className="h-4 w-4 text-muted-foreground" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}

export const OperationBadge = ({ type }: { type: string }) => {
  const t = useTranslations("admin.creditsManagement.operations")
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    GRANT: "secondary",
    CONSUME: "secondary",
    FREEZE: "outline",
    UNFREEZE: "outline",
  }
  return <Badge variant={variants[type] || "outline"}>{t.has(type.toLowerCase()) ? t(type.toLowerCase()) : type}</Badge>
}
