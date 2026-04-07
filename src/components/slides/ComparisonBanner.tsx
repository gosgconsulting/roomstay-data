import { MONTH_NAMES } from "@/constants/slideViewConstants";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { buildComparisonDateRangeFromExact, exactDateRangeFromDayPicker } from "@/lib/monthUtils";

interface ComparisonBannerProps {
  selectedTab: string;
  comparisonType: string;
  selectedYear: string;
  selectedMonth: string;
  customDateRange?: DateRange;
}

export function ComparisonBanner({
  selectedTab,
  comparisonType,
  selectedYear,
  selectedMonth,
  customDateRange,
}: ComparisonBannerProps) {
  // Don't show on budget tab or when comparison is none
  if (selectedTab === "budget" || comparisonType === "none") {
    return null;
  }

  const customExactRange = exactDateRangeFromDayPicker(customDateRange);
  if (
    customExactRange &&
    (comparisonType === "previous_period" || comparisonType === "previous_year" || comparisonType === "previous_month")
  ) {
    const comparisonRange = buildComparisonDateRangeFromExact(customExactRange, comparisonType);
    const formatRange = (start: Date, end: Date) => {
      if (start.toDateString() === end.toDateString()) {
        return format(start, "MMM d, yyyy");
      }
      return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`;
    };

    return (
      <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
        <span>
          Comparing {formatRange(customExactRange.start, customExactRange.end)} vs{" "}
          {formatRange(comparisonRange.start, comparisonRange.end)}
        </span>
      </div>
    );
  }

  // Calculate previous period/year information
  const getPreviousPeriodInfo = () => {
    if (comparisonType === "previous_period") {
      if (selectedMonth !== 'all' && selectedYear !== 'all') {
        // Specific month selected - previous period is previous month
        const monthIndex = MONTH_NAMES.indexOf(selectedMonth);
        const year = parseInt(selectedYear);
        const currentDate = new Date(year, monthIndex, 1);
        const previousDate = new Date(year, monthIndex - 1, 1);
        const previousMonth = MONTH_NAMES[previousDate.getMonth()];
        const previousYear = previousDate.getFullYear();
        return { month: previousMonth, year: previousYear };
      } else if (selectedYear !== 'all') {
        // Year selected but all months - previous period is previous year
        const year = parseInt(selectedYear);
        return { month: null, year: year - 1 };
      }
      // All years and all months - can't determine specific previous period
      return { month: null, year: null };
    } else if (comparisonType === "previous_year") {
      if (selectedYear !== 'all') {
        const year = parseInt(selectedYear);
        return { month: selectedMonth !== 'all' ? selectedMonth : null, year: year - 1 };
      }
      return { month: null, year: null };
    } else if (comparisonType === "previous_month") {
      if (selectedMonth !== 'all' && selectedYear !== 'all') {
        const monthIndex = MONTH_NAMES.indexOf(selectedMonth);
        const year = parseInt(selectedYear);
        const previousDate = new Date(year, monthIndex - 1, 1);
        return { month: MONTH_NAMES[previousDate.getMonth()], year: previousDate.getFullYear() };
      }
      return { month: null, year: null };
    }
    return { month: null, year: null };
  };

  const prevInfo = getPreviousPeriodInfo();
  const currentPeriod = selectedYear !== 'all' 
    ? `${selectedYear}${selectedMonth !== 'all' ? ` ${selectedMonth}` : ''}`
    : (selectedMonth !== 'all' ? selectedMonth : 'Current Period');
  
  return (
    <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
      {comparisonType === "previous_period" && (
        <span>
          Comparing {currentPeriod} vs Previous Period
          {prevInfo.year !== null && (
            <span>
              {' '}({prevInfo.month ? `${prevInfo.month} ` : ''}{prevInfo.year})
            </span>
          )}
        </span>
      )}
      {comparisonType === "previous_year" && (
        <span>
          Comparing {currentPeriod} vs Previous Year
          {prevInfo.year !== null && (
            <span>
              {' '}({prevInfo.month ? `${prevInfo.month} ` : ''}{prevInfo.year})
            </span>
          )}
        </span>
      )}
      {comparisonType === "previous_month" && (
        <span>
          Comparing {currentPeriod} vs Previous Month
          {prevInfo.year !== null && (
            <span>
              {' '}({prevInfo.month ? `${prevInfo.month} ` : ''}{prevInfo.year})
            </span>
          )}
        </span>
      )}
    </div>
  );
}
