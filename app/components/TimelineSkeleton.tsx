'use client';

interface TimelineSkeletonProps {
  count?: number;
}

export default function TimelineSkeleton({ count = 3 }: TimelineSkeletonProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-1 rounded-full bg-neutral-200"></div>
        <div className="h-6 w-32 rounded bg-neutral-200 animate-pulse"></div>
        <div className="flex-1 h-px bg-neutral-100"></div>
      </div>

      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="card-elevated p-5 animate-pulse flex items-start gap-4"
        >
          <div className="flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-neutral-200"></div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="h-4 bg-neutral-200 rounded w-2/3"></div>
            <div className="h-4 bg-neutral-200 rounded w-full"></div>
            <div className="h-4 bg-neutral-200 rounded w-5/6"></div>
            <div className="flex gap-2">
              <span className="h-6 w-16 rounded-full bg-neutral-200"></span>
              <span className="h-6 w-16 rounded-full bg-neutral-200"></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
