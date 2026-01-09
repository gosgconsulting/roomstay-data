import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Pencil, Trash2, RefreshCw, Presentation } from "lucide-react";
import { SlideWithDetails } from "@/types/slides";

interface SlideListItemProps {
  slide: SlideWithDetails;
  onView: (slide: SlideWithDetails) => void;
  onEdit: (slide: SlideWithDetails) => void;
  onDelete: (slide: SlideWithDetails) => void;
  onRefresh: (slide: SlideWithDetails) => void;
  isRefreshing?: boolean;
}

export function SlideListItem({
  slide,
  onView,
  onEdit,
  onDelete,
  onRefresh,
  isRefreshing,
}: SlideListItemProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Presentation className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-medium">{slide.name}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {slide.data_source_name && (
                  <span>Source: {slide.data_source_name}</span>
                )}
                {slide.report_name && !slide.data_source_name && (
                  <span>Report: {slide.report_name}</span>
                )}
                <span>•</span>
                <span>
                  Updated {format(new Date(slide.updated_at), "MMM d, yyyy")}
                </span>
                {slide.last_refreshed_at && (
                  <>
                    <span>•</span>
                    <span>
                      Data: {format(new Date(slide.last_refreshed_at), "MMM d, h:mm a")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(slide)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              View
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRefresh(slide)}
              disabled={isRefreshing}
              title="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(slide)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRefresh(slide)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Data
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(slide)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
