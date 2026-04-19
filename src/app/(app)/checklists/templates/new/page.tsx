import { ChecklistTemplateForm } from "@/components/checklist-template-form"

export default function NewChecklistTemplatePage() {
  return (
    <div className="space-y-6">
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
