import type {
  ExportStatementFileData,
  ExportStatementLineItem,
  StatementWorkbookColumn,
} from '@/lib/statement-export-files';

type PdfExportPayload = {
  data: ExportStatementFileData;
  filename: string;
  kind: 'pdf';
};

type ExcelExportPayload = {
  columns: StatementWorkbookColumn[];
  filename: string;
  kind: 'excel';
  nextOffset: number | null;
  rows: ExportStatementLineItem[];
};

export async function downloadStatementExport(
  url: string,
  format: 'excel' | 'pdf',
) {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json, application/pdf, */*' },
  });
  if (!response.ok) throw await responseError(response);

  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    if (format !== 'excel') {
      throw new Error('Định dạng báo cáo trả về không hợp lệ.');
    }
    const filename = responseFilename(response) ?? 'chi-tiet.xlsx';
    saveBlob(await response.blob(), filename);
    return;
  }

  const payload = (await response.json()) as
    | PdfExportPayload
    | ExcelExportPayload;
  if (format === 'pdf' && payload.kind === 'pdf') {
    const [{ buildStatementInvoicePdf }, { default: fontDataUrl }] =
      await Promise.all([
        import('@/lib/statement-export-files'),
        import('@/assets/fonts/Roboto-Vietnamese.ttf?inline'),
      ]);
    const bytes = await buildStatementInvoicePdf(
      payload.data,
      decodeDataUrl(fontDataUrl),
    );
    saveBlob(
      new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' }),
      payload.filename,
    );
    return;
  }

  if (format === 'excel' && payload.kind === 'excel') {
    const rows = [...payload.rows];
    let offset = payload.nextOffset;
    while (offset !== null) {
      const pageUrl = new URL(url, window.location.origin);
      pageUrl.searchParams.set('offset', String(offset));
      const pageResponse = await fetch(pageUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!pageResponse.ok) throw await responseError(pageResponse);
      const page = (await pageResponse.json()) as ExcelExportPayload;
      if (
        page.kind !== 'excel' ||
        (page.nextOffset !== null && page.nextOffset <= offset)
      ) {
        throw new Error('Không thể đọc tiếp dữ liệu chi tiết.');
      }
      rows.push(...page.rows);
      offset = page.nextOffset;
    }
    const { buildDetailedStatementXlsx } =
      await import('@/lib/statement-export-files');
    const workbook = buildDetailedStatementXlsx(
      { lineItems: rows },
      payload.columns,
    );
    saveBlob(
      new Blob([toArrayBuffer(workbook.body)], {
        type: workbook.contentType,
      }),
      payload.filename,
    );
    return;
  }

  throw new Error('Định dạng báo cáo trả về không hợp lệ.');
}

async function responseError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message) {
      return new Error(payload.message);
    }
  } catch {
    // The server may return an HTML error page instead of JSON.
  }
  return new Error(`Không thể tải báo cáo (${response.status}).`);
}

function responseFilename(response: Response) {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      return null;
    }
  }
  return disposition.match(/filename="([^"]+)"/i)?.[1] ?? null;
}

function decodeDataUrl(value: string) {
  const encoded = value.includes(',')
    ? value.slice(value.indexOf(',') + 1)
    : value;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
