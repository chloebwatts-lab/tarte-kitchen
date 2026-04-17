import { mkdir, writeFile } from "fs/promises"
import path from "path"

const INVOICE_DIR = path.join(process.cwd(), "data", "invoices")

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function saveInvoicePdf(
  supplierName: string,
  data: Buffer,
  messageId: string
): Promise<string> {
  const slug = slugify(supplierName)
  const date = new Date().toISOString().split("T")[0]
  const dir = path.join(INVOICE_DIR, slug)

  await mkdir(dir, { recursive: true })

  const filename = `${date}_${messageId}.pdf`
  const filePath = path.join(dir, filename)

  await writeFile(filePath, data)

  // Return relative path from project root
  return path.relative(process.cwd(), filePath)
}
