import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  MailPlus,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getRoleLabel, USER_ROLES } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/authContext";
import { AccountChangeDialog } from "@/features/user-management/AccountChangeDialog";
import { ACCOUNT_STATUSES } from "@/features/user-management/schemas";
import { UserDetailDialog } from "@/features/user-management/UserDetailDialog";
import { UserFormDialog } from "@/features/user-management/UserFormDialog";
import { userManagementService } from "@/services/userManagementService";

const PAGE_SIZE = 10;

function displayName(user) {
  return (
    [user.first_name, user.middle_name, user.last_name, user.suffix]
      .filter(Boolean)
      .join(" ") || "Unnamed user"
  );
}

function displayDate(value) {
  return value ? format(new Date(value), "MMM d, yyyy") : "Never";
}

function statusVariant(status) {
  if (status === "active") return "success";
  if (status === "suspended") return "destructive";
  if (status === "invited") return "warning";
  return "secondary";
}

export default function UserManagementPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState(null);
  const [change, setChange] = useState({ type: null, user: null });

  const query = useQuery({
    queryKey: ["managed-users", page, deferredSearch, role, status],
    queryFn: () =>
      userManagementService.listUsers({
        page,
        page_size: PAGE_SIZE,
        search: deferredSearch || null,
        role: role || null,
        account_status: status || null,
      }),
    placeholderData: keepPreviousData,
  });

  const users = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPageAnd(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  async function changed() {
    await queryClient.invalidateQueries({ queryKey: ["managed-users"] });
    if (detailUserId) {
      await queryClient.invalidateQueries({
        queryKey: ["managed-user", detailUserId],
      });
    }
  }

  async function resend(user) {
    try {
      await userManagementService.resendInvitation(user.id);
      toast.success("Invitation sent again");
      await changed();
    } catch (error) {
      toast.error("Invitation could not be sent", {
        description: error.message,
      });
    }
  }

  function actions(user) {
    const self = user.id === profile.id;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${displayName(user)}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setDetailUserId(user.id)}>
            <Eye /> View details
          </DropdownMenuItem>
          {user.account_status === "invited" ? (
            <DropdownMenuItem onSelect={() => resend(user)}>
              <MailPlus /> Resend invitation
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={self}
            onSelect={() => setChange({ type: "role", user })}
          >
            <RefreshCw /> Change role
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={self}
            onSelect={() => setChange({ type: "status", user })}
          >
            <ShieldAlert /> Change status
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Administration"
        title="User Management"
        description="Invite, provision, review, and safely manage trusted ALAGA-SYS accounts. Every privileged action is server-verified and audited."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <UserPlus /> Add or invite user
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={resetPageAnd(setSearch)}
                placeholder="Search name or email"
                className="pl-9"
                aria-label="Search users"
              />
            </div>
            <select
              value={role}
              onChange={resetPageAnd(setRole)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {Object.values(USER_ROLES).map((value) => (
                <option key={value} value={value}>
                  {getRoleLabel(value)}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={resetPageAnd(setStatus)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Filter by account status"
            >
              <option value="">All statuses</option>
              {ACCOUNT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {query.isLoading ? (
            <LoadingState
              title="Loading users"
              description="Retrieving sanitized account records…"
            />
          ) : query.isError ? (
            <ErrorState
              title="Users could not be loaded"
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : users.length === 0 ? (
            <EmptyState
              title="No users found"
              description="Adjust the filters or invite the first account that belongs in this view."
              actionLabel="Clear filters"
              onAction={() => {
                setSearch("");
                setRole("");
                setStatus("");
                setPage(1);
              }}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Name</th>
                      <th className="px-3 py-3 font-semibold">Email</th>
                      <th className="px-3 py-3 font-semibold">Role</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Last login</th>
                      <th className="px-3 py-3 font-semibold">Created</th>
                      <th className="w-12 px-3 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/35">
                        <td className="px-3 py-4 font-medium">
                          {displayName(user)}
                        </td>
                        <td className="px-3 py-4 text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="px-3 py-4">
                          <Badge variant="outline">
                            {getRoleLabel(user.role)}
                          </Badge>
                        </td>
                        <td className="px-3 py-4">
                          <Badge variant={statusVariant(user.account_status)}>
                            {user.account_status}
                          </Badge>
                        </td>
                        <td className="px-3 py-4 text-muted-foreground">
                          {displayDate(user.last_login_at)}
                        </td>
                        <td className="px-3 py-4 text-muted-foreground">
                          {displayDate(user.created_at)}
                        </td>
                        <td className="px-3 py-4">{actions(user)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {users.map((user) => (
                  <div key={user.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {displayName(user)}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                      {actions(user)}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="outline">{getRoleLabel(user.role)}</Badge>
                      <Badge variant={statusVariant(user.account_status)}>
                        {user.account_status}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Created {displayDate(user.created_at)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, total)} of {total} users
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                    disabled={page === 1}
                  >
                    <ChevronLeft /> Previous
                  </Button>
                  <span className="px-2 text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                    disabled={page >= totalPages}
                  >
                    Next <ChevronRight />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border bg-card p-4 text-xs leading-5 text-muted-foreground">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        Email and last-login values come from the trusted server response.
        Passwords, tokens, identities, and Auth metadata are never returned.
      </div>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={changed}
      />
      <UserDetailDialog
        userId={detailUserId}
        open={Boolean(detailUserId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDetailUserId(null);
        }}
        onChanged={changed}
        onRequestRole={(user) => setChange({ type: "role", user })}
        onRequestStatus={(user) => setChange({ type: "status", user })}
        currentUserId={profile.id}
      />
      <AccountChangeDialog
        type={change.type}
        user={change.user}
        open={Boolean(change.type && change.user)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setChange({ type: null, user: null });
        }}
        onSuccess={changed}
      />
    </div>
  );
}
