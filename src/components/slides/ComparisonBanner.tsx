import { MONTH_NAMES } from "@/constants/slideViewConstants";

interface ComparisonBannerProps {
  selectedTab: string;
  comparisonType: string;
  selectedYear: string;
  selectedMonth: string;
}

export function ComparisonBanner({
  selectedTab,
  comparisonType,
  selectedYear,
  selectedMonth,
}: ComparisonBannerProps) {
  // Don't show on budget tab or when comparison is none
  if (selectedTab === "budget" || comparisonType === "none") {
    return null;
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
    </div>
  );
}
