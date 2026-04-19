import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ShieldCheck, User2, Plus, X, Loader2, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface UserProfile {
  id: string;
  email: string;
  role: string;
  accountAccess: Array<{ id: string; name: string }>;
  viewAccess: Array<{ id: string; name: string }>;
}

interface Account {
  id: string;
  name: string;
}

interface View {
  id: string;
  name: string;
  account_id: string | null;
}

export default function UsersPage() {
  const { accountId } = useParams<{ accountId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userData } = useUser();
  const currentUser = userData?.user;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [views, setViews] = useState<View[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [grantDialogUserId, setGrantDialogUserId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profilesRes, accountsRes, accessRes, viewsRes, viewAccessRes] = await Promise.all([
        supabase.from("profiles").select("id, email, role").order("email"),
        supabase.from("accounts").select("id, name").order("name"),
        supabase.from("user_account_access").select("user_id, account_id"),
        supabase.from("views").select("id, name, account_id").not("account_id", "is", null).order("name"),
        supabase.from("user_view_access").select("user_id, view_id"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (accessRes.error) throw accessRes.error;
      if (viewsRes.error) throw viewsRes.error;
      if (viewAccessRes.error) throw viewAccessRes.error;

      setAccounts(accountsRes.data || []);

      // Deduplicate views by name (keep first occurrence per unique name)
      const seenNames = new Set<string>();
      const uniqueViews = (viewsRes.data || []).filter((v) => {
        if (seenNames.has(v.name)) return false;
        seenNames.add(v.name);
        return true;
      });
      setViews(uniqueViews);

      const accountMap = Object.fromEntries((accountsRes.data || []).map((a) => [a.id, a.name]));
      const viewMap = Object.fromEntries(uniqueViews.map((v) => [v.id, v.name]));

      const accessByUser: Record<string, Array<{ id: string; name: string }>> = {};
      for (const row of accessRes.data || []) {
        if (!accessByUser[row.user_id]) accessByUser[row.user_id] = [];
        if (accountMap[row.account_id]) {
          accessByUser[row.user_id].push({ id: row.account_id, name: accountMap[row.account_id] });
        }
      }

      const viewAccessByUser: Record<string, Array<{ id: string; name: string }>> = {};
      for (const row of viewAccessRes.data || []) {
        if (!viewAccessByUser[row.user_id]) viewAccessByUser[row.user_id] = [];
        if (viewMap[row.view_id]) {
          viewAccessByUser[row.user_id].push({ id: row.view_id, name: viewMap[row.view_id] });
        }
      }

      const enriched: UserProfile[] = (profilesRes.data || []).map((p) => ({
        id: p.id,
        email: p.email,
        role: p.role ?? "user",
        accountAccess: accessByUser[p.id] ?? [],
        viewAccess: viewAccessByUser[p.id] ?? [],
      }));

      setUsers(enriched);
    } catch (err) {
      console.error("[UsersPage]", err);
      toast({ title: "Error loading users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setSavingUserId(userId);
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    setSavingUserId(null);
    if (error) {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      toast({ title: "Role updated" });
    }
  };

  const handleRevokeAccess = async (userId: string, accId: string) => {
    const { error } = await supabase
      .from("user_account_access")
      .delete()
      .eq("user_id", userId)
      .eq("account_id", accId);
    if (error) {
      toast({ title: "Failed to revoke access", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, accountAccess: u.accountAccess.filter((a) => a.id !== accId) } : u
        )
      );
    }
  };

  const handleGrantAccess = async (userId: string, accId: string) => {
    const { error } = await supabase.from("user_account_access").insert({ user_id: userId, account_id: accId });
    if (error) {
      toast({ title: "Failed to grant access", description: error.message, variant: "destructive" });
    } else {
      const account = accounts.find((a) => a.id === accId);
      if (account) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, accountAccess: [...u.accountAccess, { id: account.id, name: account.name }] }
              : u
          )
        );
      }
      setGrantDialogUserId(null);
      toast({ title: "Access granted" });
    }
  };

  // Toggle a view on/off for a user
  const handleToggleView = async (userId: string, viewId: string, currentlyGranted: boolean) => {
    if (currentlyGranted) {
      const { error } = await supabase
        .from("user_view_access")
        .delete()
        .eq("user_id", userId)
        .eq("view_id", viewId);
      if (error) {
        toast({ title: "Failed to remove view", description: error.message, variant: "destructive" });
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, viewAccess: u.viewAccess.filter((v) => v.id !== viewId) }
            : u
        )
      );
    } else {
      const { error } = await supabase.from("user_view_access").insert({ user_id: userId, view_id: viewId });
      if (error) {
        toast({ title: "Failed to grant view", description: error.message, variant: "destructive" });
        return;
      }
      const view = views.find((v) => v.id === viewId);
      if (view) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, viewAccess: [...u.viewAccess, { id: view.id, name: view.name }] }
              : u
          )
        );
      }
    }
  };

  const grantDialogUser = users.find((u) => u.id === grantDialogUserId);
  const alreadyGrantedIds = new Set(grantDialogUser?.accountAccess.map((a) => a.id) ?? []);
  const availableToGrant = accounts.filter((a) => !alreadyGrantedIds.has(a.id));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(accountId ? `/?aid=${accountId}` : "/")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Users</h1>
            <p className="text-sm text-muted-foreground">Manage user roles and report access</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading users...
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[240px]">Account / Email</TableHead>
                  <TableHead className="w-[150px]">Role</TableHead>
                  <TableHead className="w-[200px]">Access</TableHead>
                  <TableHead>View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
                {users.map((user) => (
                  <TableRow key={user.id}>
                    {/* Email */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-primary uppercase">
                            {user.email[0]}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{user.email}</p>
                          {user.id === currentUser?.id && (
                            <p className="text-xs text-muted-foreground">You</p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Role */}
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(v) => handleRoleChange(user.id, v)}
                        disabled={savingUserId === user.id}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                              Admin
                            </div>
                          </SelectItem>
                          <SelectItem value="user">
                            <div className="flex items-center gap-2">
                              <User2 className="h-3.5 w-3.5 text-muted-foreground" />
                              User
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Access */}
                    <TableCell>
                      {user.role === "admin" ? (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Master (all accounts)
                        </Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {user.accountAccess.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">No access</span>
                          ) : (
                            user.accountAccess.map((acc) => (
                              <Badge key={acc.id} variant="outline" className="gap-1 pr-1 text-xs">
                                {acc.name}
                                <button
                                  onClick={() => handleRevokeAccess(user.id, acc.id)}
                                  className="ml-0.5 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))
                          )}
                          <button
                            onClick={() => setGrantDialogUserId(user.id)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </div>
                      )}
                    </TableCell>

                    {/* View — multi-select popover */}
                    <TableCell>
                      {user.role === "admin" ? (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Master
                        </Badge>
                      ) : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <div className="flex flex-wrap gap-1.5 items-center cursor-pointer min-h-[28px]">
                              {user.viewAccess.length === 0 ? (
                                <span className="text-xs text-muted-foreground italic hover:text-primary flex items-center gap-1">
                                  <Plus className="h-3.5 w-3.5" />
                                  Add view
                                </span>
                              ) : (
                                <>
                                  {user.viewAccess.map((v) => (
                                    <Badge key={v.id} variant="outline" className="text-xs">
                                      {v.name}
                                    </Badge>
                                  ))}
                                  <span className="text-xs text-muted-foreground hover:text-primary">
                                    <Plus className="h-3.5 w-3.5" />
                                  </span>
                                </>
                              )}
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-52 p-1" align="start">
                            <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                              Select views
                            </p>
                            {/* Master option */}
                            <button
                              className={cn(
                                "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors",
                                user.viewAccess.length === 0 && "font-medium"
                              )}
                              onClick={() => {
                                // Clear all views = Master access
                                Promise.all(
                                  user.viewAccess.map((v) =>
                                    supabase
                                      .from("user_view_access")
                                      .delete()
                                      .eq("user_id", user.id)
                                      .eq("view_id", v.id)
                                  )
                                ).then(() => {
                                  setUsers((prev) =>
                                    prev.map((u) =>
                                      u.id === user.id ? { ...u, viewAccess: [] } : u
                                    )
                                  );
                                });
                              }}
                            >
                              <span>Master (all views)</span>
                              {user.viewAccess.length === 0 && (
                                <Check className="h-3.5 w-3.5 text-primary" />
                              )}
                            </button>
                            <div className="my-1 border-t" />
                            {views.map((view) => {
                              const granted = user.viewAccess.some((v) => v.id === view.id);
                              return (
                                <button
                                  key={view.id}
                                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                                  onClick={() => handleToggleView(user.id, view.id, granted)}
                                >
                                  <span>{view.name}</span>
                                  {granted && <Check className="h-3.5 w-3.5 text-primary" />}
                                </button>
                              );
                            })}
                          </PopoverContent>
                        </Popover>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Grant access dialog */}
      <Dialog open={!!grantDialogUserId} onOpenChange={(o) => !o && setGrantDialogUserId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Grant Access</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Select an account to grant <span className="font-medium">{grantDialogUser?.email}</span> access to:
          </p>
          {availableToGrant.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">All accounts already granted.</p>
          ) : (
            <div className="space-y-1.5">
              {availableToGrant.map((acc) => (
                <Button
                  key={acc.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleGrantAccess(grantDialogUserId!, acc.id)}
                >
                  {acc.name}
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
