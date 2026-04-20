import { LabourUploadForm } from "@/components/labour-upload-form"

export default function LabourUploadPage() {
  return (
    <div className="space-y-6">
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
