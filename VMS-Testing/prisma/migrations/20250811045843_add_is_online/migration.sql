-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "floor" TEXT,
    "input" TEXT NOT NULL,
    "continuous" BOOLEAN NOT NULL DEFAULT false,
    "inputConfig" JSONB,
    "liveConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recordInput" TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "isOnline" BOOLEAN DEFAULT true,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cameras_path_key" ON "cameras"("path");
