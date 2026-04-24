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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  FileText,
  Pencil,
  Trash2,
  Eye,
  Calendar,
} from "lucide-react";
import { useUser } from "@/lib/auth";
import { useUserAccount } from "@/hooks/useUserAccount";
import {
  useCustomReports,
  useCreateCustomReport,
  useDeleteCustomReport,
  useUpdateCustomReport,
} from "@/hooks/useCustomReports";
import { supabase } from "@/integrations/supabase/client";

interface AvailableView {
  id: string;
  name: string;
}

export default function CustomReportsPage() {
  const { accountId: urlAccountId } = useParams<{ accountId?: string }>();
  const { account: resolvedAccount } = useUserAccount();
  const accountId = urlAccountId ?? resolvedAccount?.id ?? null;
  const navigate = useNavigate();
  const { data: userData } = useUser();
  const user = userData?.user || null;

  const { data: reports = [], isLoading } = useCustomReports(accountId ?? undefined);
  const createReport = useCreateCustomReport();
  const deleteReport = useDeleteCustomReport();
  const updateReport = useUpdateCustomReport();

  // Views
  const [availableViews, setAvailableViews] = useState<AvailableView[]>([]);
  const [selectedViewFilter, setSelectedViewFilter] = useState<string>("all");

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

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newViewId, setNewViewId] = useState<string>("none");

  // Edit dialog
  const [editReport, setEditReport] = useState<{
    id: string;
    name: string;
    description: string;
    view_id: string | null;
  } | null>(null);

  const handleCreate = async () => {
    if (!accountId || !user || !newName.trim()) return;
    const result = await createReport.mutateAsync({
      account_id: accountId,
      created_by: user.id,
      name: newName.trim(),
      description: newDescription.trim(),
      view_id: newViewId === "none" ? null : newViewId,
    });
    setShowCreateDialog(false);
    setNewName("");
    setNewDescription("");
    setNewViewId("none");
    // Navigate to the new report
    navigate(`/tools/reports/${accountId}/${result.id}`);
  };

  const handleDelete = async (reportId: string, reportName: string) => {
    if (!accountId) return;
    if (!confirm(`Delete report "${reportName}"? This cannot be undone.`)) return;
    await deleteReport.mutateAsync({ reportId, accountId });
  };

  const handleEditSave = async () => {
    if (!editReport) return;
    await updateReport.mutateAsync({
      id: editReport.id,
      name: editReport.name.trim(),
      description: editReport.description.trim(),
      view_id: editReport.view_id,
    });
    setEditReport(null);
  };

  // Filter reports by selected view
  const filteredReports =
    selectedViewFilter === "all"
      ? reports
      : selectedViewFilter === "none"
        ? reports.filter((r) => !r.view_id)
        : reports.filter((r) => r.view_id === selectedViewFilter);

  const getViewName = (viewId: string | null) => {
    if (!viewId) return "—";
    return availableViews.find((v) => v.id === viewId)?.name || "Unknown";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Custom Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage custom reports with tables, charts, and commentary.
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Report
          </Button>
        </div>

        {/* View filter */}
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground shrink-0">Filter by View:</Label>
          <Select value={selectedViewFilter} onValueChange={setSelectedViewFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All views</SelectItem>
              <SelectItem value="none">No view (general)</SelectItem>
              {availableViews.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Reports list */}
        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              {filteredReports.length} report{filteredReports.length !== 1 ? "s" : ""}
              {selectedViewFilter !== "all" && " (filtered)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Loading reports...
              </p>
            ) : filteredReports.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {reports.length === 0
                    ? "No reports yet. Create your first report to get started."
                    : "No reports match the selected view filter."}
                </p>
                {reports.length === 0 && (
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    variant="outline"
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New Report
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>View</TableHead>
                    <TableHead>Blocks</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow
                      key={report.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate(`/tools/reports/${accountId}/${report.id}`)
                      }
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{report.name}</p>
                          {report.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {report.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {report.view_id ? (
                          <Badge variant="secondary" className="text-xs">
                            {getViewName(report.view_id)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {report.blocks.length} block
                        {report.blocks.length !== 1 ? "s" : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(report.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              navigate(
                                `/tools/reports/${accountId}/${report.id}`
                              )
                            }
                            title="View report"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setEditReport({
                                id: report.id,
                                name: report.name,
                                description: report.description,
                                view_id: report.view_id,
                              })
                            }
                            title="Edit report"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(report.id, report.name)}
                            title="Delete report"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Report Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>New Report</DialogTitle>
            <DialogDescription>
              Create a custom report. You can link it to a specific view to use that view's data filters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="report-name">Report Name</Label>
              <Input
                id="report-name"
                placeholder="e.g. Brady Report Q1 2026"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-desc">Description (optional)</Label>
              <Textarea
                id="report-desc"
                placeholder="Brief description of this report..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Linked View</Label>
              <Select value={newViewId} onValueChange={setNewViewId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No view (general)</SelectItem>
                  {availableViews.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Linking to a view applies that view's data filters to the report.
              </p>
            </div>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full"
            disabled={!newName.trim() || createReport.isPending}
          >
            {createReport.isPending ? "Creating..." : "Create Report"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Report Dialog */}
      <Dialog open={!!editReport} onOpenChange={(open) => !open && setEditReport(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Report</DialogTitle>
            <DialogDescription>
              Update report details.
            </DialogDescription>
          </DialogHeader>
          {editReport && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Report Name</Label>
                <Input
                  value={editReport.name}
                  onChange={(e) =>
                    setEditReport({ ...editReport, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editReport.description}
                  onChange={(e) =>
                    setEditReport({ ...editReport, description: e.target.value })
                  }
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Linked View</Label>
                <Select
                  value={editReport.view_id ?? "none"}
                  onValueChange={(v) =>
                    setEditReport({
                      ...editReport,
                      view_id: v === "none" ? null : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No view (general)</SelectItem>
                    {availableViews.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleEditSave}
                className="w-full"
                disabled={!editReport.name.trim() || updateReport.isPending}
              >
                {updateReport.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
