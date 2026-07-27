import { Archive, Pencil, Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FaqDialog } from "@/features/assistance/AssistanceDialogs";
import { FAQ_CATEGORIES, optionLabel } from "@/features/assistance/constants";
import { useAssistanceMutation, useFaqs } from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { PERMISSIONS } from "@/features/auth/permissions";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { assistanceService } from "@/services/assistanceService";

export default function FaqPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.MANAGE_FAQ);
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    include_archived: false,
    page: 1,
    page_size: 20,
  });
  const query = useFaqs({
    ...filters,
    search: useDeferredValue(filters.search),
  });
  const save = useAssistanceMutation(assistanceService.saveFaq);
  const archive = useAssistanceMutation(({ id, version }) =>
    assistanceService.archiveFaq(id, version),
  );
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const edit = (record = null) => {
    setEditing(record);
    setOpen(true);
  };
  const archiveItem = async (item) => {
    try {
      await archive.mutateAsync({ id: item.id, version: item.version });
      toast.success("FAQ archived");
    } catch (error) {
      toast.error("FAQ could not be archived", { description: error.message });
    }
  };
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Self-service information"
        title="Frequently asked questions"
        description="Search general guidance about ALAGA-SYS and barangay health center workflows."
        actions={
          manage ? (
            <Button onClick={() => edit()}>
              <Plus />
              Add FAQ
            </Button>
          ) : null
        }
      />
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Search FAQs"
              className="pl-9"
              value={filters.search}
              placeholder="Search questions"
              onChange={(e) =>
                setFilters((v) => ({ ...v, search: e.target.value, page: 1 }))
              }
            />
          </div>
          <select
            aria-label="FAQ category"
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            value={filters.category}
            onChange={(e) =>
              setFilters((v) => ({ ...v, category: e.target.value, page: 1 }))
            }
          >
            <option value="">All categories</option>
            {FAQ_CATEGORIES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {manage ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.include_archived}
                onChange={(e) =>
                  setFilters((v) => ({
                    ...v,
                    include_archived: e.target.checked,
                    page: 1,
                  }))
                }
              />
              Include archived
            </label>
          ) : null}
        </CardContent>
        {query.isLoading ? (
          <LoadingState title="Loading FAQs" />
        ) : query.isError ? (
          <ErrorState
            title="FAQs unavailable"
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No FAQs found"
            description="Try another search or category."
          />
        ) : (
          <div className="divide-y">
            {query.data.items.map((item) => (
              <details key={item.id} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex items-center justify-between gap-3">
                    <span>{item.question}</span>
                    <Badge variant="secondary">
                      {optionLabel(FAQ_CATEGORIES, item.category)}
                    </Badge>
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {item.answer}
                </p>
                {manage && !item.archived_at ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => edit(item)}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => archiveItem(item)}
                    >
                      <Archive />
                      Archive
                    </Button>
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        )}
        <RegistryPagination
          page={filters.page}
          pageSize={filters.page_size}
          total={query.data?.total ?? 0}
          onChange={(change) => setFilters((v) => ({ ...v, ...change }))}
        />
      </Card>
      <FaqDialog
        open={open}
        onOpenChange={setOpen}
        record={editing}
        mutation={save}
      />
    </div>
  );
}
