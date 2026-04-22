import { ChecklistTemplateForm } from "@/components/checklist-template-form"
import { BackLink } from "@/components/ui/back-link"

export default function NewChecklistTemplatePage() {
  return (
    <div className="space-y-6">
      <BackLink href="/checklists" label="Back to checklists" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New checklist template
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define a reusable checklist. Staff run a copy of it per shift,
          and completions are logged for compliance.
        </p>
      </div>
      <ChecklistTemplateForm />
    </div>
  )
}
