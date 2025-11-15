"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronsUpDown } from "lucide-react";

export type MultiSelectOption = {
  label: string;
  value: string;
};

type MultiSelectProps = {
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
};

export default function MultiSelect({
  options,
  values,
  onChange,
  placeholder = "Select values...",
  searchPlaceholder = "Search...",
  disabled = false,
  className
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const toggleValue = (val: string) => {
    const next = values.includes(val) ? values.filter(v => v !== val) : [...values, val];
    onChange(next);
  };

  const selectedLabels = React.useMemo(() => {
    const map = new Map(options.map(o => [o.value, o.label]));
    return values.map(v => map.get(v) || v);
  }, [options, values]);

  const triggerText = React.useMemo(() => {
    if (selectedLabels.length === 0) return placeholder;
    if (selectedLabels.length <= 2) return selectedLabels.join(", ");
    return `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2} more`;
  }, [selectedLabels, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = values.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => toggleValue(opt.value)}
                    className="gap-2"
                  >
                    <Checkbox checked={checked} aria-hidden="true" />
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {values.length > 0 ? (
          <div className="flex flex-wrap gap-1 p-2 border-t">
            {selectedLabels.slice(0, 5).map((lbl, idx) => (
              <Badge key={`${lbl}-${idx}`} variant="secondary" className="max-w-[10rem] truncate">
                {lbl}
              </Badge>
            ))}
            {values.length > 5 && (
              <Badge variant="secondary">+{values.length - 5} more</Badge>
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}