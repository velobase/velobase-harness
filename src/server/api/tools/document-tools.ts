import { tool } from "@velobase/ai-chat";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import type { ToolContext } from "./registry";

const logger = createLogger("document-tools");

/**
 * 计算内容哈希用于去重
 */
function calculateContentHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * 列出项目文档
 */
export function createListDocumentsTool(context?: ToolContext) {
  type ListDocumentsResult = {
    documents: Array<{
      id: string;
      title: string;
      fileType: string | null;
      fileSize: number | null;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
    error?: string;
  };

  return tool<Record<string, never>, ListDocumentsResult>({
    description: "列出项目中的所有文档。返回文档标题和基本信息列表。",
    inputSchema: z.object({}),
    execute: async (_) => {
      // Use context from tool factory
      const projectId = context?.projectId;
      const userId = context?.userId;

      if (!projectId) {
        return {
          error: "缺少项目上下文（projectId）",
          documents: [],
          total: 0,
        };
      }

      try {
        logger.info({ projectId, userId }, "Listing documents");

        // 验证项目权限
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { userId: true },
        });

        if (!project) {
          return {
            error: "项目不存在",
            documents: [],
            total: 0,
          };
        }

        if (userId && project.userId !== userId) {
          return {
            error: "无权访问此项目",
            documents: [],
            total: 0,
          };
        }

        // 获取文档列表
        const documents = await db.document.findMany({
          where: {
            projectId,
            status: "active",
          },
          select: {
            id: true,
            title: true,
            fileType: true,
            fileSize: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        logger.info({ projectId, count: documents.length }, "Documents listed");

        return {
          documents: documents.map((doc) => ({
            id: doc.id,
            title: doc.title,
            fileType: doc.fileType,
            fileSize: doc.fileSize,
            createdAt: doc.createdAt.toISOString(),
            updatedAt: doc.updatedAt.toISOString(),
          })),
          total: documents.length,
        };
      } catch (error) {
        logger.error({ err: error, projectId }, "Failed to list documents");
        return {
          error: error instanceof Error ? error.message : "列出文档失败",
          documents: [],
          total: 0,
        };
      }
    },
  });
}

/**
 * 读取文档内容
 */
export function createReadDocumentTool(context?: ToolContext) {
  return tool({
    description:
      "读取指定文档的完整内容。可以通过文档标题或ID来读取。",
    inputSchema: z.object({
      title: z
        .string()
        .nullable()
        .optional()
        .describe("文档标题（title或documentId必须提供一个）"),
      documentId: z
        .string()
        .nullable()
        .optional()
        .describe("文档ID（title或documentId必须提供一个）"),
    }),
    execute: async ({ title, documentId }) => {
      // Use context from tool factory
      const projectId = context?.projectId;
      const userId = context?.userId;

      if (!projectId) {
        return {
          error: "缺少项目上下文（projectId）",
        };
      }

      if (!title && !documentId) {
        return {
          error: "必须提供文档标题（title）或文档ID（documentId）",
        };
      }

      try {
        logger.info(
          { projectId, title, documentId },
          "Reading document"
        );

        // 构建查询条件
        const where: {
          projectId: string;
          status: string;
          id?: string;
          title?: string;
        } = {
          projectId,
          status: "active",
        };

        if (documentId) {
          where.id = documentId;
        } else if (title) {
          where.title = title;
        }

        const document = await db.document.findFirst({
          where,
        });

        if (!document) {
          return {
            error: `文档不存在: ${title ?? documentId ?? ""}`,
          };
        }

        // 验证权限
        if (userId && document.userId !== userId) {
          return {
            error: "无权访问此文档",
          };
        }

        logger.info({ documentId: document.id }, "Document read successfully");

        return {
          id: document.id,
          title: document.title,
          content: document.content,
          fileType: document.fileType,
          fileUrl: document.fileUrl ?? undefined,
          metadata: document.metadata ?? {},
          createdAt: document.createdAt.toISOString(),
          updatedAt: document.updatedAt.toISOString(),
        };
      } catch (error) {
        logger.error(
          { err: error, projectId, title, documentId },
          "Failed to read document"
        );
        return {
          error: error instanceof Error ? error.message : "读取文档失败",
        };
      }
    },
  });
}

/**
 * 创建或更新文档
 * Note: This tool requires approval in the application logic
 */
export function createUpdateDocumentTool(context?: ToolContext) {
  return tool({
    description:
      "在项目中创建新文档或更新现有文档。如果文档标题已存在则更新，否则创建新文档。",
    inputSchema: z.object({
      title: z.string().min(1).describe("文档标题"),
      content: z.string().describe("文档内容（Markdown格式）"),
    }),
    execute: async ({ title, content }: { title: string; content: string }) => {
      // Use context from tool factory
      const projectId = context?.projectId;
      const userId = context?.userId;

      if (!projectId) {
        return {
          success: false,
          error: "缺少项目上下文（projectId）",
        };
      }

      if (!userId) {
        return {
          success: false,
          error: "缺少用户上下文（userId）",
        };
      }

      try {
        logger.info({ projectId, userId, title }, "Creating or updating document");

        // 验证项目权限
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { userId: true },
        });

        if (!project) {
          return {
            success: false,
            error: "项目不存在",
          };
        }

        if (project.userId !== userId) {
          return {
            success: false,
            error: "无权访问此项目",
          };
        }

        // 检查是否存在同名文档（当前版本）
        const existingDoc = await db.document.findFirst({
          where: {
            projectId,
            title,
            status: "active",
            isCurrent: true,
          },
        });

        const newContentHash = calculateContentHash(content);

        let document;
        if (existingDoc) {
          // 检查内容是否有变化
          if (existingDoc.contentHash === newContentHash) {
            logger.info({ documentId: existingDoc.id }, "Document content unchanged, skipping version creation");
            return {
              success: true,
              action: "unchanged",
              documentId: existingDoc.id,
              title: existingDoc.title,
              message: `文档 "${title}" 内容未变化`,
            };
          }

          // 使用事务创建新版本
          document = await db.$transaction(async (tx) => {
            // 将当前版本标记为非当前
            await tx.document.update({
              where: { id: existingDoc.id },
              data: { isCurrent: false },
            });

            // 创建新版本
            return tx.document.create({
              data: {
                projectId,
                userId,
                title,
                content,
                contentHash: newContentHash,
                fileType: existingDoc.fileType ?? "md",
                status: "active",
                version: existingDoc.version + 1,
                isCurrent: true,
                parentId: existingDoc.id,
                metadata: {
                  source: "agent_tool",
                  reason: "content_updated",
                },
              },
            });
          });

          logger.info(
            { documentId: document.id, version: document.version, parentId: existingDoc.id },
            "Document version created"
          );

          return {
            success: true,
            action: "updated",
            documentId: document.id,
            title: document.title,
            version: document.version,
            message: `文档 "${title}" 已更新到版本 ${document.version}`,
          };
        } else {
          // 创建新文档（首版）
          document = await db.document.create({
            data: {
              projectId,
              userId,
              title,
              content,
              contentHash: newContentHash,
              fileType: "md", // Agent生成的文档默认为markdown
              status: "active",
              version: 1,
              isCurrent: true,
              parentId: null,
              metadata: {
                source: "agent_tool",
                reason: "initial_creation",
              },
            },
          });

          logger.info({ documentId: document.id }, "Document created");

          return {
            success: true,
            action: "created",
            documentId: document.id,
            title: document.title,
            version: document.version,
            message: `文档 "${title}" 已创建`,
          };
        }
      } catch (error) {
        logger.error(
          { err: error, projectId, title },
          "Failed to create or update document"
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : "创建或更新文档失败",
        };
      }
    },
  });
}

