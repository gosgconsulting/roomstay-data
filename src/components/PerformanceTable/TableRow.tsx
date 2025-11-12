import { Fragment } from "react";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRowName, formatValue } from "@/lib/performanceTable/formatters";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { TableRow as TableRowType } from "@/hooks/performanceTable/usePerformanceTableData";
import type { FilterState } from "@/components/FiltersBar";

interface TableRowProps {
  row: TableRowType;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  dimensions: Dimension[];
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  filters: FilterState;
}

/**
 * Renders a single table row with expand/collapse functionality
 */
export function TableRow({
  row,
  isExpanded,
  hasChildren,
  onToggle,
  dimensions,
  visibleColumns,
  getOrderedDimensions,
  groupByDimensions,
  breakdownByDimensions,
  thenByDimensions,
  activeDateTab,
  filters,
}: TableRowProps) {
  return (
    <>
      <tr
        className={cn(
          "border-b hover:bg-muted/50 transition-colors cursor-pointer",
          row.level === 1 && "bg-muted/20",
          row.level === 2 && "bg-muted/10"
        )}
        onClick={hasChildren ? onToggle : undefined}
      >
        <td className="py-3 px-4" style={{ paddingLeft: `${row.level * 2 + 1}rem` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <div className="text-muted-foreground">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            ) : (
              <div className="w-4" />
            )}
            <span className={cn("font-medium", row.level > 0 && "font-normal")}>
              {formatRowName(
                row.name,
                row.level,
                groupByDimensions,
                breakdownByDimensions,
                thenByDimensions,
                dimensions,
                activeDateTab
              )}
            </span>
          </div>
        </td>
        {getOrderedDimensions()
          .filter(d => visibleColumns.has(d.id))
          .map((dimension) => {
            const value = row.data[dimension.name];
            const change = row.changeData?.[dimension.name];
            const hasComparison = filters.compareEnabled && change !== undefined;
            
            return (
              <td key={dimension.id} className="py-3 px-4 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span>{formatValue(value, dimension)}</span>
                  {hasComparison && (
                    <span className={cn(
                      "text-xs flex items-center gap-1",
                      change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground"
                    )}>
                      {change > 0 && <ArrowUp className="h-3 w-3" />}
                      {change < 0 && <ArrowDown className="h-3 w-3" />}
                      {change === 0 && <Minus className="h-3 w-3" />}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                  )}
                </div>
              </td>
            );
          })}
      </tr>
      {isExpanded &&
        row.children?.map((child) => (
          <Fragment key={child.id}>
            <TableRow
              row={child}
              isExpanded={false}
              hasChildren={!!(child.children && child.children.length > 0)}
              onToggle={() => {}}
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
        ))}
    </>
  );
}

