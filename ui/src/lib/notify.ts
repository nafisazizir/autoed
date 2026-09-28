import { toast } from "@/components/ui/toast";

export const notify = (title: string, description?: string) => toast.add({ title, description, type: "success" });
export const notifyError = (e: unknown) => toast.add({ title: e instanceof Error ? e.message : String(e), type: "error" });