/**
 * 精确替换文档内容
 */
export function createSearchReplaceDocumentTool(context?: ToolContext) {
  return tool({
    description:
      "在文档中精确查找并替换指定的文本内容。适合局部修改，无需重新生成整个文档。",
    inputSchema: z.object({
      title: z
        .string()
        .nullable()
        .optional()
        .describe("文档标题（title或documentId必须提供一个）"),
      documentId: z
        .string()
        .nullable()
        .optional()
        .describe("文档ID（title或documentId必须提供一个）"),
      old_string: z
        .string()
        .describe("要查找的原始字符串（必须在文档中存在且唯一）"),
      new_string: z
        .string()
        .describe("替换后的新字符串"),
      replace_all: z
        .boolean()
        .optional()
        .default(false)
        .describe("是否替换所有匹配项（默认false，只替换第一个）"),
    }),
    execute: async ({ 
      title, 
      documentId, 
      old_string, 
      new_string, 
      replace_all 
    }: { 
      title?: string | null; 
      documentId?: string | null; 
      old_string: string; 
      new_string: string; 
      replace_all?: boolean 
    }) => {
      const projectId = context?.projectId;
      const userId = context?.userId;

      if (!projectId) {
        return {
          success: false,
          error: "缺少项目上下文（projectId）",
        };
      }

      if (!title && !documentId) {
        return {
          success: false,
          error: "必须提供文档标题（title）或文档ID（documentId）",
        };
      }

      try {
        logger.info(
          { projectId, title, documentId, oldStringLength: old_string.length },
          "Searching and replacing in document"
        );

        // 构建查询条件（只查找当前版本）
        const where: {
          projectId: string;
          status: string;
          isCurrent: boolean;
          id?: string;
          title?: string;
        } = {
          projectId,
          status: "active",
          isCurrent: true,
        };

        if (documentId) {
          where.id = documentId;
        } else if (title) {
          where.title = title;
        }

        const document = await db.document.findFirst({
          where,
        });

        if (!document) {
          return {
            success: false,
            error: `文档不存在: ${title ?? documentId ?? ""}`,
          };
        }

        // 验证权限
        if (userId && document.userId !== userId) {
          return {
            success: false,
            error: "无权访问此文档",
          };
        }

        // 检查 old_string 是否存在
        if (!document.content.includes(old_string)) {
          return {
            success: false,
            error: `未找到要替换的内容。请确保 old_string 与文档中的内容完全匹配（包括空格、换行等）。请先使用 read_document 查看当前文档内容。`,
          };
        }

        // 计算匹配次数
        const matches = document.content.split(old_string).length - 1;

        // 如果有多个匹配但未设置 replace_all，给出警告
        if (matches > 1 && !replace_all) {
          return {
            success: false,
            error: `找到 ${matches} 处匹配，但 replace_all=false。请设置 replace_all=true 来替换所有匹配，或者提供更具体的 old_string 来唯一定位要替换的内容。请先使用 read_document 查看当前文档内容。`,
          };
        }

        // 执行替换
        let newContent: string;
        let replacements: number;

        if (replace_all) {
          newContent = document.content.split(old_string).join(new_string);
          replacements = matches;
        } else {
          newContent = document.content.replace(old_string, new_string);
          replacements = 1;
        }

        // 计算新内容的哈希
        const newContentHash = calculateContentHash(newContent);

        // 检查内容是否实际发生了变化
        if (document.contentHash === newContentHash) {
          logger.info({ documentId: document.id }, "Content unchanged after replacement");
          return {
            success: true,
            action: "unchanged",
            documentId: document.id,
            title: document.title,
            replacements: 0,
            message: "替换后内容未变化",
          };
        }

        // 使用事务创建新版本
        const updatedDocument = await db.$transaction(async (tx) => {
          // 将当前版本标记为非当前
          await tx.document.update({
            where: { id: document.id },
            data: { isCurrent: false },
          });

          // 创建新版本
          return tx.document.create({
            data: {
              projectId: document.projectId,
              userId: document.userId,
              title: document.title,
              content: newContent,
              contentHash: newContentHash,
              fileType: document.fileType,
              fileUrl: document.fileUrl,
              fileSize: document.fileSize,
              status: "active",
              version: document.version + 1,
              isCurrent: true,
              parentId: document.id,
              metadata: {
                source: "agent_tool",
                reason: "search_replace",
                replacements,
              },
            },
          });
        });

        logger.info(
          { documentId: updatedDocument.id, version: updatedDocument.version, replacements },
          "Document version created via search-replace"
        );

        return {
          success: true,
          action: "updated",
          documentId: updatedDocument.id,
          title: updatedDocument.title,
          version: updatedDocument.version,
          replacements,
          message: `成功替换 ${replacements} 处内容，已创建版本 ${updatedDocument.version}`,
        };
      } catch (error) {
        logger.error(
          { err: error, projectId, title, documentId },
          "Failed to search and replace in document"
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : "替换文档内容失败",
        };
      }
    },
  });
}

/**
 * 创建所有文档工具
 */
export function createDocumentTools(context?: ToolContext) {
  return {
    list_documents: createListDocumentsTool(context),
    read_document: createReadDocumentTool(context),
    create_or_update_document: createUpdateDocumentTool(context),
    search_replace_document: createSearchReplaceDocumentTool(context),
  };
}

