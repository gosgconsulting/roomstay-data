import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface SlideCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onOpenClick: () => void;
  available?: boolean;
  badge?: string;
}

export function SlideCard({
  title,
  description,
  icon,
  onOpenClick,
  available = true,
  badge,
}: SlideCardProps) {
  return (
    <Card
      className={`${
        available
          ? "hover:shadow-lg hover:border-primary/50 cursor-pointer transition-all group"
          : "opacity-60 cursor-not-allowed"
      }`}
      onClick={() => available && onOpenClick()}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div
            className={`p-3 rounded-lg ${
              available ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {icon}
          </div>
          {badge && (
            <span className="text-xs bg-secondary px-2 py-1 rounded">{badge}</span>
          )}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full gap-2"
          disabled={!available}
        >
          Open {title}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
