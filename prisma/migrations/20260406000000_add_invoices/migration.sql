-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PROCESSING', 'EXTRACTED', 'MATCHED', 'APPROVED', 'REJECTED', 'ERROR');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierId" TEXT,
    "venue" "Venue",
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "dueDate" DATE,
    "subtotal" DECIMAL(12,2),
    "gst" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "pdfUrl" TEXT,
    "pdfFilename" TEXT,
    "rawEmailSubject" TEXT,
    "rawEmailFrom" TEXT,
    "rawEmailDate" TIMESTAMP(3),
    "extractedData" JSONB,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "unitPrice" DECIMAL(12,4),
    "lineTotal" DECIMAL(12,2),
    "ingredientId" TEXT,
    "mappingId" TEXT,
    "matchConfidence" TEXT,
    "matchedName" TEXT,
    "currentPrice" DECIMAL(12,4),
    "priceChanged" BOOLEAN NOT NULL DEFAULT false,
    "priceApproved" BOOLEAN,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierItemMapping" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceDescription" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "invoiceUnit" TEXT,
    "conversionFactor" DECIMAL(12,6),
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierItemMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "lastScanAt" TIMESTAMP(3),
    "scanFrequency" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_gmailMessageId_key" ON "Invoice"("gmailMessageId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_supplierName_idx" ON "Invoice"("supplierName");
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");
CREATE INDEX "Invoice_venue_idx" ON "Invoice"("venue");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");
CREATE INDEX "InvoiceLineItem_ingredientId_idx" ON "InvoiceLineItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItemMapping_supplierId_invoiceDescription_key" ON "SupplierItemMapping"("supplierId", "invoiceDescription");
CREATE INDEX "SupplierItemMapping_ingredientId_idx" ON "SupplierItemMapping"("ingredientId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierItemMapping" ADD CONSTRAINT "SupplierItemMapping_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
