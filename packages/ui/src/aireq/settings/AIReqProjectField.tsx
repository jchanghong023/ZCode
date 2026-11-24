import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";

export function AIReqProjectField({
  id,
  label,
  value,
  placeholder,
  help,
  error,
  readOnly,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  help?: string;
  error?: string;
  readOnly: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const description = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        <span aria-hidden="true" className="text-destructive">
          {" "}
          *
        </span>
      </Label>
      {/* 保存时保持输入焦点及已填内容。 */}
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={description || undefined}
        required
        readOnly={readOnly}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {help && (
        <p id={`${id}-help`} className="text-ui-sm leading-5 text-remote-foreground-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-ui-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
