import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/** A spinner line; `page` drops it to where a page title would start. */
export function Loading({ label = "Loading", page }: { label?: string; page?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 text-label-13 text-gray-900", page ? "pt-6 lg:pt-(--rail-content-top)" : "py-10")}>
      <Spinner /> {label}
    </div>
  );
}
