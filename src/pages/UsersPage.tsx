import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ShieldCheck, User2, Plus, X, Loader2 } from "lucide-react";
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

interface UserProfile {
  id: string;
  email: string;
  role: string;
  accountAccess: Array<{ id: string; name: string }>;
}

interface Account {
  id: string;
  name: string;
}

export default function UsersPage() {
  const { accountId } = useParams<{ accountId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userData } = useUser();
  const currentUser = userData?.user;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [grantDialogUserId, setGrantDialogUserId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, role")
        .order("email");
      if (profilesError) throw profilesError;

      // Fetch all accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from("accounts")
        .select("id, name")
        .order("name");
      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Fetch all user_account_access rows
      const { data: accessRows, error: accessError } = await supabase
        .from("user_account_access")
        .select("user_id, account_id");
      if (accessError) throw accessError;

      // Build user list with their access
      const accountMap = Object.fromEntries((accountsData || []).map((a) => [a.id, a.name]));
      const accessByUser: Record<string, Array<{ id: string; name: string }>> = {};
      for (const row of accessRows || []) {
        if (!accessByUser[row.user_id]) accessByUser[row.user_id] = [];
        if (accountMap[row.account_id]) {
          accessByUser[row.user_id].push({ id: row.account_id, name: accountMap[row.account_id] });
        }
      }

      const enriched: UserProfile[] = (profiles || []).map((p) => ({
        id: p.id,
        email: p.email,
        role: p.role ?? "user",
        accountAccess: accessByUser[p.id] ?? [],
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
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);
    setSavingUserId(null);
    if (error) {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      toast({ title: "Role updated" });
    }
  };

  const handleRevokeAccess = async (userId: string, accountId: string) => {
    const { error } = await supabase
      .from("user_account_access")
      .delete()
      .eq("user_id", userId)
      .eq("account_id", accountId);
    if (error) {
      toast({ title: "Failed to revoke access", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, accountAccess: u.accountAccess.filter((a) => a.id !== accountId) }
            : u
        )
      );
    }
  };

  const handleGrantAccess = async (userId: string, accountId: string) => {
    const { error } = await supabase
      .from("user_account_access")
      .insert({ user_id: userId, account_id: accountId });
    if (error) {
      toast({ title: "Failed to grant access", description: error.message, variant: "destructive" });
    } else {
      const account = accounts.find((a) => a.id === accountId);
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
                  <TableHead className="w-[280px]">Account / Email</TableHead>
                  <TableHead className="w-[160px]">Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="w-[80px]" />
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
                              <Badge
                                key={acc.id}
                                variant="outline"
                                className="gap-1 pr-1 text-xs"
                              >
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

                    {/* Empty actions col */}
                    <TableCell />
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
