import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { ArrowLeft, ArrowRight, Search, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingLink?: {
    id: string;
    slug: string;
    report_ids: string[];
    dimension_filters?: Record<string, Record<string, string[]>>;
  } | null;
  accountId?: string;
}

interface Report {
  id: string;
  name: string;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
}

type DimensionFilters = Record<string, Record<string, string[]>>;

export const CreateShareLinkModal = ({
  open,
  onOpenChange,
  onSuccess,
  editingLink,
  accountId
}: CreateShareLinkModalProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { data: userResult } = useUser();
  const user = userResult?.user;

  // Step 2 state
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [reportDimensions, setReportDimensions] = useState<Record<string, Dimension[]>>({});
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [selectedDimensionId, setSelectedDimensionId] = useState<Record<string, string>>({});
  const [dimensionFilters, setDimensionFilters] = useState<DimensionFilters>({});
  const [loadingDimensions, setLoadingDimensions] = useState(false);
  const [loadingValues, setLoadingValues] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      loadReportsAndAutoSelect();
      if (editingLink) {
        setSlug(editingLink.slug);
        setPassword("");
        setDimensionFilters(editingLink.dimension_filters || {});
      } else {
        setSlug("");
        setPassword("");
        setDimensionFilters({});
      }
    }
  }, [open, editingLink, accountId]);

  // Load dimensions when entering step 2 or changing active report
  useEffect(() => {
    if (step === 2 && activeReportId) {
      loadDimensionsForReport(activeReportId);
    }
  }, [step, activeReportId]);

  // Load values when dimension is selected
  useEffect(() => {
    if (step === 2 && activeReportId && selectedDimensionId[activeReportId]) {
      loadValuesForDimension(activeReportId, selectedDimensionId[activeReportId]);
    }
  }, [step, activeReportId, selectedDimensionId]);

  const loadReportsAndAutoSelect = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const isMaster = profile?.email === "contact@gosgconsulting.com";

    let allReports: Report[] = [];

    if (isMaster) {
      let query = supabase
        .from("reports")
        .select("id, name");

      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      const { data, error } = await query.order("name");

      if (error) {
        console.error("Error loading reports:", error);
        return;
      }

      allReports = data || [];
    } else {
      let query = supabase
        .from("reports")
        .select("id, name")
        .eq("user_id", user.id);

      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      const { data: ownReports, error: ownError } = await query.order("name");

      if (ownError) {
        console.error("Error loading own reports:", ownError);
        return;
      }

      allReports = ownReports || [];
    }

    setReports(allReports);
    const allReportIds = allReports.map(r => r.id);
    setSelectedReports(allReportIds);
    
    if (allReports.length > 0) {
      setActiveReportId(allReports[0].id);
    }
  };

  const loadDimensionsForReport = async (reportId: string) => {
    if (reportDimensions[reportId]) return; // Already loaded
    
    setLoadingDimensions(true);
    try {
      const { data, error } = await supabase
        .from("dimensions")
        .select("id, name, type")
        .eq("report_id", reportId)
        .eq("type", "text")
        .order("name");

      if (error) throw error;
      
      setReportDimensions(prev => ({ ...prev, [reportId]: data || [] }));
      
      // Auto-select first dimension if not already selected
      if (data && data.length > 0 && !selectedDimensionId[reportId]) {
        setSelectedDimensionId(prev => ({ ...prev, [reportId]: data[0].id }));
      }
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setLoadingDimensions(false);
    }
  };

  const loadValuesForDimension = async (reportId: string, dimensionId: string) => {
    const cacheKey = `${reportId}_${dimensionId}`;
    if (dimensionValues[cacheKey]) return; // Already loaded
    
    setLoadingValues(true);
    try {
      // Get dimension name first
      const dimension = reportDimensions[reportId]?.find(d => d.id === dimensionId);
      if (!dimension) return;

      // Get data source for this report
      const { data: dataSource } = await supabase
        .from("data_sources")
        .select("id")
        .eq("report_id", reportId)
        .maybeSingle();

      if (!dataSource) return;

      // Extract unique values from dimension_data
      const { data: dimensionData, error } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("data_source_id", dataSource.id)
        .limit(5000);

      if (error) throw error;

      const uniqueValues = new Set<string>();
      dimensionData?.forEach(row => {
        const values = row.dimension_values as Record<string, any>;
        const value = values[dimension.name];
        if (value && typeof value === 'string' && value.trim()) {
          uniqueValues.add(value.trim());
        }
      });

      setDimensionValues(prev => ({ 
        ...prev, 
        [cacheKey]: Array.from(uniqueValues).sort() 
      }));
    } catch (error) {
      console.error("Error loading dimension values:", error);
    } finally {
      setLoadingValues(false);
    }
  };

  const validateSlug = (value: string) => {
    return /^[a-z0-9-]*$/.test(value);
  };

  const handleSlugChange = (value: string) => {
    if (validateSlug(value)) {
      setSlug(value);
    }
  };

  const handleValueToggle = (value: string) => {
    if (!activeReportId) return;
    const dimId = selectedDimensionId[activeReportId];
    if (!dimId) return;

    setDimensionFilters(prev => {
      const reportFilters = prev[activeReportId] || {};
      const currentValues = reportFilters[dimId] || [];
      
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];

      return {
        ...prev,
        [activeReportId]: {
          ...reportFilters,
          [dimId]: newValues
        }
      };
    });
  };

  const handleSelectAll = () => {
    if (!activeReportId) return;
    const dimId = selectedDimensionId[activeReportId];
    if (!dimId) return;
    
    const cacheKey = `${activeReportId}_${dimId}`;
    const allValues = dimensionValues[cacheKey] || [];

    setDimensionFilters(prev => ({
      ...prev,
      [activeReportId]: {
        ...(prev[activeReportId] || {}),
        [dimId]: [...allValues]
      }
    }));
  };

  const handleDeselectAll = () => {
    if (!activeReportId) return;
    const dimId = selectedDimensionId[activeReportId];
    if (!dimId) return;

    setDimensionFilters(prev => ({
      ...prev,
      [activeReportId]: {
        ...(prev[activeReportId] || {}),
        [dimId]: []
      }
    }));
  };

  const getSelectedValuesForReport = (reportId: string) => {
    const dimId = selectedDimensionId[reportId];
    if (!dimId) return [];
    return dimensionFilters[reportId]?.[dimId] || [];
  };

  const getFilterCountForReport = (reportId: string) => {
    const filters = dimensionFilters[reportId];
    if (!filters) return 0;
    return Object.values(filters).reduce((sum, values) => sum + values.length, 0);
  };

  const currentValues = useMemo(() => {
    if (!activeReportId) return [];
    const dimId = selectedDimensionId[activeReportId];
    if (!dimId) return [];
    const cacheKey = `${activeReportId}_${dimId}`;
    return dimensionValues[cacheKey] || [];
  }, [activeReportId, selectedDimensionId, dimensionValues]);

  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) return currentValues;
    return currentValues.filter(v => 
      v.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentValues, searchQuery]);

  const currentSelectedValues = useMemo(() => {
    if (!activeReportId) return [];
    return getSelectedValuesForReport(activeReportId);
  }, [activeReportId, dimensionFilters, selectedDimensionId]);

  const handleStep1Validate = () => {
    if (!slug.trim()) {
      toast({
        title: "Slug required",
        description: "Please enter a slug for the share link",
        variant: "destructive",
      });
      return false;
    }

    if (slug.length < 3) {
      toast({
        title: "Slug too short",
        description: "Slug must be at least 3 characters long",
        variant: "destructive",
      });
      return false;
    }

    if (!editingLink && !password) {
      toast({
        title: "Password required",
        description: "Please enter a password",
        variant: "destructive",
      });
      return false;
    }

    if (password && password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return false;
    }

    if (selectedReports.length === 0) {
      toast({
        title: "No reports available",
        description: "No reports found for this account.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleNextStep = () => {
    if (handleStep1Validate()) {
      setStep(2);
      setSearchQuery("");
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    if (!user) return;

    const passwordHash = btoa(password || editingLink?.slug || "");

    if (editingLink) {
      const updateData: any = {
        report_ids: selectedReports,
        dimension_filters: dimensionFilters,
      };
      
      if (password) {
        updateData.password_hash = passwordHash;
      }

      const { error } = await supabase
        .from("share_links")
        .update(updateData)
        .eq("id", editingLink.id);

      setLoading(false);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update share link",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Share link updated",
        description: `/${slug} has been updated`,
      });
    } else {
      const { error } = await supabase
        .from("share_links")
        .insert({
          slug: slug.toLowerCase().trim(),
          password_hash: passwordHash,
          report_ids: selectedReports,
          created_by: user.id,
          account_id: accountId,
          dimension_filters: dimensionFilters,
        });

      setLoading(false);

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Slug already exists",
            description: "This slug is already in use. Please choose another one.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to create share link",
            variant: "destructive",
          });
        }
        return;
      }

      toast({
        title: "Share link created",
        description: `Access your reports at /${slug}`,
      });
    }

    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 2 && <Sparkles className="h-5 w-5 text-primary" />}
            {step === 1 
              ? (editingLink ? "Edit Share Link" : "Create Share Link")
              : "Data Source"
            }
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? (editingLink 
                  ? "Update the password for this share link."
                  : "Create a password-protected link to share all reports from this account publicly"
                )
              : 'Select dimension values to filter data for each report. Only selected values will be visible in the shared link.'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="slug"
                  placeholder="roomstay"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  disabled={!!editingLink}
                  className="flex-1 focus-visible:ring-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers, and hyphens (min. 3 characters)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password {editingLink && "(leave empty to keep current)"}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 6 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label>Reports to Share</Label>
              <div className="rounded-md border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground mb-2">
                  All reports from this account will be shared automatically:
                </p>
                <ul className="text-sm space-y-1">
                  {reports.length > 0 ? (
                    reports.map((report) => (
                      <li key={report.id} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                        {report.name}
                      </li>
                    ))
                  ) : (
                    <li className="text-muted-foreground">No reports available for this account</li>
                  )}
                </ul>
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                  💡 This includes the "All Reports" view
                </p>
              </div>
            </div>

            <Button 
              onClick={handleNextStep} 
              className="w-full"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-1 gap-4 min-h-0">
              {/* Left sidebar - Report tabs */}
              <div className="w-48 flex-shrink-0">
                <div className="space-y-1">
                  {reports.map((report) => {
                    const filterCount = getFilterCountForReport(report.id);
                    return (
                      <button
                        key={report.id}
                        onClick={() => {
                          setActiveReportId(report.id);
                          setSearchQuery("");
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
                          activeReportId === report.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted text-foreground"
                        )}
                      >
                        <span className="truncate">{report.name}</span>
                        {filterCount > 0 && (
                          <span className={cn(
                            "ml-2 px-1.5 py-0.5 text-xs rounded-full",
                            activeReportId === report.id
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-primary/10 text-primary"
                          )}>
                            {filterCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right content - Dimension filter */}
              <div className="flex-1 flex flex-col gap-4 min-h-0">
                {/* Dimension selector */}
                <div className="space-y-2">
                  <Label>Dimension</Label>
                  <Select
                    value={activeReportId ? selectedDimensionId[activeReportId] || "" : ""}
                    onValueChange={(value) => {
                      if (activeReportId) {
                        setSelectedDimensionId(prev => ({ ...prev, [activeReportId]: value }));
                        setSearchQuery("");
                      }
                    }}
                    disabled={loadingDimensions}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={loadingDimensions ? "Loading..." : "Select dimension"} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeReportId && reportDimensions[activeReportId]?.map((dim) => (
                        <SelectItem key={dim.id} value={dim.id}>
                          {dim.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search values..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Select/Deselect All */}
                {filteredValues.length > 0 && !loadingValues && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      className="flex-1"
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeselectAll}
                      className="flex-1"
                    >
                      Deselect All
                    </Button>
                  </div>
                )}

                {/* Values list */}
                <ScrollArea className="flex-1 border rounded-md min-h-[300px]">
                  <div className="p-2 space-y-1">
                    {loadingValues ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mb-2" />
                        <p className="text-sm">Loading dimension values...</p>
                      </div>
                    ) : filteredValues.length > 0 ? (
                      filteredValues.map((value) => (
                        <div
                          key={value}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                            currentSelectedValues.includes(value)
                              ? "bg-primary/10"
                              : "hover:bg-muted/50"
                          )}
                          onClick={() => handleValueToggle(value)}
                        >
                          <Checkbox
                            checked={currentSelectedValues.includes(value)}
                            onCheckedChange={() => handleValueToggle(value)}
                          />
                          <span className="text-sm">{value}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        {activeReportId && selectedDimensionId[activeReportId] 
                          ? "No values found for this dimension."
                          : "Select a dimension to view values."
                        }
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  editingLink ? "Update Link" : "Create Link"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
