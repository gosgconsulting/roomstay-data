import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className={cn("h-8 w-8", className)}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-foreground" />
            ) : (
              <Moon className="h-4 w-4 text-foreground" />
            )}
          </Button>
        </TooltipTrigger>
      <TooltipContent side="bottom">
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </TooltipContent>
    </Tooltip>
  );
}
