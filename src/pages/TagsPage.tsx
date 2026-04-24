import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, Tag as TagIcon } from "lucide-react";
import { useUser } from "@/lib/auth";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useTags, useDeleteTag } from "@/hooks/useTags";
import { TagFormModal } from "@/components/tags/TagFormModal";
import { supabase } from "@/integrations/supabase/client";
import type { Tag } from "@/types/tags";

export default function TagsPage() {
  const { accountId: urlAccountId } = useParams<{ accountId?: string }>();
  const { account: resolvedAccount } = useUserAccount();
  const accountId = urlAccountId ?? resolvedAccount?.id ?? null;
  const navigate = useNavigate();
  const { data: userData } = useUser();
  const user = userData?.user || null;

  const { data: tags = [], isLoading } = useTags(accountId ?? undefined);
  const deleteTag = useDeleteTag();

  // Fetch available views for the account (slide_view mode)
  const [availableViews, setAvailableViews] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!accountId) return;
    const load = async () => {
      const { data } = await supabase
        .from("views")
        .select("id, name")
        .eq("mode", "slide_view")
        .eq("account_id", accountId)
        .order("name");
      setAvailableViews(data || []);
    };
    load();
  }, [accountId]);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const handleCreateTag = () => {
    setEditingTag(null);
    setShowFormModal(true);
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag);
    setShowFormModal(true);
  };

  const handleDeleteTag = async (tag: Tag) => {
    if (!accountId) return;
    if (!confirm(`Delete tag "${tag.name}"? This cannot be undone.`)) return;
    await deleteTag.mutateAsync({ tagId: tag.id, accountId });
  };

  const handleFormSuccess = () => {
    setShowFormModal(false);
    setEditingTag(null);
  };

  const channelLabel = (ch: string) => {
    switch (ch) {
      case 'metasearch': return 'Metasearch';
      case 'sem': return 'SEM';
      case 'social': return 'Social';
      default: return ch;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TagIcon className="h-6 w-6" />
              Tags
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create custom tags to categorize and segment your data using text-matching rules.
            </p>
          </div>
          <Button onClick={handleCreateTag} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Tag
          </Button>
        </div>

        {/* Tags list */}
        <Card>
          <CardHeader>
            <CardTitle>All Tags</CardTitle>
            <CardDescription>
              Tags are rule-based dimensions that classify data rows. They appear as filter pills and breakdown options in Data Studio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading tags...</p>
            ) : tags.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <TagIcon className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No tags yet. Create your first tag to start categorizing your data.</p>
                <Button onClick={handleCreateTag} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Tag
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>View</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Values</TableHead>
                    <TableHead>Rules</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tags.map((tag) => {
                    const totalRules = tag.tag_values.reduce((sum, tv) => sum + tv.rules.length, 0);
                    return (
                      <TableRow key={tag.id}>
                        <TableCell className="font-medium">{tag.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {tag.view_id
                            ? availableViews.find((v) => v.id === tag.view_id)?.name || "Unknown"
                            : "All views"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {tag.channels.map((ch) => (
                              <Badge key={ch} variant="secondary" className="text-xs capitalize">
                                {channelLabel(ch)}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {tag.tag_values.map((tv) => (
                              <Badge key={tv.id} variant="outline" className="text-xs">
                                {tv.label}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {totalRules} rule{totalRules !== 1 ? 's' : ''}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditTag(tag)}
                              title="Edit tag"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTag(tag)}
                              title="Delete tag"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Modal */}
      {accountId && user && (
        <TagFormModal
          open={showFormModal}
          onOpenChange={setShowFormModal}
          onSuccess={handleFormSuccess}
          editingTag={editingTag}
          accountId={accountId}
          userId={user.id}
          availableViews={availableViews}
        />
      )}
    </div>
  );
}
