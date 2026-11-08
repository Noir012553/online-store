import { Skeleton } from "./ui/skeleton";

export function ProductSkeleton() {
  return (
    <div className="bg-white border rounded-lg overflow-hidden flex flex-col min-h-[40rem] sm:min-h-[42rem]">
      <Skeleton className="aspect-square w-full" />
      <div className="flex flex-1 flex-col p-2 sm:p-3">
        <Skeleton className="mb-1 h-4 w-2/3 sm:h-5" />
        <Skeleton className="mb-2 h-16 w-full sm:h-20" />
        <div className="mb-2 flex h-4 items-center gap-2 sm:h-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="mb-3 min-h-20 space-y-1.5 sm:min-h-32">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="mb-2 h-10 w-full sm:h-12" />
        <Skeleton className="mt-auto h-10 w-full" />
      </div>
    </div>
  );
}

export function ProductSkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  );
}
