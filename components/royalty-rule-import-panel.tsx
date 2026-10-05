'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TablePagination,
  usePaginatedRows,
} from '@/components/table-pagination';
import type { RoyaltyRuleImportPreview } from '@/lib/royalty-rule-import';

export function RoyaltyRuleImportPanel({
  onImported,
}: {
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RoyaltyRuleImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const page = usePaginatedRows(
    preview?.rows ?? [],
    10,
    preview?.previewToken ?? file?.name ?? '',
  );

  async function downloadTemplate() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/royalty-rules/import', {
        credentials: 'same-origin',
      });
      if (!response.ok)
        throw new Error('Không thể tải mẫu. Hãy kiểm tra phiên đăng nhập.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'zuong-zero-track-rules.xlsx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Không thể tải mẫu.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(action: 'preview' | 'commit') {
    if (!file || busy) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    const body = new FormData();
    body.set('file', file);
    body.set('action', action);
    if (action === 'commit')
      body.set('previewToken', preview?.previewToken ?? '');
    try {
      const response = await fetch('/api/admin/royalty-rules/import', {
        method: 'POST',
        body,
        credentials: 'same-origin',
      });
      const result = (await response.json()) as {
        message?: string;
        preview?: RoyaltyRuleImportPreview;
      };
      if (!response.ok)
        throw new Error(
          result.message || `Không thể nhập file (${response.status}).`,
        );
      if (action === 'preview') {
        setPreview(result.preview ?? null);
      } else {
        setPreview(null);
        setFile(null);
        setInputKey((value) => value + 1);
        setMessage(result.message ?? 'Đã lưu danh sách.');
        await onImported();
      }
    } catch (error) {
      setPreview(null);
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : 'Không thể nhập file.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="min-w-0 border-b border-border pb-5"
      aria-labelledby="rule-import-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="flex items-center gap-2 text-lg font-semibold"
          id="rule-import-title"
        >
          <FileSpreadsheet className="size-5 text-primary" /> Gán bài hát từ
          Excel
        </h2>
        <Button
          variant="outline"
          onClick={() => void downloadTemplate()}
          disabled={busy}
        >
          <Download className="size-4" /> Tải file mẫu
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label
          htmlFor="royalty-rule-workbook"
          className="min-w-0 flex-1 space-y-2 text-sm font-medium"
        >
          <span>Danh sách bài hát và tỷ lệ (.xlsx)</span>
          <Input
            key={inputKey}
            id="royalty-rule-workbook"
            className="min-w-0"
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setMessage('');
            }}
          />
        </label>
        <Button disabled={!file || busy} onClick={() => void submit('preview')}>
          {busy ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}{' '}
          Xem trước
        </Button>
      </div>
      {message ? (
        <output
          className={`mt-3 block text-sm ${failed ? 'text-destructive' : 'text-primary'}`}
        >
          {message}
        </output>
      ) : null}
      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {preview.summary.create} tạo mới · {preview.summary.update} cập
              nhật · {preview.summary.unchanged} giữ nguyên
            </p>
            <Button
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label="Đóng xem trước"
              title="Đóng xem trước"
              onClick={() => setPreview(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          {preview.issues.length ? (
            <div
              role="alert"
              className="max-h-56 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <p className="font-semibold">
                {preview.issues.length} lỗi. Chưa nhập dòng nào.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {preview.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.sheet ? `${issue.sheet}, dòng ${issue.row}: ` : ''}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview.rows.length ? (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>Bài hát / ISRC</TableHead>
                      <TableHead>Tỷ lệ</TableHead>
                      <TableHead>Hiệu lực</TableHead>
                      <TableHead>Thay đổi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.visibleRows.map((row) => (
                      <TableRow key={`${row.sheet}:${row.row}`}>
                        <TableCell>
                          <span className="block font-medium">
                            {row.clientName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.customerAccountNo}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-64 break-words">
                            {row.trackTitle}
                          </span>
                          <span className="font-mono text-xs">{row.isrc}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.action === 'update' && row.previous
                            ? `${row.previous.royaltyRateBps / 100}% → `
                            : ''}
                          {row.royaltyRateBps / 100}%
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.effectiveFromPeriod} →{' '}
                          {row.effectiveToPeriod ?? 'Không giới hạn'}
                        </TableCell>
                        <TableCell>
                          {row.action === 'create'
                            ? 'Tạo mới'
                            : row.action === 'update'
                              ? 'Cập nhật'
                              : 'Giữ nguyên'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination {...page} itemLabel="bài hát" />
            </div>
          ) : null}
          <Button
            disabled={
              busy ||
              !preview.canCommit ||
              preview.summary.create + preview.summary.update === 0
            }
            onClick={() => void submit('commit')}
          >
            {busy ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}{' '}
            Xác nhận lưu tỷ lệ
          </Button>
        </div>
      ) : null}
    </section>
  );
}
