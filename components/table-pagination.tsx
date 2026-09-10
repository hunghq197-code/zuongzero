'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

export const DASHBOARD_PAGE_SIZE = 10;

export type PaginatedRows<T> = {
  goToPage: (page: number) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  rangeEnd: number;
  rangeStart: number;
  totalRows: number;
  visibleRows: T[];
};

export function usePaginatedRows<T>(
  rows: T[],
  pageSize = DASHBOARD_PAGE_SIZE,
): PaginatedRows<T> {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(rows.length, safePage * pageSize);
  const visibleRows = useMemo(
    () => rows.slice(rangeStart > 0 ? rangeStart - 1 : 0, rangeEnd),
    [rangeEnd, rangeStart, rows],
  );

  return {
    goToPage(nextPage) {
      setPage(Math.min(Math.max(1, nextPage), pageCount));
    },
    page: safePage,
    pageCount,
    pageSize,
    rangeEnd,
    rangeStart,
    totalRows: rows.length,
    visibleRows,
  };
}

export function TablePagination({
  className,
  goToPage,
  itemLabel = 'dòng',
  page,
  pageCount,
  pageSize,
  rangeEnd,
  rangeStart,
  totalRows,
}: Omit<PaginatedRows<unknown>, 'visibleRows'> & {
  className?: string;
  itemLabel?: string;
}) {
  if (totalRows <= pageSize) {
    return null;
  }

  const pages = paginationWindow(page, pageCount);
  const previousDisabled = page <= 1;
  const nextDisabled = page >= pageCount;

  function changePage(
    event: React.MouseEvent<HTMLAnchorElement>,
    nextPage: number,
  ) {
    event.preventDefault();
    goToPage(nextPage);
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-3 py-3',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        Hiển thị{' '}
        <span className="font-medium text-foreground">
          {rangeStart}-{rangeEnd}
        </span>{' '}
        / {totalRows} {itemLabel}
      </p>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              aria-disabled={previousDisabled}
              className={
                previousDisabled ? 'pointer-events-none opacity-45' : ''
              }
              href="#"
              onClick={(event) => changePage(event, page - 1)}
              text="Trước"
            />
          </PaginationItem>
          {pages.map((pageNumber) => (
            <PaginationItem key={pageNumber}>
              <PaginationLink
                href="#"
                isActive={pageNumber === page}
                onClick={(event) => changePage(event, pageNumber)}
              >
                {pageNumber}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              aria-disabled={nextDisabled}
              className={nextDisabled ? 'pointer-events-none opacity-45' : ''}
              href="#"
              onClick={(event) => changePage(event, page + 1)}
              text="Sau"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function paginationWindow(page: number, pageCount: number) {
  const maxButtons = Math.min(5, pageCount);
  const start = Math.max(
    1,
    Math.min(page - Math.floor(maxButtons / 2), pageCount - maxButtons + 1),
  );

  return Array.from({ length: maxButtons }, (_, index) => start + index);
}
