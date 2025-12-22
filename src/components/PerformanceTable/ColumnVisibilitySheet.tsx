import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface ColumnVisibilitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimensions: any[];
  visibleColumns: Set<string>;
  onVisibilityChange: (columns: Set<string>) => void;
}

export const ColumnVisibilitySheet: React.FC<ColumnVisibilitySheetProps> = ({
  open,
  onOpenChange,
  dimensions,
  visibleColumns,
  onVisibilityChange
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Column Visibility</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <p>Configure which columns are visible in the table.</p>
          {/* Add column visibility controls here */}
        </div>
      </SheetContent>
    </Sheet>
  );
};