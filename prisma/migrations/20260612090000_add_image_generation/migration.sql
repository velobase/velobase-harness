-- CreateEnum
CREATE TYPE "ImageGenerationProvider" AS ENUM ('WAVESPEED');

-- CreateEnum
CREATE TYPE "ImageGenerationOperation" AS ENUM ('TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE', 'EDIT_IMAGE');

-- CreateEnum
CREATE TYPE "ImageGenerationTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMED_OUT');

-- CreateTable
CREATE TABLE "image_generation_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "provider" "ImageGenerationProvider" NOT NULL,
    "provider_task_id" TEXT,
    "provider_task_url" TEXT,
    "model" TEXT NOT NULL,
    "operation" "ImageGenerationOperation" NOT NULL,
    "status" "ImageGenerationTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "prompt" TEXT NOT NULL,
    "negative_prompt" TEXT,
    "request" JSONB NOT NULL DEFAULT '{}',
    "provider_options" JSONB,
    "provider_raw" JSONB,
    "error_message" TEXT,
    "idempotency_key" TEXT,
    "cost_usd" DOUBLE PRECISION,
    "metadata" JSONB,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generation_assets" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "image_asset_id" TEXT,
    "provider" "ImageGenerationProvider" NOT NULL,
    "provider_task_id" TEXT,
    "model" TEXT NOT NULL,
    "status" "ImageGenerationTaskStatus" NOT NULL,
    "prompt" TEXT NOT NULL,
    "source_url" TEXT,
    "public_url" TEXT,
    "storage_key" TEXT,
    "content_type" TEXT,
    "byte_length" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "provider_raw" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generation_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "image_generation_tasks_idempotency_key_key" ON "image_generation_tasks"("idempotency_key");

-- CreateIndex
CREATE INDEX "image_generation_tasks_user_id_status_created_at_idx" ON "image_generation_tasks"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "image_generation_tasks_project_id_created_at_idx" ON "image_generation_tasks"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "image_generation_tasks_provider_provider_task_id_idx" ON "image_generation_tasks"("provider", "provider_task_id");

-- CreateIndex
CREATE INDEX "image_generation_tasks_status_queued_at_idx" ON "image_generation_tasks"("status", "queued_at");

-- CreateIndex
CREATE UNIQUE INDEX "image_generation_assets_image_asset_id_key" ON "image_generation_assets"("image_asset_id");

-- CreateIndex
CREATE INDEX "image_generation_assets_task_id_idx" ON "image_generation_assets"("task_id");

-- CreateIndex
CREATE INDEX "image_generation_assets_user_id_created_at_idx" ON "image_generation_assets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "image_generation_assets_project_id_created_at_idx" ON "image_generation_assets"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "image_generation_assets_provider_provider_task_id_idx" ON "image_generation_assets"("provider", "provider_task_id");

-- AddForeignKey
ALTER TABLE "image_generation_tasks" ADD CONSTRAINT "image_generation_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_generation_tasks" ADD CONSTRAINT "image_generation_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_generation_assets" ADD CONSTRAINT "image_generation_assets_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "image_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_generation_assets" ADD CONSTRAINT "image_generation_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_generation_assets" ADD CONSTRAINT "image_generation_assets_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "image_generation_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_generation_assets" ADD CONSTRAINT "image_generation_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
