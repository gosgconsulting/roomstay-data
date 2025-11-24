import { Fragment, useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, X } from "lucide-react";
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
  totals: Record<string, number | string>;
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  filters: FilterState;
  onContextMenu: (e: React.MouseEvent, kpi: string) => void;
  onRowClick?: (row: TableRowType) => void;
  itemsPerPage?: number;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (dimensionName: string) => void;
  onResetSort?: () => void;
  showBudgetColumn?: boolean;
  isEditMode?: boolean;
  reportId?: string | null;
  accountId?: string | null;
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
  onRowClick,
  itemsPerPage = 50,
  sortColumn,
  sortDirection,
  onSort,
  onResetSort,
  showBudgetColumn = false,
  isEditMode = false,
  reportId = null,
  accountId = null,
}: TableBodyProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Reset to page 1 when sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sortColumn, sortDirection]);

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

  // NEW: formatter-compatible Budget dimension
  const budgetFormatDim = { id: 'virtual-budget', name: 'Budget', type: 'currency', formula: null };

  return (
    <>
      {sortColumn && onResetSort && (
        <div className="mb-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onResetSort}
            className="h-7 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Reset Sort
          </Button>
          <span className="text-xs text-muted-foreground">
            Sorted by: {sortColumn} ({sortDirection === 'asc' ? 'Lowest' : 'Highest'})
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-muted/30">
            <tr>
              <th
                className="py-3 px-4 text-left font-medium text-sm"
                onContextMenu={(e) => onContextMenu(e, "name")}
              >
                <span
                  className="block whitespace-normal break-words leading-tight max-w-[180px] sm:max-w-[220px] xl:max-w-[260px]"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {groupByDimensions[0] 
                    ? dimensions.find(d => d.id === groupByDimensions[0])?.name || "Name"
                    : "Name"}
                </span>
              </th>
              {showBudgetColumn && (
                <th
                  className="py-3 px-4 text-right font-medium text-sm"
                  onContextMenu={(e) => onContextMenu(e, "Budget")}
                >
                  <div className="flex items-center justify-end">
                    <span className="block leading-tight text-right">Budget</span>
                  </div>
                </th>
              )}
              {getOrderedDimensions()
                .filter(d => visibleColumns.has(d.id))
                .filter(d => !(showBudgetColumn && d.name === 'Budget'))
                .map((dimension) => {
                  const isSorted = sortColumn === dimension.name;
                  const isAsc = isSorted && sortDirection === 'asc';
                  const isDesc = isSorted && sortDirection === 'desc';
                  
                  return (
                    <th
                      key={dimension.id}
                      className={cn(
                        "py-3 px-4 text-right font-medium text-sm",
                        onSort && "cursor-pointer hover:bg-muted/50 transition-colors select-none"
                      )}
                      onClick={() => onSort?.(dimension.name)}
                      onContextMenu={(e) => onContextMenu(e, dimension.name)}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span
                          className="block whitespace-normal break-words leading-tight text-right max-w-[140px] sm:max-w-[180px] xl:max-w-[220px]"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                        >
                          {dimension.name}
                        </span>
                        {isDesc && <ArrowDown className="h-4 w-4" />}
                        {isAsc && <ArrowUp className="h-4 w-4" />}
                        {!isSorted && onSort && (
                          <span className="text-muted-foreground opacity-0 group-hover:opacity-100">
                            <ArrowDown className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
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
                    onRowClick={onRowClick}
                    expandedRows={expandedRows}
                    onToggleRow={toggleRow}
                    showBudgetColumn={showBudgetColumn}
                    isEditMode={isEditMode}
                    reportId={reportId}
                    accountId={accountId}
                  />
                </Fragment>
              );
            })}
            {/* Total row */}
            <tr className="border-t-2 border-primary/20 bg-muted/50 font-semibold">
              <td className="py-3 px-4">Total</td>
              {showBudgetColumn && (
                <td className="py-3 px-4 text-right">
                  <span>{formatValue(totals['Budget'] ?? 0, budgetFormatDim)}</span>
                </td>
              )}
              {getOrderedDimensions()
                .filter(d => visibleColumns.has(d.id))
                .filter(d => !(showBudgetColumn && d.name === 'Budget'))
                .map((dimension) => {
                  const value = totals[dimension.name];
                  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                  const isNegative = !isNaN(numValue) && numValue < 0;
                  
                  return (
                    <td key={dimension.id} className="py-3 px-4 text-right">
                      <span className={cn(isNegative && "text-red-600")}>
                        {formatValue(value, { ...dimension, formula: dimension.formula || null })}
                      </span>
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
                    <Fragment key={page} data-dyad-id={undefined}>
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