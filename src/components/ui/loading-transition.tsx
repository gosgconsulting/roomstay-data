import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingTransitionProps {
  isPending: boolean;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  message?: string;
  /** Position of the loading indicator: 'top' (default) or 'center' */
  position?: "top" | "center";
}

/**
 * Wraps content with a loading overlay that shows during React transitions.
 * Use with React.useTransition() for non-blocking state updates.
 * 
 * @example
 * const [isPending, startTransition] = useTransition();
 * 
 * const handleChange = (value: string) => {
 *   startTransition(() => {
 *     setValue(value);
 *   });
 * };
 * 
 * <LoadingTransition isPending={isPending}>
 *   <YourContent />
 * </LoadingTransition>
 */
export function LoadingTransition({
  isPending,
  children,
  className,
  overlayClassName,
  message = "Loading...",
  position = "top",
}: LoadingTransitionProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Loading overlay */}
      {isPending && (
        <div
          className={cn(
            "absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex animate-fade-in",
            position === "top" ? "items-start justify-center pt-20" : "items-center justify-center",
            overlayClassName
          )}
        >
          <div className="flex items-center gap-2 bg-background/90 px-4 py-2 rounded-lg shadow-lg border border-border">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{message}</span>
          </div>
        </div>
      )}

      {/* Content with opacity transition */}
      <div
        className={cn(
          "transition-opacity duration-150",
          isPending ? "opacity-60" : "opacity-100"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Just the loading overlay without wrapping content.
 * Useful when you need more control over the layout.
 */
export function LoadingOverlay({
  isPending,
  className,
  message = "Loading...",
  position = "top",
}: Omit<LoadingTransitionProps, "children">) {
  if (!isPending) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex animate-fade-in",
        position === "top" ? "items-start justify-center pt-20" : "items-center justify-center",
        className
      )}
    >
      <div className="flex items-center gap-2 bg-background/90 px-4 py-2 rounded-lg shadow-lg border border-border">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">{message}</span>
      </div>
    </div>
  );
}
