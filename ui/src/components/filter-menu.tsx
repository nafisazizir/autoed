import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type FilterOption = { label: string; value: string };

/** A list filter: an outline button naming the current choice, opening a radio menu. */
export function FilterMenu({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: FilterOption[] }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button shape="rounded" size="sm" variant="secondary" aria-label={`${label}: ${current?.label}`} />}>
        {current?.label}
        <IconChevronDown data-icon="inline-end" className="text-gray-900" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as string)}>
            {options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value} closeOnClick>{o.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
