import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the performance table
 */
export function TableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Table header skeleton */}
      <div className="overflow-x-auto">
        <div className="flex gap-4 border-b pb-3">
          <Skeleton className="h-6 w-32" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
      </div>
      {/* Table rows skeleton */}
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4 items-center">
            <Skeleton className="h-5 w-40" />
            {[...Array(5)].map((_, j) => (
              <Skeleton key={j} className="h-5 w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

