import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
  account_id?: string;
}

interface DimensionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimension?: Dimension;
  mode?: 'add' | 'edit';
  onSaved?: () => void;
  reportId?: string;
  accountId?: string;
}

export const DimensionModal = ({
  open,
  onOpenChange,
  dimension,
  mode = 'add',
  onSaved,
  reportId,
  accountId,
}: DimensionModalProps) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("number");
  const [formula, setFormula] = useState("");
  const [scope, setScope] = useState<'global' | 'custom'>('custom');
  const [isLoading, setIsLoading] = useState(false);

  const [availableDimensions, setAvailableDimensions] = useState<Dimension[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearchTerm, setMentionSearchTerm] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const formulaInputRef = useRef<HTMLTextAreaElement>(null);

  // [testing] Check if dimension is a system/default dimension
  const isSystemDimension = (dim: Dimension | null): boolean => {
    if (!dim) return false;
    const systemDimensionNames = [
      'Impressions', 'Clicks', 'Revenue', 'Cost', 'Conversions', 'Leads',
      'CTR', 'ROAS', 'Cost of sale', 'Conversion Rate', 'CPM', 'CPC', 'Impression Share'
    ];
    return dim.is_system === true || systemDimensionNames.includes(dim.name);
  };

  // Load available dimensions for the @ mention dropdown
  useEffect(() => {
    if (open) {
      loadAvailableDimensions();
    }
  }, [open, reportId]);

  const loadAvailableDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get dimensions for the current report
      let query = supabase.from("dimensions").select("*");

      if (reportId) {
        query = query.eq("report_id", reportId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter out the current dimension (if editing) and exclude the dimension we're currently editing
      const filtered = (data || []).filter((d: any) =>
        !dimension || d.id !== dimension.id
      );

      setAvailableDimensions(filtered as Dimension[]);
    } catch (error) {
      console.error("Error loading available dimensions:", error);
    }
  };

  // Reset form when modal opens/closes or dimension changes
  useEffect(() => {
    if (open && mode === 'edit' && dimension) {
      console.log('[testing] Populating form for edit mode:', dimension);
      setName(dimension.name);
      setType(dimension.type);
      setFormula(dimension.formula || "");
      // Always show the dimension's actual scope in edit mode (read-only)
      setScope(dimension.scope || 'custom');
    } else if (open && mode === 'add') {
      console.log('[testing] Resetting form for add mode');
      setName("");
      setType("number");
      setFormula("");
      // Always create custom dimensions (users can't create global)
      setScope('custom');
    }
  }, [open, mode, dimension]);

  const handleFormulaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursorPos = e.target.selectionStart;

    setFormula(text);
    setMentionCursorPos(cursorPos);

    // Check for @ mention
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const searchTerm = textBeforeCursor.substring(lastAtIndex + 1).trim();
      // Show dropdown if @ is followed by optional search term
      if (!textBeforeCursor.substring(lastAtIndex).includes(" ") || searchTerm === "") {
        setMentionSearchTerm(searchTerm);
        setShowMentionDropdown(true);
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  const insertDimensionMention = (dimensionName: string) => {
    const text = formula;
    const cursorPos = mentionCursorPos;

    const textBeforeCursor = text.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterCursor = text.substring(cursorPos);
      const newFormula =
        text.substring(0, lastAtIndex) +
        dimensionName +
        " " +
        textAfterCursor;

      setFormula(newFormula);
      setShowMentionDropdown(false);
      setMentionSearchTerm("");

      // Refocus and position cursor after inserted text
      setTimeout(() => {
        if (formulaInputRef.current) {
          const newCursorPos = lastAtIndex + dimensionName.length + 1;
          formulaInputRef.current.focus();
          formulaInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  const testFormula = () => {
    if (!formula.trim()) {
      toast({
        title: "No formula",
        description: "Please enter a formula to test",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create a safe evaluation context with available dimensions
      const context: Record<string, number> = {};
      availableDimensions.forEach((dim) => {
        // Use the dimension name as the variable, replacing spaces with underscores
        const varName = dim.name.replace(/\s+/g, "_");
        context[varName] = 100; // Test value
        // Also support the original name with spaces (for formula compatibility)
        context[dim.name] = 100;
      });

      // Replace dimension names with test values
      let testFormula = formula;
      availableDimensions.forEach((dim) => {
        // Escape special regex characters in dimension name
        const escapedName = dim.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        testFormula = testFormula.replace(new RegExp(escapedName, 'g'), '100');
      });

      // Remove any remaining @ symbols
      testFormula = testFormula.replace(/@/g, '');

      // Simple evaluation - only allow basic math operations
      if (!/^[\d\s+\-*/%().]+$/.test(testFormula)) {
        throw new Error("Formula contains invalid characters. Only numbers and operators (+, -, *, /, %) are allowed.");
      }

      // Evaluate the formula safely
      const result = Function('"use strict"; return (' + testFormula + ')')();

      toast({
        title: "Formula test successful",
        description: `Result: ${typeof result === 'number' ? result.toFixed(2) : result}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid formula syntax";
      toast({
        title: "Formula test failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Please enter a dimension name",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error("User not authenticated");

      if (mode === 'edit' && dimension) {
        console.log('[testing] Updating dimension:', dimension.id);

        // If editing a global dimension in an account context, create an account-specific copy instead
        if (dimension.scope === 'global' && accountId) {
          console.log('[testing] Creating account-specific copy of global dimension:', dimension.id);

          const { data, error } = await supabase
            .from("dimensions")
            .insert({
              name: name.trim(),
              type,
              formula: formula.trim() || null,
              account_id: accountId,
              scope: 'account',
            })
            .select()
            .single();

          if (error) throw error;

          toast({
            title: "Dimension customized",
            description: `Created account-specific version of "${name}"`,
          });
        } else {
          // For custom or account dimensions, update directly
          // For system dimensions, only allow formula updates
          const updateData = isSystemDimension(dimension)
            ? { formula: formula.trim() || null }
            : {
                name: name.trim(),
                type,
                formula: formula.trim() || null,
              };

          const { error } = await supabase
            .from("dimensions")
            .update(updateData)
            .eq("id", dimension.id);

          if (error) throw error;

          toast({
            title: "Dimension updated",
            description: `Updated dimension "${name}"`,
          });
        }
      } else {
        console.log('[testing] Creating new dimension for report:', reportId);

        // Users can only create custom dimensions (for their specific report)
        if (!reportId) {
          throw new Error("Report ID is required for creating dimensions");
        }

        const { error } = await supabase
          .from("dimensions")
          .insert({
            user_id: user.id,
            report_id: reportId,
            name: name.trim(),
            type,
            formula: formula.trim() || null,
            scope: 'custom', // Always custom for user-created dimensions
          });

        if (error) throw error;

        toast({
          title: "Dimension added",
          description: `Created dimension "${name}" for this report`,
        });
      }

      // Reset form
      setName("");
      setType("number");
      setFormula("");
      setScope('custom');
      onOpenChange(false);
      
      // Notify parent component to refresh data
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      // Properly serialize error for logging
      let errorMessage = '';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = (error as any).message;
      } else {
        errorMessage = JSON.stringify(error, null, 2);
      }

      console.error(`Error ${mode === 'edit' ? 'updating' : 'creating'} dimension:`, errorMessage);
      toast({
        title: "Error",
        description: errorMessage || `Failed to ${mode === 'edit' ? 'update' : 'create'} dimension`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Edit Dimension' : 'Add Dimension'}
            {mode === 'edit' && isSystemDimension(dimension) && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                System
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit' && dimension?.scope === 'global' && accountId
              ? 'Editing this global dimension will create an account-specific version. Only this account will be affected.'
              : mode === 'edit' && isSystemDimension(dimension) && dimension?.scope !== 'global'
                ? 'This is a system dimension. Only the formula can be modified.'
                : mode === 'edit'
                  ? 'Update the dimension details'
                  : 'Create a new dimension for your report'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <input
                type="radio"
                id="custom"
                value="custom"
                checked={scope === 'custom'}
                onChange={() => setScope('custom')}
                disabled={mode === 'edit'}
              />
              <label htmlFor="custom" className="cursor-pointer flex-1">
                <div>
                  <span className="font-medium">Custom</span>
                  <p className="text-xs text-muted-foreground">For this report only</p>
                </div>
              </label>
            </div>
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground">
                Scope cannot be changed after creation
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Custom dimensions are specific to this report. Contact an administrator to create global dimensions available across all reports.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Impressions, Clicks, Revenue"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === 'edit' && isSystemDimension(dimension) && !(dimension?.scope === 'global' && accountId)}
              className={mode === 'edit' && isSystemDimension(dimension) && !(dimension?.scope === 'global' && accountId) ? 'bg-gray-50' : ''}
            />
            {mode === 'edit' && isSystemDimension(dimension) && !(dimension?.scope === 'global' && accountId) && (
              <p className="text-xs text-muted-foreground">
                System dimension names cannot be changed
              </p>
            )}
            {mode === 'edit' && dimension?.scope === 'global' && accountId && (
              <p className="text-xs text-blue-600">
                This will create an account-specific version with the new name
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={setType}
              disabled={mode === 'edit' && isSystemDimension(dimension) && !(dimension?.scope === 'global' && accountId)}
            >
              <SelectTrigger
                id="type"
                className={`bg-background ${mode === 'edit' && isSystemDimension(dimension) && !(dimension?.scope === 'global' && accountId) ? 'bg-gray-50' : ''}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="text">Plain text</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
              </SelectContent>
            </Select>
            {mode === 'edit' && isSystemDimension(dimension) && !(dimension?.scope === 'global' && accountId) && (
              <p className="text-xs text-muted-foreground">
                System dimension types cannot be changed
              </p>
            )}
            {mode === 'edit' && dimension?.scope === 'global' && accountId && (
              <p className="text-xs text-blue-600">
                This will create an account-specific version with the new type
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="formula">Formula (optional)</Label>
            <div className="relative">
              <Textarea
                ref={formulaInputRef}
                id="formula"
                placeholder="e.g., Cost / Clicks, Revenue / Cost. Type @ to insert a dimension"
                value={formula}
                onChange={handleFormulaChange}
                rows={3}
                className="resize-none"
              />

              {showMentionDropdown && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto w-full">
                  {availableDimensions
                    .filter((d) =>
                      d.name
                        .toLowerCase()
                        .includes(mentionSearchTerm.toLowerCase())
                    )
                    .map((dim) => (
                      <button
                        key={dim.id}
                        onClick={() => insertDimensionMention(dim.name)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center justify-between"
                      >
                        <span className="font-medium">{dim.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({dim.type})
                        </span>
                      </button>
                    ))}
                  {availableDimensions.filter((d) =>
                    d.name
                      .toLowerCase()
                      .includes(mentionSearchTerm.toLowerCase())
                  ).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No dimensions found
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Use metric names for calculations. Type @ to insert a dimension. Leave empty for base metrics.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={testFormula}
                disabled={!formula.trim()}
              >
                Test
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
