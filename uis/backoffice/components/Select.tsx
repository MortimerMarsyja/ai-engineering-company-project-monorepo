import type { SelectHTMLAttributes } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export default function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  ...selectProps
}: SelectProps<T>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[#221810]/80">{label}</span>
      <select
        {...selectProps}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-lg border border-admin-border bg-white px-3 py-2 text-sm text-[#221810] focus:border-brasa-red focus:outline-none focus:ring-2 focus:ring-brasa-red/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
