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
import type { Dimension, DimensionCondition, FormulaConditionPair } from "@/types/dimensions";

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
  const [conditions, setConditions] = useState<DimensionCondition[]>([]);
  const [formulaConditionPairs, setFormulaConditionPairs] = useState<FormulaConditionPair[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [availableDimensions, setAvailableDimensions] = useState<Dimension[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearchTerm, setMentionSearchTerm] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const formulaInputRef = useRef<HTMLTextAreaElement>(null);

  // Load available dimensions for the @ mention dropdown
  useEffect(() => {
    if (open) {
      loadAvailableDimensions();
    }
  }, [open, reportId, accountId]);

  const loadAvailableDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[DIMENSION-MODAL] Loading available dimensions for formula - accountId:', accountId, 'reportId:', reportId);

      // Load account-scoped dimensions first (highest priority)
      let accountData: Dimension[] = [];
      if (accountId) {
        const { data, error } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        accountData = ((data || []) as any[]).map(d => ({
          ...d,
          conditions: Array.isArray(d.conditions) ? d.conditions : []
        })) as Dimension[];
      }

      // Load global dimensions
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Load custom dimensions for this user and report
      let customData: Dimension[] = [];
      if (reportId) {
        const { data, error: customError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("user_id", user.id)
          .eq("scope", "custom")
          .eq("report_id", reportId)
          .order("created_at", { ascending: false });

        if (customError) throw customError;
        customData = ((data || []) as any[]).map(d => ({
          ...d,
          conditions: Array.isArray(d.conditions) ? d.conditions : []
        })) as Dimension[];
      }

      // Combine dimensions with priority: account > global > custom
      const allDimensions = [
        ...(accountData || []),
        ...((globalData || []) as any[]).map(d => ({
          ...d,
          conditions: Array.isArray(d.conditions) ? d.conditions : []
        })),
        ...(customData || [])
      ] as Dimension[];

      // Deduplicate by name (keep first occurrence = highest priority)
      const seenNames = new Set<string>();
      const uniqueDimensions = allDimensions.filter(dim => {
        if (dimension && dim.id === dimension.id) return false; // Exclude current dimension
        if (seenNames.has(dim.name)) return false;
        seenNames.add(dim.name);
        return true;
      });

      console.log('[DIMENSION-MODAL] Loaded dimensions for formula:', {
        account: accountData.length,
        global: globalData?.length || 0,
        custom: customData?.length || 0,
        unique: uniqueDimensions.length
      });

      setAvailableDimensions(uniqueDimensions);
    } catch (error) {
      console.error("Error loading available dimensions:", error);
    }
  };

  // Reset form when modal opens/closes or dimension changes
  useEffect(() => {
    if (open && mode === 'edit' && dimension) {
      console.log('[DIMENSION-MODAL] Populating form for edit mode:', dimension);
      setName(dimension.name);
      setType(dimension.type);
      
      // Handle backward compatibility: if dimension has old formula/conditions structure, convert it
      if (dimension.formula_condition_pairs && dimension.formula_condition_pairs.length > 0) {
        setFormulaConditionPairs(dimension.formula_condition_pairs);
        setFormula("");
        setConditions([]);
      } else if (dimension.formula || (dimension.conditions && dimension.conditions.length > 0)) {
        // Convert old structure to new structure
        const pair: FormulaConditionPair = {
          id: crypto.randomUUID(),
          formula: dimension.formula || "",
          conditions: dimension.conditions || []
        };
        setFormulaConditionPairs([pair]);
        setFormula("");
        setConditions([]);
      } else {
        setFormulaConditionPairs([]);
        setFormula("");
        setConditions([]);
      }
    } else if (open && mode === 'add') {
      console.log('[DIMENSION-MODAL] Resetting form for add mode');
      setName("");
      setType("number");
      setFormula("");
      setConditions([]);
      setFormulaConditionPairs([]);
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

  // Functions for managing formula-condition pairs
  const addFormulaConditionPair = () => {
    const newPair: FormulaConditionPair = {
      id: crypto.randomUUID(),
      formula: "",
      conditions: []
    };
    setFormulaConditionPairs([...formulaConditionPairs, newPair]);
  };

  const updateFormulaConditionPair = (pairId: string, updates: Partial<FormulaConditionPair>) => {
    setFormulaConditionPairs(pairs => 
      pairs.map(pair => 
        pair.id === pairId ? { ...pair, ...updates } : pair
      )
    );
  };

  const removeFormulaConditionPair = (pairId: string) => {
    setFormulaConditionPairs(pairs => pairs.filter(pair => pair.id !== pairId));
  };

  const addConditionToPair = (pairId: string) => {
    const newCondition: DimensionCondition = {
      dimension_id: '',
      operator: 'equals',
      value: ''
    };
    updateFormulaConditionPair(pairId, {
      conditions: [...(formulaConditionPairs.find(p => p.id === pairId)?.conditions || []), newCondition]
    });
  };

  const updateConditionInPair = (pairId: string, conditionIndex: number, updates: Partial<DimensionCondition>) => {
    const pair = formulaConditionPairs.find(p => p.id === pairId);
    if (!pair) return;
    
    const updatedConditions = [...pair.conditions];
    updatedConditions[conditionIndex] = { ...updatedConditions[conditionIndex], ...updates };
    updateFormulaConditionPair(pairId, { conditions: updatedConditions });
  };

  const removeConditionFromPair = (pairId: string, conditionIndex: number) => {
    const pair = formulaConditionPairs.find(p => p.id === pairId);
    if (!pair) return;
    
    const updatedConditions = pair.conditions.filter((_, index) => index !== conditionIndex);
    updateFormulaConditionPair(pairId, { conditions: updatedConditions });
  };

  const testFormula = (formulaToTest?: string) => {
    const testFormula = formulaToTest || formula;
    if (!testFormula.trim()) {
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
      let testFormulaExpression = testFormula;
      availableDimensions.forEach((dim) => {
        // Escape special regex characters in dimension name
        const escapedName = dim.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        testFormulaExpression = testFormulaExpression.replace(new RegExp(escapedName, 'g'), '100');
      });

      // Remove any remaining @ symbols
      testFormulaExpression = testFormulaExpression.replace(/@/g, '');

      // Simple evaluation - allow basic math operations, parentheses, and percentage symbol
      // Check BEFORE converting percentages so the % symbol is allowed
      const cleanedFormulaForValidation = testFormula.replace(/@/g, '').replace(/[a-zA-Z_][a-zA-Z0-9_\s]*/g, '100');
      if (!/^[\d\s+\-*/.()%]+$/.test(cleanedFormulaForValidation)) {
        throw new Error("Formula contains invalid characters. Only numbers and operators (+, -, *, /, %, parentheses) are allowed.");
      }

      // Handle percentage notation (e.g., "15%" becomes "0.15")
      testFormulaExpression = testFormulaExpression.replace(/(\d+(?:\.\d+)?)\s*%/g, (match, num) => {
        return `(${parseFloat(num) / 100})`;
      });

      // Evaluate the formula safely
      const result = Function('"use strict"; return (' + testFormulaExpression + ')')();

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
        console.log('[DIMENSION-MODAL] Updating dimension:', dimension.id);

        // Update the dimension directly
        const updateData: any = {
          name: name.trim(),
          type,
          // For backward compatibility, keep old fields if no new pairs exist
          formula: formulaConditionPairs.length === 0 ? (formula.trim() || null) : null,
          conditions: formulaConditionPairs.length === 0 ? (conditions.length > 0 ? JSON.parse(JSON.stringify(conditions)) : []) : [],
          // Add new field for multiple formula-condition pairs
          formula_condition_pairs: formulaConditionPairs.length > 0 ? JSON.parse(JSON.stringify(formulaConditionPairs)) : [],
        };

        console.log('[DIMENSION-MODAL] Updating dimension with data:', updateData);

        const { error } = await supabase
          .from("dimensions")
          .update(updateData)
          .eq("id", dimension.id);

        if (error) throw error;

        toast({
          title: "Dimension updated",
          description: `Updated dimension "${name}"`,
        });
      } else {
        console.log('[DIMENSION-MODAL] Creating new dimension - accountId:', accountId, 'reportId:', reportId);

        // Determine scope and related IDs based on available context
        let scope: 'account' | 'custom' = 'custom';
        let dimensionAccountId: string | null = null;
        let dimensionReportId: string | null = null;

        if (accountId) {
          // PRIORITY: If accountId is available, create account-scoped dimension (shared across all reports in account)
          scope = 'account';
          dimensionAccountId = accountId;
          dimensionReportId = null; // Account dimensions are not tied to specific reports
          console.log('[DIMENSION-MODAL] Creating account-scoped dimension for account:', accountId);
        } else if (reportId) {
          // FALLBACK: If only reportId is available, create report-specific custom dimension
          scope = 'custom';
          dimensionAccountId = null;
          dimensionReportId = reportId;
          console.log('[DIMENSION-MODAL] Creating report-specific custom dimension for report:', reportId);
        } else {
          // LAST RESORT: Fallback to user-level custom dimension
          scope = 'custom';
          dimensionAccountId = null;
          dimensionReportId = null;
          console.log('[DIMENSION-MODAL] Creating user-level custom dimension');
        }

        const dimensionData: any = {
          name: name.trim(),
          type,
          // For backward compatibility, keep old fields if no new pairs exist
          formula: formulaConditionPairs.length === 0 ? (formula.trim() || null) : null,
          conditions: formulaConditionPairs.length === 0 ? (conditions.length > 0 ? JSON.parse(JSON.stringify(conditions)) : []) : [],
          // Add new field for multiple formula-condition pairs
          formula_condition_pairs: formulaConditionPairs.length > 0 ? JSON.parse(JSON.stringify(formulaConditionPairs)) : [],
          user_id: user.id,
          scope,
          account_id: dimensionAccountId,
          report_id: dimensionReportId,
        };

        console.log('[DIMENSION-MODAL] Creating dimension with data:', dimensionData);

        const { error } = await supabase
          .from("dimensions")
          .insert(dimensionData);

        if (error) throw error;

        toast({
          title: "Success",
          description: `${scope === 'account' ? 'Account' : 'Custom'} dimension "${name}" created successfully.`,
        });
      }

      onSaved?.();
      onOpenChange(false);
      setName("");
      setType("number");
      setFormula("");
      setConditions([]);
      setFormulaConditionPairs([]);
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

      console.error(`[DIMENSION-MODAL] Error ${mode === 'edit' ? 'updating' : 'creating'} dimension:`, errorMessage);
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
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit' 
              ? 'Update the dimension details' 
              : accountId 
                ? 'Create a new dimension that will be available across all reports in this account'
                : 'Create a new dimension for this report'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Impressions, Clicks, Revenue"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={setType}
            >
              <SelectTrigger id="type" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="text">Plain text</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="vlookup">Vlookup</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Formulas with Conditions</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFormulaConditionPair}
              >
                + Add Formula
              </Button>
            </div>
            
            {formulaConditionPairs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No formulas added yet.</p>
                <p className="text-xs">Click "Add Formula" to create a formula with specific conditions.</p>
              </div>
            )}

            <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
              {formulaConditionPairs.map((pair, pairIndex) => (
              <div key={pair.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Formula #{pairIndex + 1}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFormulaConditionPair(pair.id)}
                  >
                    Remove
                  </Button>
                </div>

                {/* Formula Input */}
                <div className="space-y-2">
                  <Label htmlFor={`formula-${pair.id}`}>Formula</Label>
                  <div className="relative">
                    <Textarea
                      id={`formula-${pair.id}`}
                      placeholder="e.g., (Revenue * 15%) - Cost"
                      value={pair.formula}
                      onChange={(e) => {
                        updateFormulaConditionPair(pair.id, { formula: e.target.value });
                        // Handle @ mentions for this specific formula
                        const text = e.target.value;
                        const cursorPos = e.target.selectionStart;
                        setMentionCursorPos(cursorPos);
                        setFormula(text); // Set for mention dropdown

                        const textBeforeCursor = text.substring(0, cursorPos);
                        const lastAtIndex = textBeforeCursor.lastIndexOf("@");

                        if (lastAtIndex !== -1) {
                          const searchTerm = textBeforeCursor.substring(lastAtIndex + 1).trim();
                          if (!textBeforeCursor.substring(lastAtIndex).includes(" ") || searchTerm === "") {
                            setMentionSearchTerm(searchTerm);
                            setShowMentionDropdown(true);
                            formulaInputRef.current = e.target as HTMLTextAreaElement;
                          } else {
                            setShowMentionDropdown(false);
                          }
                        } else {
                          setShowMentionDropdown(false);
                        }
                      }}
                      rows={2}
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
                              onClick={() => {
                                const text = pair.formula;
                                const cursorPos = mentionCursorPos;
                                const textBeforeCursor = text.substring(0, cursorPos);
                                const lastAtIndex = textBeforeCursor.lastIndexOf("@");

                                if (lastAtIndex !== -1) {
                                  const textAfterCursor = text.substring(cursorPos);
                                  const newFormula =
                                    text.substring(0, lastAtIndex) +
                                    dim.name +
                                    " " +
                                    textAfterCursor;

                                  updateFormulaConditionPair(pair.id, { formula: newFormula });
                                  setShowMentionDropdown(false);
                                  setMentionSearchTerm("");
                                }
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex items-center justify-between"
                            >
                              <span className="font-medium">{dim.name}</span>
                              <span className="text-xs text-muted-foreground">
                                ({dim.type}) {dim.scope && `- ${dim.scope}`}
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
                      Type @ to insert a dimension. Use % for percentages.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testFormula(pair.formula)}
                      disabled={!pair.formula.trim()}
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Conditions for this formula */}
                <div className="space-y-2">
                  <Label>Conditions (when to apply this formula)</Label>
                  <div className="space-y-2">
                    {pair.conditions.map((condition, conditionIndex) => (
                      <div key={conditionIndex} className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Select
                            value={condition.dimension_id}
                            onValueChange={(value) => {
                              updateConditionInPair(pair.id, conditionIndex, { dimension_id: value });
                            }}
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="Select dimension" />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              {availableDimensions.map((dim) => (
                                <SelectItem key={dim.id} value={dim.id}>
                                  {dim.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-32">
                          <Select
                            value={condition.operator}
                            onValueChange={(value: string) => {
                              updateConditionInPair(pair.id, conditionIndex, { 
                                operator: value as DimensionCondition['operator'] 
                              });
                            }}
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              <SelectItem value="equals">Equal to</SelectItem>
                              <SelectItem value="not_equals">Not equal to</SelectItem>
                              <SelectItem value="contains">Contains</SelectItem>
                              <SelectItem value="not_contains">Not contains</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1">
                          <Input
                            placeholder="Value"
                            value={condition.value}
                            onChange={(e) => {
                              updateConditionInPair(pair.id, conditionIndex, { value: e.target.value });
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            removeConditionFromPair(pair.id, conditionIndex);
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addConditionToPair(pair.id)}
                      className="w-full"
                    >
                      + Add Condition
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This formula will only be applied when ALL conditions are met. Leave empty to apply to all rows.
                  </p>
                </div>
              </div>
              ))}
            </div>

            {formulaConditionPairs.length > 0 && (
              <div className="bg-blue-50 p-3 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>Multiple Formulas:</strong> Each formula will be evaluated in order. The first formula whose conditions match will be used for each row.
                </p>
              </div>
            )}
          </div>

          {accountId && mode === 'add' && (
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Account Dimension:</strong> This dimension will be available across all reports in this account.
              </p>
            </div>
          )}
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