-- Add ModelRunner as an image generation provider.
ALTER TYPE "ImageGenerationProvider" ADD VALUE IF NOT EXISTS 'MODELRUNNER';
