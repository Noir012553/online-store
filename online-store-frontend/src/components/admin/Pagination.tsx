import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "../ui/button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 2;
    const startPage = Math.max(1, currentPage - showPages);
    const endPage = Math.min(totalPages, currentPage + showPages);

    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) {
        pages.push("...");
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push("...");
      }
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  return (
    <div className="p-6 border-t">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-600">
          Trang <span className="font-semibold text-gray-900">{currentPage}</span> của{" "}
          <span className="font-semibold text-gray-900">{totalPages}</span>
        </div>

        <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={isFirstPage}
            title="Trang đầu tiên"
            className="hidden sm:inline-flex h-9 w-9 p-0"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={isFirstPage}
            title="Trang trước"
            className="h-9 w-9 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex gap-1">
            {pageNumbers.map((page, index) => {
              if (page === "...") {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-2 py-2 text-gray-400 text-sm"
                  >
                    ⋯
                  </span>
                );
              }

              const pageNum = page as number;
              const isActive = pageNum === currentPage;

              return (
                <Button
                  key={pageNum}
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className={`h-9 w-9 p-0 transition-colors ${
                    isActive
                      ? "bg-red-600 hover:bg-red-700 text-white border-red-600"
                      : "hover:bg-gray-100"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={isLastPage}
            title="Trang sau"
            className="h-9 w-9 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={isLastPage}
            title="Trang cuối cùng"
            className="hidden sm:inline-flex h-9 w-9 p-0"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </div>
  );
}
