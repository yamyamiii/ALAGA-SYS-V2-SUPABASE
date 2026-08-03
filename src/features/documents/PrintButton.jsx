import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { printProtectedDocument } from "@/features/documents/print";

export function PrintButton({ disabled = false }) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={printProtectedDocument}
    >
      <Printer /> Print
    </Button>
  );
}
