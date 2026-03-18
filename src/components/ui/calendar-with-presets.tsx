"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit select-none", className)}
      classNames={{
        // Root
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-2",

        // Caption row (month name + nav)
        caption: "relative flex items-center justify-center h-9",
        caption_label: "text-sm font-semibold text-foreground",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between h-9",
        nav_button: cn(
          "inline-flex items-center justify-center size-7 rounded-md",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ),
        nav_button_previous: "absolute left-0",
        nav_button_next: "absolute right-0",
        nav_icon: "size-4",

        // Weekday header row
        head_row: "grid grid-cols-7",
        head_cell:
          "flex items-center justify-center w-9 h-8 text-[11px] font-medium text-muted-foreground uppercase",

        // Weeks / days
        table: "w-full border-collapse",
        tbody: "",
        row: "grid grid-cols-7 mt-0.5",
        cell: "relative flex items-center justify-center p-0",

        // Individual day button
        day: cn(
          "relative flex items-center justify-center w-9 h-9 rounded-full text-sm",
          "transition-colors cursor-pointer",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        ),

        // State modifiers
        day_selected:
          "bg-foreground text-background hover:bg-foreground hover:text-background font-medium",
        day_today:
          "font-semibold text-primary after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
        day_outside: "text-muted-foreground/40 hover:bg-accent/50",
        day_disabled:
          "text-muted-foreground/30 cursor-not-allowed hover:bg-transparent pointer-events-none",
        day_hidden: "invisible",

        // Range modifiers
        day_range_start:
          "rounded-full bg-foreground text-background hover:bg-foreground hover:text-background font-medium",
        day_range_end:
          "rounded-full bg-foreground text-background hover:bg-foreground hover:text-background font-medium",
        day_range_middle:
          "rounded-none bg-accent text-foreground hover:bg-accent",

        // Allow caller overrides
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="size-4" strokeWidth={2} />,
        IconRight: () => <ChevronRight className="size-4" strokeWidth={2} />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
