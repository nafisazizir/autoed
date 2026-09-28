import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type Option = { label: string; value: string; disabled?: boolean };

/** A form picker: an outline button showing the choice, opening a radio menu the width of the field. A real button, so it focuses, tabs and opens from the keyboard. */
export function Picker({ id, value, onChange, options, placeholder, className }: { id?: string; value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; className?: string }) {
  const selected = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button id={id} type="button" variant="outline" className={cn("w-full justify-between text-label-14", className)} />}>
        <span className={cn("truncate", !selected && "text-gray-900")}>{selected?.label ?? placeholder ?? value}</span>
        <IconChevronDown className="shrink-0 text-gray-900" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-(--anchor-width)">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as string)}>
          {options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value} disabled={o.disabled} closeOnClick>{o.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
