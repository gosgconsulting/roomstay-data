import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { formatValue } from "@/lib/performanceTable/formatters";
import { TableRow } from "./TableRow";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { TableRow as TableRowType } from "@/hooks/performanceTable/usePerformanceTableData";
import type { FilterState } from "@/components/FiltersBar";

interface TableBodyProps {
  filteredTableData: TableRowType[];
  dimensions: Dimension[];
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  totals: Record<string, any>;
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  filters: FilterState;
  onContextMenu: (e: React.MouseEvent, kpi: string) => void;
  itemsPerPage?: number;
}

/**
 * Table body component with pagination
 */
export function TableBody({
  filteredTableData,
  dimensions,
  visibleColumns,
  getOrderedDimensions,
  totals,
  groupByDimensions,
  breakdownByDimensions,
  thenByDimensions,
  activeDateTab,
  filters,
  onContextMenu,
  itemsPerPage = 50,
}: TableBodyProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  };

  // Paginate data
  const paginatedData = filteredTableData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-muted/30">
            <tr>
              <th
                className="py-3 px-4 text-left font-medium text-sm"
                onContextMenu={(e) => onContextMenu(e, "name")}
              >
                {groupByDimensions[0] 
                  ? dimensions.find(d => d.id === groupByDimensions[0])?.name || "Name"
                  : "Name"}
              </th>
              {getOrderedDimensions()
                .filter(d => visibleColumns.has(d.id))
                .map((dimension) => (
                  <th
                    key={dimension.id}
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => onContextMenu(e, dimension.name)}
                  >
                    {dimension.name}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row) => {
              const isExpanded = expandedRows.has(row.id);
              const hasChildren = !!(row.children && row.children.length > 0);
              
              return (
                <Fragment key={row.id}>
                  <TableRow
                    row={row}
                    isExpanded={isExpanded}
                    hasChildren={hasChildren}
                    onToggle={() => toggleRow(row.id)}
                    dimensions={dimensions}
                    visibleColumns={visibleColumns}
                    getOrderedDimensions={getOrderedDimensions}
                    groupByDimensions={groupByDimensions}
                    breakdownByDimensions={breakdownByDimensions}
                    thenByDimensions={thenByDimensions}
                    activeDateTab={activeDateTab}
                    filters={filters}
                  />
                </Fragment>
              );
            })}
            {/* Total row */}
            <tr className="border-t-2 border-primary/20 bg-muted/50 font-semibold">
              <td className="py-3 px-4">Total</td>
              {getOrderedDimensions()
                .filter(d => visibleColumns.has(d.id))
                .map((dimension) => {
                  const value = totals[dimension.name];
                  
                  return (
                    <td key={dimension.id} className="py-3 px-4 text-right">
                      <span>{formatValue(value, dimension)}</span>
                    </td>
                  );
                })}
            </tr>
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredTableData.length)} of{" "}
            {filteredTableData.length} rows
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  className={cn(
                    currentPage === 1 && "pointer-events-none opacity-50",
                    "cursor-pointer"
                  )}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first page, last page, current page, and pages around current
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  );
                })
                .map((page, index, array) => {
                  // Add ellipsis if there's a gap
                  const prevPage = array[index - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;
                  
                  return (
                    <Fragment key={page}>
                      {showEllipsis && (
                        <PaginationItem key={`ellipsis-${page}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    </Fragment>
                  );
                })}
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  className={cn(
                    currentPage === totalPages && "pointer-events-none opacity-50",
                    "cursor-pointer"
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  );
}

