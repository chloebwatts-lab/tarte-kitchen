import { LabourUploadForm } from "@/components/labour-upload-form"
import { BackLink } from "@/components/ui/back-link"

export default function LabourUploadPage() {
  return (
    <div className="space-y-6">
      <BackLink href="/labour" label="Back to labour" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Upload payroll report
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste your bookkeeper&apos;s weekly payroll breakdown. One row per
          venue per week. Weeks run Wed–Tue.
        </p>
      </div>
      <LabourUploadForm />
    </div>
  )
}
