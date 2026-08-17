"use client"

import { api } from "@/trpc/react"
import { useParams, useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Mail,
  MessageSquare,
  Bell,
  CalendarClock,
  Zap,
  Hand,
  Eye,
  Copy,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useTranslations, useLocale } from "next-intl"

const channelIcons: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  SMS: <MessageSquare className="h-4 w-4" />,
  PUSH: <Bell className="h-4 w-4" />,
}

const triggerIcons: Record<string, React.ReactNode> = {
  SCHEDULED: <CalendarClock className="h-4 w-4" />,
  EVENT: <Zap className="h-4 w-4" />,
  MANUAL: <Hand className="h-4 w-4" />,
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

export default function SceneDetailPage() {
  const t = useTranslations("admin.templates")
  const locale = useLocale()
  const params = useParams()
  const router = useRouter()
  const sceneKey = params.key as string

  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

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

  const utils = api.useUtils()

  const { data: scene, isLoading } = api.admin.getTouchScene.useQuery({ key: sceneKey })

  const createTemplate = api.admin.createTouchTemplate.useMutation({
    onSuccess: () => {
      void utils.admin.getTouchScene.invalidate({ key: sceneKey })
      setCreateOpen(false)
      toast.success(t("createSuccess"))
    },
    onError: (err) => toast.error(err.message),
  })

  const updateTemplate = api.admin.updateTouchTemplate.useMutation({
    onSuccess: () => {
      void utils.admin.getTouchScene.invalidate({ key: sceneKey })
      setEditId(null)
      toast.success(t("updateSuccess"))
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteTemplate = api.admin.deleteTouchTemplate.useMutation({
    onSuccess: () => {
      void utils.admin.getTouchScene.invalidate({ key: sceneKey })
      toast.success(t("deleteSuccess"))
    },
    onError: (err) => toast.error(err.message),
  })

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-[1200px] mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!scene) {
    return (
      <div className="space-y-6 max-w-[1200px] mx-auto">
        <div className="text-center py-12 text-muted-foreground">{t("sceneNotExist")}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{scene.name}</h1>
            <Badge variant={scene.isActive ? "default" : "secondary"}>
              {scene.isActive ? t("active") : t("inactive")}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{scene.key}</code>
            <span className="flex items-center gap-1">
              {channelIcons[scene.channel]}
              {channelLabels[scene.channel]}
            </span>
            <span className="flex items-center gap-1">
              {triggerIcons[scene.triggerType]}
              {triggerLabels[scene.triggerType]}
            </span>
            <span>{t("schedulesCount", { count: scene._count.schedules })}</span>
          </div>
          {scene.description && (
            <p className="text-sm text-muted-foreground mt-2">{scene.description}</p>
          )}
        </div>
      </div>

      {/* Templates */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("templateList")}</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("newTemplate")}
          </Button>
        </div>

        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">{t("language")}</TableHead>
                <TableHead className="w-[120px]">{t("version")}</TableHead>
                <TableHead>{t("subject")}</TableHead>
                <TableHead className="w-[80px]">{t("default")}</TableHead>
                <TableHead className="w-[80px]">{t("status")}</TableHead>
                <TableHead className="w-[140px]">{t("updatedAt")}</TableHead>
                <TableHead className="w-[140px]">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scene.templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t("noTemplates")}
                  </TableCell>
                </TableRow>
              ) : (
                scene.templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{template.locale}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{template.version}</code>
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[300px]">
                      {template.subject || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {template.isDefault && <Badge variant="secondary" className="text-xs">{t("defaultBadge")}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? "default" : "secondary"} className="text-xs">
                        {template.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(template.updatedAt, locale)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewId(template.id)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditId(template.id)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("deleteDesc", { locale: template.locale, version: template.version })}
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteTemplate.mutate({ id: template.id })}
                              >
                                {t("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Template Dialog */}
      <TemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => createTemplate.mutate({ sceneKey, ...data })}
        isLoading={createTemplate.isPending}
        mode="create"
      />

      {/* Edit Template Dialog */}
      {editId && (
        <EditTemplateDialog
          templateId={editId}
          onOpenChange={(open) => !open && setEditId(null)}
          onSubmit={(data) => updateTemplate.mutate({ id: editId, ...data })}
          isLoading={updateTemplate.isPending}
        />
      )}

      {/* Preview Dialog */}
      {previewId && (
        <PreviewTemplateDialog
          templateId={previewId}
          onOpenChange={(open) => !open && setPreviewId(null)}
        />
      )}
    </div>
  )
}

function TemplateDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    locale: string
    version: string
    isDefault: boolean
    isActive: boolean
    subject?: string
    bodyText?: string
    bodyHtml?: string
  }) => void
  isLoading: boolean
  mode: "create" | "edit"
}) {
  const t = useTranslations("admin.templates")
  const [locale, setLocale] = useState("en")
  const [version, setVersion] = useState("default")
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [subject, setSubject] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")

  const handleSubmit = () => {
    onSubmit({
      locale,
      version,
      isDefault,
      isActive,
      subject: subject || undefined,
      bodyText: bodyText || undefined,
      bodyHtml: bodyHtml || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{t("language")}</Label>
              <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en" />
            </div>
            <div className="space-y-2">
              <Label>{t("version")}</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="default" />
            </div>
            <div className="space-y-2">
              <Label>{t("defaultLabel")}</Label>
              <div className="pt-2">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("enabled")}</Label>
              <div className="pt-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("subjectLabel")}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("subjectPlaceholder")} />
          </div>

          <div className="space-y-2">
            <Label>{t("bodyTextLabel")}</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={t("bodyTextPlaceholder")}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>{t("bodyHtmlLabel")}</Label>
            <Textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder={t("bodyHtmlPlaceholder")}
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            {t("availableVariables")} <code className="bg-muted px-1 rounded">{`{{periodEndAtIso}}`}</code>, <code className="bg-muted px-1 rounded">{`{{manageUrl}}`}</code>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTemplateDialog({
  templateId,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  templateId: string
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    locale?: string
    version?: string
    isDefault?: boolean
    isActive?: boolean
    subject?: string
    bodyText?: string
    bodyHtml?: string
  }) => void
  isLoading: boolean
}) {
  const t = useTranslations("admin.templates")
  const { data: template } = api.admin.getTouchTemplate.useQuery({ id: templateId })

  const [locale, setLocale] = useState("")
  const [version, setVersion] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [subject, setSubject] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [initialized, setInitialized] = useState(false)

  if (template && !initialized) {
    setLocale(template.locale)
    setVersion(template.version)
    setIsDefault(template.isDefault)
    setIsActive(template.isActive)
    setSubject(template.subject || "")
    setBodyText(template.bodyText || "")
    setBodyHtml(template.bodyHtml || "")
    setInitialized(true)
  }

  const handleSubmit = () => {
    onSubmit({
      locale,
      version,
      isDefault,
      isActive,
      subject: subject || undefined,
      bodyText: bodyText || undefined,
      bodyHtml: bodyHtml || undefined,
    })
  }

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        {!template ? (
          <div className="py-8 text-center text-muted-foreground">{t("loading")}</div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>{t("language")}</Label>
                  <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en" />
                </div>
                <div className="space-y-2">
                  <Label>{t("version")}</Label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="default" />
                </div>
                <div className="space-y-2">
                  <Label>{t("defaultLabel")}</Label>
                  <div className="pt-2">
                    <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("enabled")}</Label>
                  <div className="pt-2">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("subjectLabel")}</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("subjectPlaceholder")} />
              </div>

              <div className="space-y-2">
                <Label>{t("bodyTextLabel")}</Label>
                <Textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder={t("bodyTextPlaceholder")}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("bodyHtmlLabel")}</Label>
                <Textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  placeholder={t("bodyHtmlPlaceholder")}
                  rows={10}
                  className="font-mono text-sm"
                />
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

