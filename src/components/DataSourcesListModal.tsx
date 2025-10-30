import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useEffect } from "react";
import { Database, Plus, Eye, Trash2, FileSpreadsheet, Edit } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { EditMappingModal } from "./EditMappingModal";
import { ViewDataModal } from "./ViewDataModal";

interface DataSource {
  id: string;
  name: string;
  google_sheets_url: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  column_mappings: any[] | null;
}

interface DataSourcesListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  onAddNew: () => void;
}

export const DataSourcesListModal = ({ 
  open, 
  onOpenChange, 
  reportId,
  onAddNew 
}: DataSourcesListModalProps) => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(null);
  const [viewingDataSource, setViewingDataSource] = useState<DataSource | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  useEffect(() => {
    if (open && reportId) {
      loadDataSources();
    }
  }, [open, reportId]);

  const loadDataSources = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setDataSources((data || []) as DataSource[]);
    } catch (error) {
      console.error("Error loading data sources:", error);
      toast({
        title: "Error",
        description: "Failed to load data sources",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (dataSource: DataSource) => {
    try {
      const { error } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', dataSource.id);

      if (error) throw error;

      setDataSources(dataSources.filter(ds => ds.id !== dataSource.id));
      
      toast({
        title: "Data source deleted",
        description: `Deleted "${dataSource.name}"`,
      });
    } catch (error) {
      console.error("Error deleting data source:", error);
      toast({
        title: "Error",
        description: "Failed to delete data source",
        variant: "destructive",
      });
    }
  };

  const handleView = (dataSource: DataSource) => {
    setViewingDataSource(dataSource);
    setIsViewModalOpen(true);
  };

  const handleEdit = (dataSource: DataSource) => {
    setEditingDataSource(dataSource);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    loadDataSources();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Data sources
          </DialogTitle>
          <DialogDescription>
            Manage your connected data sources
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading data sources...
            </div>
          ) : dataSources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data sources connected yet
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Connector Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataSources.map((dataSource) => (
                    <TableRow key={dataSource.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-green-600" />
                          {dataSource.name}
                        </div>
                      </TableCell>
                      <TableCell>Google Sheets</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(dataSource)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(dataSource)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(dataSource)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="flex justify-start border-t pt-4">
          <Button 
            variant="outline" 
            className="gap-2 text-primary"
            onClick={onAddNew}
          >
            <Plus className="h-4 w-4" />
            ADD A DATA SOURCE
          </Button>
        </div>
      </DialogContent>

      <EditMappingModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        dataSource={editingDataSource}
        onSuccess={handleEditSuccess}
      />

      <ViewDataModal
        open={isViewModalOpen}
        onOpenChange={setIsViewModalOpen}
        dataSource={viewingDataSource}
      />
    </Dialog>
  );
};
