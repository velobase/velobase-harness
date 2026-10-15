/**
 * Register custom tool renderers
 *
 * This file should be imported once at app initialization
 * to register all custom tool renderers.
 */

import { registerToolRenderer } from "@/components/ai-chat/messages/blocks/tools/registry";
import { GenerateImageRenderer } from "@/components/ai-chat/messages/blocks/tools/generate-image-renderer";
import { GenerateVideoRenderer } from "@/components/ai-chat/messages/blocks/tools/generate-video-renderer";
import { EditImageRenderer } from "@/components/ai-chat/messages/blocks/tools/edit-image-renderer";
import { ListProjectImagesRenderer } from "@/components/ai-chat/messages/blocks/tools/list-project-images-renderer";
import { ListProjectVideosRenderer } from "@/components/ai-chat/messages/blocks/tools/list-project-videos-renderer";
import { ListDocumentsRenderer } from "@/components/ai-chat/messages/blocks/tools/list-documents-renderer";
import { ReadDocumentRenderer } from "@/components/ai-chat/messages/blocks/tools/read-document-renderer";

// Image tools
registerToolRenderer("generate_image", GenerateImageRenderer);
registerToolRenderer("generate_image_sequence", GenerateImageRenderer); // Reuse same renderer
registerToolRenderer("edit_image", EditImageRenderer);
registerToolRenderer("list_project_images", ListProjectImagesRenderer);

// Video tools
registerToolRenderer("generate_video", GenerateVideoRenderer);
registerToolRenderer("list_project_videos", ListProjectVideosRenderer);

// Document tools
registerToolRenderer("list_documents", ListDocumentsRenderer);
registerToolRenderer("read_document", ReadDocumentRenderer);