function PreviewTemplateDialog({
  templateId,
  onOpenChange,
}: {
  templateId: string
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("admin.templates")
  const { data: template } = api.admin.getTouchTemplate.useQuery({ id: templateId })
  const [tab, setTab] = useState<"html" | "text">("html")

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("copied", { label }))
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("previewTitle")}</DialogTitle>
        </DialogHeader>
        {!template ? (
          <div className="py-8 text-center text-muted-foreground">{t("loading")}</div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="mb-4 p-3 bg-muted rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-muted-foreground">{t("subjectPreview")} </span>
                  <span className="font-medium">{template.subject || "-"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(template.subject || "", t("subjectLabel"))}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {t("copy")}
                </Button>
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-fit">
                <TabsTrigger value="html">{t("htmlPreview")}</TabsTrigger>
                <TabsTrigger value="text">{t("plainText")}</TabsTrigger>
              </TabsList>
              <TabsContent value="html" className="flex-1 overflow-auto border rounded-md mt-2">
                {template.bodyHtml ? (
                  <iframe
                    srcDoc={template.bodyHtml}
                    className="w-full h-full min-h-[400px]"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="p-4 text-muted-foreground">{t("noHtml")}</div>
                )}
              </TabsContent>
              <TabsContent value="text" className="flex-1 overflow-auto">
                <pre className="p-4 bg-muted rounded-md text-sm whitespace-pre-wrap font-mono min-h-[400px]">
                  {template.bodyText || t("noPlainText")}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

