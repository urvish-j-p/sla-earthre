-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckOutcome" AS ENUM ('UP', 'DOWN', 'UNKNOWN');

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "status" "UploadStatus" NOT NULL,
    "error_message" TEXT,
    "window_start" TIMESTAMP(3),
    "window_end" TIMESTAMP(3),
    "rows_received" INTEGER NOT NULL DEFAULT 0,
    "rows_rejected" INTEGER NOT NULL DEFAULT 0,
    "checks_stored" INTEGER NOT NULL DEFAULT 0,
    "quality_report" JSONB,
    "processing_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" BIGSERIAL NOT NULL,
    "upload_id" UUID NOT NULL,
    "service_id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "outcome" "CheckOutcome" NOT NULL,
    "status_code" INTEGER,
    "latency_ms" DOUBLE PRECISION,
    "region" TEXT,
    "agents" TEXT[],
    "report_count" INTEGER NOT NULL,
    "flags" TEXT[],
    "sources" JSONB NOT NULL,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploads_file_hash_status_idx" ON "uploads"("file_hash", "status");

-- CreateIndex
CREATE INDEX "uploads_created_at_idx" ON "uploads"("created_at");

-- CreateIndex
CREATE INDEX "checks_upload_id_checked_at_idx" ON "checks"("upload_id", "checked_at");

-- CreateIndex
CREATE INDEX "checks_upload_id_outcome_idx" ON "checks"("upload_id", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "checks_upload_id_service_id_checked_at_key" ON "checks"("upload_id", "service_id", "checked_at");

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

