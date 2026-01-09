import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Database, Sparkles, Check } from "lucide-react";

interface DataSource {
  id: string;
  name: string;
  report_id: string;
  last_synced_at: string | null;
}

interface CreateSlideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  userId: string;
  onSlideCreated: (slide: any) => void;
}

type Step = "select-source" | "configure" | "name";

export function CreateSlideModal({
  open,
  onOpenChange,
  accountId,
  userId,
  onSlideCreated,
}: CreateSlideModalProps) {
  const [step, setStep] = useState<Step>("select-source");
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoadingDataSources, setIsLoadingDataSources] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(null);
  const [slideName, setSlideName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (open) {
      loadDataSources();
      // Reset state
      setStep("select-source");
      setSelectedDataSourceId(null);
      setSlideName("");
    }
  }, [open, accountId]);

  const loadDataSources = async () => {
    setIsLoadingDataSources(true);
    try {
      // First get reports for this account
      const { data: reports, error: reportsError } = await supabase
        .from("reports")
        .select("id")
        .eq("account_id", accountId);

      if (reportsError) throw reportsError;

      if (!reports || reports.length === 0) {
        setDataSources([]);
        return;
      }

      // Then get data sources for these reports
      const reportIds = reports.map((r) => r.id);
      const { data, error } = await supabase
        .from("data_sources")
        .select("id, name, report_id, last_synced_at")
        .in("report_id", reportIds)
        .order("name");

      if (error) throw error;
      setDataSources(data || []);
    } catch (error) {
      console.error("Error loading data sources:", error);
    } finally {
      setIsLoadingDataSources(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedDataSourceId || !slideName.trim()) return;

    setIsCreating(true);
    try {
      // Get the report_id from the selected data source
      const selectedSource = dataSources.find((ds) => ds.id === selectedDataSourceId);
      
      const { data, error } = await supabase
        .from("slides")
        .insert({
          name: slideName.trim(),
          account_id: accountId,
          data_source_id: selectedDataSourceId,
          report_id: selectedSource?.report_id || null,
          components: [],
          user_id: userId,
        })
        .select()
        .single();

      if (error) throw error;

      onSlideCreated(data);
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating slide:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case "select-source":
        return !!selectedDataSourceId;
      case "configure":
        return true;
      case "name":
        return slideName.trim().length > 0;
      default:
        return false;
    }
  };

  const goNext = () => {
    switch (step) {
      case "select-source":
        setStep("name");
        break;
      case "name":
        handleCreate();
        break;
    }
  };

  const goBack = () => {
    switch (step) {
      case "name":
        setStep("select-source");
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create New Slide
          </DialogTitle>
          <DialogDescription>
            {step === "select-source" && (
              "Select a data source to use for your slide."
            )}
            {step === "name" && (
              "Give your slide a name."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === "select-source" && (
            <div className="space-y-3">
              {isLoadingDataSources ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground mt-2">Loading data sources...</p>
                </div>
              ) : dataSources.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No data sources found.</p>
                  <p className="text-sm text-muted-foreground">
                    Create a data source in Data Studio first.
                  </p>
                </div>
              ) : (
                <RadioGroup
                  value={selectedDataSourceId || ""}
                  onValueChange={setSelectedDataSourceId}
                >
                  {dataSources.map((source) => (
                    <Card
                      key={source.id}
                      className={`p-4 cursor-pointer transition-all ${
                        selectedDataSourceId === source.id
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedDataSourceId(source.id)}
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value={source.id} id={source.id} />
                        <div className="flex-1">
                          <Label htmlFor={source.id} className="font-medium cursor-pointer">
                            {source.name}
                          </Label>
                          {source.last_synced_at && (
                            <p className="text-xs text-muted-foreground">
                              Last synced: {new Date(source.last_synced_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        {selectedDataSourceId === source.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </Card>
                  ))}
                </RadioGroup>
              )}
            </div>
          )}

          {step === "name" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slide-name">Slide Name</Label>
                <Input
                  id="slide-name"
                  placeholder="e.g., Monthly Performance Overview"
                  value={slideName}
                  onChange={(e) => setSlideName(e.target.value)}
                  autoFocus
                />
              </div>
              {selectedDataSourceId && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Data source:{" "}
                    <span className="font-medium text-foreground">
                      {dataSources.find((ds) => ds.id === selectedDataSourceId)?.name}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step !== "select-source" && (
              <Button variant="ghost" onClick={goBack} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={goNext}
              disabled={!canProceed() || isCreating}
              className="gap-2"
            >
              {step === "name" ? (
                isCreating ? "Creating..." : "Create Slide"
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
