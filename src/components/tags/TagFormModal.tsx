import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useCreateTag, useUpdateTag } from "@/hooks/useTags";
import { supabase } from "@/integrations/supabase/client";
import type { Tag, TagRuleOperator, TagValueInput, TagRuleInput } from "@/types/tags";

interface AvailableView {
  id: string;
  name: string;
}

interface TagFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingTag: Tag | null;
  accountId: string;
  userId: string;
  availableViews?: AvailableView[];
}

interface RuleFormData {
  dimension_id: string;
  operator: TagRuleOperator;
  value: string;
  case_sensitive: boolean;
}

interface ValueFormData {
  label: string;
  rules: RuleFormData[];
  expanded: boolean;
}

const CHANNELS = [
  { value: 'metasearch', label: 'Metasearch' },
  { value: 'sem', label: 'SEM' },
  { value: 'social', label: 'Social' },
] as const;

const OPERATORS: { value: TagRuleOperator; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'regex', label: 'Regex' },
];

const EMPTY_RULE: RuleFormData = {
  dimension_id: '',
  operator: 'contains',
  value: '',
  case_sensitive: false,
};

export function TagFormModal({
  open,
  onOpenChange,
  onSuccess,
  editingTag,
  accountId,
  userId,
  availableViews = [],
}: TagFormModalProps) {
  const [name, setName] = useState('');
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [values, setValues] = useState<ValueFormData[]>([]);
  const [textDimensions, setTextDimensions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const createTag = useCreateTag();
  const updateTag = useUpdateTag();

  // Load account text dimensions for rule dimension selection
  useEffect(() => {
    if (!open || !accountId) return;
    const loadDims = async () => {
      const { data } = await supabase
        .from('dimensions')
        .select('id, name')
        .eq('scope', 'account')
        .eq('account_id', accountId)
        .eq('type', 'text')
        .order('name');
      setTextDimensions(data || []);
    };
    loadDims();
  }, [open, accountId]);

  // Reset form when opening
  useEffect(() => {
    if (!open) return;
    if (editingTag) {
      setName(editingTag.name);
      setSelectedViewId(editingTag.view_id ?? null);
      setSelectedChannels([...editingTag.channels]);
      setValues(
        editingTag.tag_values.map((tv) => ({
          label: tv.label,
          rules: tv.rules.map((r) => ({
            dimension_id: r.dimension_id,
            operator: r.operator,
            value: r.value,
            case_sensitive: r.case_sensitive,
          })),
          expanded: true,
        }))
      );
    } else {
      setName('');
      setSelectedViewId(null);
      setSelectedChannels([]);
      setValues([]);
    }
  }, [open, editingTag]);

  const toggleChannel = (ch: string) => {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const addValue = () => {
    setValues((prev) => [
      ...prev,
      { label: '', rules: [{ ...EMPTY_RULE }], expanded: true },
    ]);
  };

  const removeValue = (idx: number) => {
    setValues((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateValueLabel = (idx: number, label: string) => {
    setValues((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, label } : v))
    );
  };

  const toggleValueExpanded = (idx: number) => {
    setValues((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, expanded: !v.expanded } : v))
    );
  };

  const addRule = (valueIdx: number) => {
    setValues((prev) =>
      prev.map((v, i) =>
        i === valueIdx ? { ...v, rules: [...v.rules, { ...EMPTY_RULE }] } : v
      )
    );
  };

  const removeRule = (valueIdx: number, ruleIdx: number) => {
    setValues((prev) =>
      prev.map((v, i) =>
        i === valueIdx
          ? { ...v, rules: v.rules.filter((_, ri) => ri !== ruleIdx) }
          : v
      )
    );
  };

  const updateRule = (
    valueIdx: number,
    ruleIdx: number,
    field: keyof RuleFormData,
    value: string | boolean
  ) => {
    setValues((prev) =>
      prev.map((v, vi) =>
        vi === valueIdx
          ? {
              ...v,
              rules: v.rules.map((r, ri) =>
                ri === ruleIdx ? { ...r, [field]: value } : r
              ),
            }
          : v
      )
    );
  };

  const handleSubmit = async () => {
    // Validation
    if (!name.trim()) return;
    if (selectedChannels.length === 0) return;
    if (values.length === 0) return;

    const hasEmptyLabels = values.some((v) => !v.label.trim());
    if (hasEmptyLabels) return;

    const hasEmptyRules = values.some((v) =>
      v.rules.some((r) => !r.dimension_id || !r.value.trim())
    );
    if (hasEmptyRules) return;

    setLoading(true);
    try {
      const tagValues: TagValueInput[] = values.map((v, idx) => ({
        label: v.label.trim(),
        sort_order: idx,
        rules: v.rules.map((r) => ({
          dimension_id: r.dimension_id,
          operator: r.operator,
          value: r.value.trim(),
          case_sensitive: r.case_sensitive,
        })),
      }));

      if (editingTag) {
        await updateTag.mutateAsync({
          id: editingTag.id,
          account_id: accountId,
          name: name.trim(),
          channels: selectedChannels,
          view_id: selectedViewId,
          tag_values: tagValues,
        });
      } else {
        await createTag.mutateAsync({
          account_id: accountId,
          name: name.trim(),
          channels: selectedChannels,
          view_id: selectedViewId,
          tag_values: tagValues,
          created_by: userId,
        });
      }
      onSuccess();
    } catch {
      // Error handled by mutation hooks
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    name.trim().length > 0 &&
    selectedChannels.length > 0 &&
    values.length > 0 &&
    values.every(
      (v) =>
        v.label.trim().length > 0 &&
        v.rules.length > 0 &&
        v.rules.every((r) => r.dimension_id && r.value.trim())
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editingTag ? "Edit Tag" : "Create Tag"}
          </DialogTitle>
          <DialogDescription>
            Define a tag with values and matching rules. Tags classify data rows and appear as filter/breakdown dimensions.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-6 py-2">
            {/* Tag name */}
            <div className="space-y-2">
              <Label htmlFor="tag-name">Tag Name</Label>
              <Input
                id="tag-name"
                placeholder="e.g. Strategy"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* View selection */}
            {availableViews.length > 0 && (
              <div className="space-y-2">
                <Label>View</Label>
                <Select
                  value={selectedViewId ?? "all"}
                  onValueChange={(v) => setSelectedViewId(v === "all" ? null : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All views</SelectItem>
                    {availableViews.map((view) => (
                      <SelectItem key={view.id} value={view.id}>
                        {view.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose which view this tag applies to, or "All views" for account-wide.
                </p>
              </div>
            )}

            {/* Channel selection */}
            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="flex gap-2">
                {CHANNELS.map((ch) => (
                  <Button
                    key={ch.value}
                    type="button"
                    variant={selectedChannels.includes(ch.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleChannel(ch.value)}
                  >
                    {ch.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select which channels this tag applies to.
              </p>
            </div>

            <Separator />

            {/* Tag Values */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Tag Values</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addValue}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Value
                </Button>
              </div>

              {values.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-md border-dashed">
                  No values yet. Add values like "Brand" or "Generic".
                </p>
              )}

              {values.map((val, valIdx) => (
                <div
                  key={valIdx}
                  className="border rounded-lg overflow-hidden"
                >
                  {/* Value header */}
                  <div className="flex items-center gap-2 p-3 bg-muted/50">
                    <button
                      type="button"
                      onClick={() => toggleValueExpanded(valIdx)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {val.expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <Input
                      placeholder="Value label (e.g. Brand)"
                      value={val.label}
                      onChange={(e) => updateValueLabel(valIdx, e.target.value)}
                      className="h-8 flex-1"
                    />
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {val.rules.length} rule{val.rules.length !== 1 ? 's' : ''}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeValue(valIdx)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>

                  {/* Rules (collapsible) */}
                  {val.expanded && (
                    <div className="p-3 space-y-3 border-t">
                      {val.rules.map((rule, ruleIdx) => (
                        <div key={ruleIdx} className="flex items-start gap-2">
                          {/* Dimension select */}
                          <Select
                            value={rule.dimension_id || undefined}
                            onValueChange={(v) =>
                              updateRule(valIdx, ruleIdx, 'dimension_id', v)
                            }
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue placeholder="Dimension" />
                            </SelectTrigger>
                            <SelectContent>
                              {textDimensions.map((dim) => (
                                <SelectItem key={dim.id} value={dim.id}>
                                  {dim.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Operator select */}
                          <Select
                            value={rule.operator}
                            onValueChange={(v) =>
                              updateRule(valIdx, ruleIdx, 'operator', v)
                            }
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OPERATORS.map((op) => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Value input */}
                          <Input
                            placeholder="Match text"
                            value={rule.value}
                            onChange={(e) =>
                              updateRule(valIdx, ruleIdx, 'value', e.target.value)
                            }
                            className="h-8 text-xs flex-1"
                          />

                          {/* Remove rule */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeRule(valIdx, ruleIdx)}
                            disabled={val.rules.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addRule(valIdx)}
                        className="gap-1 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Add Rule
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        All rules must match for a row to get this value (AND logic).
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        <div className="pt-4 border-t">
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={loading || !isValid}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {editingTag ? "Updating..." : "Creating..."}
              </>
            ) : editingTag ? (
              "Update Tag"
            ) : (
              "Create Tag"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
