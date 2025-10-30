import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, ChevronDown, Database, Share2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { DataSourceModal } from "./DataSourceModal";

export const DashboardHeader = () => {
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  const [reports] = useState(["Current Report", "Q1 Performance", "Marketing Analytics"]);

  return (
    <>
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Report <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {reports.map((report) => (
                <DropdownMenuItem key={report}>{report}</DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add new
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowDataSourceModal(true)}
          >
            <Database className="h-4 w-4" />
            Data sources
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Date
          </Button>
        </div>
      </header>

      <DataSourceModal
        open={showDataSourceModal}
        onOpenChange={setShowDataSourceModal}
      />
    </>
  );
};
