"use client"

import { api } from "@/trpc/react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState, useCallback } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Plus,
  Edit,
  Mail,
  MessageSquare,
  Bell,
  CalendarClock,
  Zap,
  Hand,
} from "lucide-react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import Link from "next/link"
import { useTranslations, useLocale } from "next-intl"

type FilterChannel = "all" | "EMAIL" | "SMS" | "PUSH"
type FilterActive = "all" | "true" | "false"

interface Filters {
  channel: FilterChannel
  isActive: FilterActive
}

const defaultFilters: Filters = {
  channel: "all",
  isActive: "all",
}

const channelIcons: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-3 w-3" />,
  SMS: <MessageSquare className="h-3 w-3" />,
  PUSH: <Bell className="h-3 w-3" />,
}

const triggerIcons: Record<string, React.ReactNode> = {
  SCHEDULED: <CalendarClock className="h-3 w-3" />,
  EVENT: <Zap className="h-3 w-3" />,
  MANUAL: <Hand className="h-3 w-3" />,
}

function formatDate(date: Date | string, locale: string) {
  return new Date(date).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function TouchScenesPage() {
  const t = useTranslations("admin.scenes")
  const locale = useLocale()

  const channelLabels: Record<string, string> = {
    EMAIL: t("channels.EMAIL"),
    SMS: t("channels.SMS"),
    PUSH: t("channels.PUSH"),
  }

  const triggerLabels: Record<string, string> = {
    SCHEDULED: t("triggers.scheduled"),
    EVENT: t("triggers.event"),
    MANUAL: t("triggers.manual"),
  }

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [createOpen, setCreateOpen] = useState(false)
  const [editKey, setEditKey] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 500)

  const utils = api.useUtils()

  const { data, isLoading } = api.admin.listTouchScenes.useQuery({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    channel: filters.channel,
    isActive: filters.isActive,
  })

  const createScene = api.admin.createTouchScene.useMutation({
    onSuccess: () => {
      void utils.admin.listTouchScenes.invalidate()
      setCreateOpen(false)
      toast.success(t("createSuccess"))
    },
    onError: (err) => toast.error(err.message),
  })

  const updateScene = api.admin.updateTouchScene.useMutation({
    onSuccess: () => {
      void utils.admin.listTouchScenes.invalidate()
      setEditKey(null)
      toast.success(t("updateSuccess"))
    },
    onError: (err) => toast.error(err.message),
  })

  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }, [])

  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {total > 0 ? t("subtitleTotal", { count: total }) : t("subtitleEmpty")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-9"
            />
          </div>
          <Select value={filters.channel} onValueChange={(v) => updateFilter("channel", v as FilterChannel)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="EMAIL">{t("channels.EMAIL")}</SelectItem>
              <SelectItem value="SMS">{t("channels.SMS")}</SelectItem>
              <SelectItem value="PUSH">{t("channels.PUSH")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.isActive} onValueChange={(v) => updateFilter("isActive", v as FilterActive)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="true">{t("active")}</SelectItem>
              <SelectItem value="false">{t("inactive")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("create")}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">{t("key")}</TableHead>
              <TableHead className="w-[200px]">{t("name")}</TableHead>
              <TableHead className="w-[100px]">{t("channel")}</TableHead>
              <TableHead className="w-[100px]">{t("trigger")}</TableHead>
              <TableHead className="w-[80px]">{t("templates")}</TableHead>
              <TableHead className="w-[80px]">{t("schedules")}</TableHead>
              <TableHead className="w-[80px]">{t("status")}</TableHead>
              <TableHead className="w-[140px]">{t("createdAt")}</TableHead>
              <TableHead className="w-[100px]">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  {t("noData")}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((scene) => (
                <TableRow key={scene.id}>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{scene.key}</code>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{scene.name}</div>
                    {scene.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">{scene.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs gap-1">
                      {channelIcons[scene.channel]}
                      {channelLabels[scene.channel] || scene.channel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs gap-1">
                      {triggerIcons[scene.triggerType]}
                      {triggerLabels[scene.triggerType] || scene.triggerType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {scene.templates.length}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {scene._count.schedules}
                  </TableCell>
                  <TableCell>
                    <Badge variant={scene.isActive ? "default" : "secondary"} className="text-xs">
                      {scene.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(scene.createdAt, locale)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditKey(scene.key)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                        <Link href={`/admin/touches/scenes/${scene.key}`}>{t("details")}</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("pageIndicator", { page, totalPages, total })}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page === 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page - 1)} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page + 1)} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <CreateSceneDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => createScene.mutate(data)}
        isLoading={createScene.isPending}
      />

      {/* Edit Dialog */}
      {editKey && (
        <EditSceneDialog
          sceneKey={editKey}
          onOpenChange={(open) => !open && setEditKey(null)}
          onSubmit={(data) => updateScene.mutate({ key: editKey, ...data })}
          isLoading={updateScene.isPending}
        />
      )}
    </div>
  )
}

function CreateSceneDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    key: string
    name: string
    description?: string
    channel: "EMAIL" | "SMS" | "PUSH"
    triggerType: "SCHEDULED" | "EVENT" | "MANUAL"
    isActive: boolean
  }) => void
  isLoading: boolean
}) {
  const t = useTranslations("admin.scenes")
  const [key, setKey] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [channel, setChannel] = useState<"EMAIL" | "SMS" | "PUSH">("EMAIL")
  const [triggerType, setTriggerType] = useState<"SCHEDULED" | "EVENT" | "MANUAL">("SCHEDULED")
  const [isActive, setIsActive] = useState(true)

  const handleSubmit = () => {
    if (!key || !name) {
      toast.error(t("requireFields"))
      return
    }
    onSubmit({ key, name, description: description || undefined, channel, triggerType, isActive })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("keyLabel")}</Label>
            <Input
              placeholder={t("keyPlaceholder")}
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">{t("keyHint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("nameLabel")}</Label>
            <Input placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("descriptionLabel")}</Label>
            <Textarea placeholder={t("descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("channelLabel")}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">{t("channels.EMAIL")}</SelectItem>
                  <SelectItem value="SMS">{t("channels.SMS")}</SelectItem>
                  <SelectItem value="PUSH">{t("channels.PUSH")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("triggerLabel")}</Label>
              <Select value={triggerType} onValueChange={(v) => setTriggerType(v as typeof triggerType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHEDULED">{t("triggers.scheduled")}</SelectItem>
                  <SelectItem value="EVENT">{t("triggers.event")}</SelectItem>
                  <SelectItem value="MANUAL">{t("triggers.manual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("enabled")}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t("creating") : t("createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditSceneDialog({
  sceneKey,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  sceneKey: string
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    name?: string
    description?: string
    channel?: "EMAIL" | "SMS" | "PUSH"
    triggerType?: "SCHEDULED" | "EVENT" | "MANUAL"
    isActive?: boolean
  }) => void
  isLoading: boolean
}) {
  const t = useTranslations("admin.scenes")
  const { data: scene } = api.admin.getTouchScene.useQuery({ key: sceneKey })

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [channel, setChannel] = useState<"EMAIL" | "SMS" | "PUSH">("EMAIL")
  const [triggerType, setTriggerType] = useState<"SCHEDULED" | "EVENT" | "MANUAL">("SCHEDULED")
  const [isActive, setIsActive] = useState(true)
  const [initialized, setInitialized] = useState(false)

  if (scene && !initialized) {
    setName(scene.name)
    setDescription(scene.description || "")
    setChannel(scene.channel)
    setTriggerType(scene.triggerType)
    setIsActive(scene.isActive)
    setInitialized(true)
  }

  const handleSubmit = () => {
    if (!name) {
      toast.error(t("nameRequired"))
      return
    }
    onSubmit({ name, description: description || undefined, channel, triggerType, isActive })
  }

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editTitle", { key: sceneKey })}</DialogTitle>
        </DialogHeader>
        {!scene ? (
          <div className="py-8 text-center text-muted-foreground">{t("loading")}</div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("nameLabel")}</Label>
                <Input placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("descriptionLabel")}</Label>
                <Textarea placeholder={t("descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("channelLabel")}</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMAIL">{t("channels.EMAIL")}</SelectItem>
                      <SelectItem value="SMS">{t("channels.SMS")}</SelectItem>
                      <SelectItem value="PUSH">{t("channels.PUSH")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("triggerLabel")}</Label>
                  <Select value={triggerType} onValueChange={(v) => setTriggerType(v as typeof triggerType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SCHEDULED">{t("triggers.scheduled")}</SelectItem>
                      <SelectItem value="EVENT">{t("triggers.event")}</SelectItem>
                      <SelectItem value="MANUAL">{t("triggers.manual")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("enabled")}</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

