import { strFromU8, unzipSync } from 'fflate';

import type {
  BreakdownItem,
  BreakdownKey,
  CurrencyBreakdowns,
  CurrencyCode,
} from '@/lib/dashboard-data';
import {
  breakdownKeys,
  createEmptyCurrencyBreakdowns,
} from '@/lib/royalty-breakdowns';
import type { StatementLineItem } from '@/lib/statement-line-items';

const BREAKDOWN_LIMIT = 12;

type SheetRow = {
  cells: string[];
  index: number;
};

type HeaderMap = Record<FieldKey, number | undefined>;

type FieldKey =
  | 'clientCode'
  | 'configuration'
  | 'contractName'
  | 'contentType'
  | 'currency'
  | 'distributionChannel'
  | 'grossIncome'
  | 'label'
  | 'netRevenue'
  | 'periodEndDate'
  | 'release'
  | 'releaseArtist'
  | 'royaltyRate'
  | 'salesPeriod'
  | 'source'
  | 'startDate'
  | 'subSource'
  | 'territory'
  | 'track'
  | 'trackExternalId'
  | 'trackVersion'
  | 'artist'
  | 'units';

type BreakdownAccumulator = {
  rows: number;
  units: number;
  value: number;
};

type CurrencyAccumulator = {
  breakdowns: Record<BreakdownKey, Map<string, BreakdownAccumulator>>;
  grossValue: number;
  lineItems: StatementLineItem[];
  rowCount: number;
  trackRevenue: Map<string, TrackRevenueAccumulator>;
  units: number;
  value: number;
};

type TrackRevenueAccumulator = BreakdownAccumulator & {
  trackExternalId: string | null;
  trackTitle: string;
};

export type ParsedTrackRevenue = {
  rows: number;
  trackExternalId: string | null;
  trackTitle: string;
  units: number;
  value: number;
};

export type ParsedCurrencyStatement = {
  breakdowns: CurrencyBreakdowns;
  currency: CurrencyCode;
  grossRevenue: number;
  lineItems: StatementLineItem[];
  revenue: number;
  rowCount: number;
  trackRevenue: ParsedTrackRevenue[];
  units: number;
};

export type ParsedClientStatementGroup = {
  clientCode: string;
  currencies: CurrencyCode[];
  rowCount: number;
  statements: ParsedCurrencyStatement[];
};

export type ParsedRoyaltyWorkbook = {
  clientStatements: ParsedClientStatementGroup[];
  currencies: CurrencyCode[];
  rowCount: number;
  statements: ParsedCurrencyStatement[];
  warnings: string[];
};

export type ParseRoyaltyWorkbookOptions = {
  groupByClientCode?: boolean;
};

const fieldAliases: Record<FieldKey, string[]> = {
  artist: ['artist', 'artistname', 'trackartist', 'trackartistname'],
  clientCode: [
    'clientid',
    'clientcode',
    'client',
    'customerid',
    'customercode',
    'customer',
    'account',
    'accountno',
    'accountnumber',
    'accountid',
    'vendorid',
    'makhachhang',
    'makh',
    'idkhachhang',
    'maartist',
  ],
  configuration: [
    'configuration',
    'config',
    'saleconfiguration',
    'usagetype',
    'royaltytype',
  ],
  contractName: ['contractname', 'contract', 'agreementname'],
  contentType: ['type', 'contenttype', 'assettype', 'titletype'],
  currency: ['currency', 'currencycode', 'ccy'],
  distributionChannel: [
    'distributionchannel',
    'channel',
    'distribution',
    'saleschannel',
  ],
  grossIncome: ['grossincome', 'grossrevenue', 'grossamount'],
  label: ['label', 'releaselabel', 'labelname'],
  netRevenue: [
    'netpayable',
    'netpayableamount',
    'netrevenue',
    'netroyalty',
    'payable',
    'amount',
    'royalty',
    'royalties',
    'earnings',
    'revenue',
  ],
  periodEndDate: ['periodenddate', 'enddate', 'periodend'],
  release: ['release', 'releasetitle', 'album', 'albumtitle', 'producttitle'],
  releaseArtist: ['releaseartist', 'albumartist', 'productartist'],
  royaltyRate: ['royaltyrate', 'rate', 'royaltypercentage'],
  salesPeriod: ['salesperiod', 'salemonth', 'reportingmonth'],
  source: ['source', 'store', 'platform', 'service', 'dsp', 'partner'],
  startDate: ['startdate', 'periodstartdate', 'periodstart'],
  subSource: ['subsource', 'subsources', 'substore', 'subplatform'],
  territory: ['territory', 'country', 'countrycode', 'region'],
  track: ['track', 'tracktitle', 'song', 'songtitle', 'title'],
  trackExternalId: ['isrc', 'trackid', 'songid', 'trackexternalid', 'idbaihat'],
  trackVersion: ['trackversion', 'version', 'mixversion'],
  units: ['units', 'unit', 'quantity', 'qty', 'streams', 'sales'],
};

const breakdownFields: Array<{ field: FieldKey; key: BreakdownKey }> = [
  { field: 'source', key: 'sources' },
  { field: 'subSource', key: 'subSources' },
  { field: 'distributionChannel', key: 'configurations' },
  { field: 'territory', key: 'territories' },
  { field: 'track', key: 'tracks' },
  { field: 'artist', key: 'artists' },
  { field: 'release', key: 'releases' },
  { field: 'label', key: 'labels' },
];

export function parseRoyaltyWorkbook(
  buffer: ArrayBuffer,
  options: ParseRoyaltyWorkbookOptions = {},
): ParsedRoyaltyWorkbook {
  const files = unzipSync(new Uint8Array(buffer));
  const sharedStrings = parseSharedStrings(
    readZipText(files, 'xl/sharedStrings.xml'),
  );
  const worksheetPaths = findWorksheetPaths(files);
  const clientAccumulators = new Map<
    string,
    Map<CurrencyCode, CurrencyAccumulator>
  >();
  const warnings = new Set<string>();
  let importedRowCount = 0;
  let sawUsableSheet = false;
  const groupByClientCode = Boolean(options.groupByClientCode);

  for (const worksheetPath of worksheetPaths) {
    const xml = readZipText(files, worksheetPath);
    if (!xml) continue;

    const rows = parseWorksheetRows(xml, sharedStrings);
    const parsedSheet = parseSheetRows(rows);
    if (!parsedSheet) continue;

    sawUsableSheet = true;
    if (groupByClientCode && parsedSheet.headers.clientCode === undefined) {
      throw new Error(
        'File tổng phải có cột Account No. / Mã khách hàng để hệ thống tự gom dữ liệu.',
      );
    }

    for (const row of parsedSheet.rows) {
      const amount = parseNumber(readCell(row, parsedSheet.headers.netRevenue));
      const units = parseNumber(readCell(row, parsedSheet.headers.units)) ?? 0;
      const rowHasText = row.cells.some((cell) => cell.trim());

      if (!rowHasText || amount === null) continue;

      const clientCode = groupByClientCode
        ? parseClientCode(readCell(row, parsedSheet.headers.clientCode))
        : 'single-client';
      if (!clientCode) {
        throw new Error(
          `Dòng ${row.index} thiếu mã khách hàng. Vui lòng bổ sung cột Account No. / Mã khách hàng.`,
        );
      }

      const currency = parseCurrency(
        readCell(row, parsedSheet.headers.currency),
      );
      if (!currency) {
        throw new Error(
          'File chỉ hỗ trợ VNĐ. Vui lòng xoá hoặc quy đổi các dòng ngoại tệ trước khi import.',
        );
      }

      const currencyAccumulators = getClientAccumulator(
        clientAccumulators,
        clientCode,
      );
      const accumulator = getCurrencyAccumulator(
        currencyAccumulators,
        currency,
      );
      accumulator.value += amount;
      const grossIncome = parseNumber(
        readCell(row, parsedSheet.headers.grossIncome),
      );
      accumulator.grossValue += grossIncome ?? amount;
      accumulator.units += Math.round(units);
      accumulator.rowCount += 1;
      importedRowCount += 1;
      const trackTitle = normalizeLabel(
        readCell(row, parsedSheet.headers.track),
      );
      const trackExternalId = normalizeOptionalLabel(
        readCell(row, parsedSheet.headers.trackExternalId),
      );
      accumulator.lineItems.push(
        buildStatementLineItem({
          amount,
          clientCode,
          currency,
          grossIncome,
          row,
          headers: parsedSheet.headers,
          units,
        }),
      );

      for (const breakdownField of breakdownFields) {
        const columnIndex =
          breakdownField.field === 'distributionChannel'
            ? (parsedSheet.headers.distributionChannel ??
              parsedSheet.headers.configuration)
            : parsedSheet.headers[breakdownField.field];
        if (columnIndex === undefined) {
          if (breakdownField.field !== 'subSource') {
            warnings.add(
              `Thiếu cột ${breakdownField.field}; chart liên quan sẽ trống.`,
            );
          }
          continue;
        }

        const label = normalizeLabel(
          breakdownField.field === 'distributionChannel'
            ? readCell(row, columnIndex)
            : readCell(row, columnIndex),
        );
        addBreakdownValue(
          accumulator.breakdowns[breakdownField.key],
          label,
          amount,
          Math.round(units),
        );

        if (breakdownField.key === 'tracks') {
          addTrackRevenueValue(
            accumulator.trackRevenue,
            trackTitle,
            trackExternalId,
            amount,
            Math.round(units),
          );
        }
      }
    }
  }

  if (!sawUsableSheet) {
    throw new Error(
      'Không tìm thấy sheet dữ liệu có đủ cột Net Payable và thông tin track/partner.',
    );
  }

  if (importedRowCount === 0) {
    throw new Error('File không có dòng doanh thu hợp lệ để import.');
  }

  const clientStatements = Array.from(clientAccumulators.entries())
    .map(([clientCode, accumulators]) => {
      const statements = Array.from(accumulators.entries())
        .map(([currency, accumulator]) => ({
          breakdowns: finalizeBreakdowns(accumulator),
          currency,
          grossRevenue: roundMoney(accumulator.grossValue),
          lineItems: accumulator.lineItems,
          revenue: roundMoney(accumulator.value),
          rowCount: accumulator.rowCount,
          trackRevenue: finalizeTrackRevenue(accumulator.trackRevenue),
          units: accumulator.units,
        }))
        .sort((left, right) => left.currency.localeCompare(right.currency));

      return {
        clientCode: groupByClientCode ? clientCode : '',
        currencies: statements.map((statement) => statement.currency),
        rowCount: statements.reduce(
          (total, statement) => total + statement.rowCount,
          0,
        ),
        statements,
      };
    })
    .sort((left, right) => left.clientCode.localeCompare(right.clientCode));
  const statements = clientStatements.flatMap((group) => group.statements);
  const currencies = Array.from(
    new Set(statements.map((statement) => statement.currency)),
  ).sort();

  return {
    clientStatements,
    currencies,
    rowCount: importedRowCount,
    statements,
    warnings: Array.from(warnings),
  };
}

export function stableBreakdownId(
  reportPeriodId: string,
  key: BreakdownKey,
  label: string,
) {
  const hash = fnv1a(`${reportPeriodId}:${key}:${label}`);
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);

  return `${reportPeriodId}:${key}:${slug || 'item'}:${hash}`;
}

function parseSheetRows(rows: SheetRow[]) {
  for (let index = 0; index < Math.min(rows.length, 80); index += 1) {
    const headers = mapHeaderRow(rows[index].cells);
    if (hasRequiredHeaders(headers)) {
      return {
        headers,
        rows: rows.slice(index + 1),
      };
    }
  }

  return null;
}

function hasRequiredHeaders(headers: HeaderMap) {
  const hasRevenue = headers.netRevenue !== undefined;
  const hasContext =
    headers.source !== undefined ||
    headers.territory !== undefined ||
    headers.track !== undefined ||
    headers.distributionChannel !== undefined ||
    headers.configuration !== undefined;

  return hasRevenue && hasContext;
}

function mapHeaderRow(cells: string[]) {
  const headers: HeaderMap = {
    artist: undefined,
    clientCode: undefined,
    configuration: undefined,
    contractName: undefined,
    contentType: undefined,
    currency: undefined,
    distributionChannel: undefined,
    grossIncome: undefined,
    label: undefined,
    netRevenue: undefined,
    periodEndDate: undefined,
    release: undefined,
    releaseArtist: undefined,
    royaltyRate: undefined,
    salesPeriod: undefined,
    source: undefined,
    startDate: undefined,
    subSource: undefined,
    territory: undefined,
    track: undefined,
    trackExternalId: undefined,
    trackVersion: undefined,
    units: undefined,
  };

  cells.forEach((cell, index) => {
    const normalizedHeader = normalizeHeader(cell);
    if (!normalizedHeader) return;

    for (const field of Object.keys(fieldAliases) as FieldKey[]) {
      if (
        headers[field] === undefined &&
        fieldAliases[field].includes(normalizedHeader)
      ) {
        headers[field] = index;
      }
    }
  });

  return headers;
}

function findWorksheetPaths(files: Record<string, Uint8Array>) {
  const workbookXml = readZipText(files, 'xl/workbook.xml');
  const relationshipXml = readZipText(files, 'xl/_rels/workbook.xml.rels');

  if (workbookXml && relationshipXml) {
    const relationships = new Map<string, string>();
    for (const relationshipTag of relationshipXml.matchAll(
      /<Relationship\b([^>]*)\/?>/g,
    )) {
      const attrs = parseAttributes(relationshipTag[1]);
      if (!attrs.Id || !attrs.Target) continue;
      relationships.set(attrs.Id, normalizeZipPath('xl', attrs.Target));
    }

    const sheetPaths: string[] = [];
    for (const sheetTag of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const attrs = parseAttributes(sheetTag[1]);
      const relationshipId = attrs['r:id'];
      const targetPath = relationshipId
        ? relationships.get(relationshipId)
        : undefined;
      if (targetPath && files[targetPath]) sheetPaths.push(targetPath);
    }

    if (sheetPaths.length > 0) return sheetPaths;
  }

  return Object.keys(files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
}

function parseSharedStrings(xml: string | null) {
  if (!xml) return [];

  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    strings.push(readRichText(match[1]));
  }

  return strings;
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  const rows: SheetRow[] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = parseAttributes(rowMatch[1]);
    const cells: string[] = [];
    let nextIndex = 0;

    for (const cellMatch of rowMatch[2].matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const cellAttrs = parseAttributes(cellMatch[1]);
      const columnIndex = cellAttrs.r ? cellRefToIndex(cellAttrs.r) : nextIndex;
      cells[columnIndex] = readCellValue(
        cellMatch[2] ?? '',
        cellAttrs.t,
        sharedStrings,
      );
      nextIndex = columnIndex + 1;
    }

    rows.push({
      cells,
      index: Number(rowAttrs.r) || rows.length + 1,
    });
  }

  return rows;
}

function readCellValue(
  xml: string,
  type: string | undefined,
  sharedStrings: string[],
) {
  if (type === 'inlineStr') {
    const inlineString = xml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
    return inlineString ? readRichText(inlineString[1]) : '';
  }

  const value = xml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';
  if (type === 's') {
    const sharedStringIndex = Number(value);
    return sharedStrings[sharedStringIndex] ?? '';
  }

  return decodeXml(value);
}

function readRichText(xml: string) {
  const parts = Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map(
    (match) => decodeXml(match[1]),
  );

  if (parts.length > 0) return parts.join('');
  return decodeXml(xml.replace(/<[^>]+>/g, ''));
}

function parseAttributes(source: string) {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(
    /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    attrs[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  }

  return attrs;
}

function cellRefToIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0] ?? 'A';
  return (
    letters
      .toUpperCase()
      .split('')
      .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
  );
}

function readZipText(files: Record<string, Uint8Array>, path: string) {
  const content = files[path];
  return content ? strFromU8(content) : null;
}

function normalizeZipPath(base: string, target: string) {
  const rawPath = target.startsWith('/')
    ? target.slice(1)
    : `${base}/${target}`;
  const parts: string[] = [];

  for (const part of rawPath.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}

function getCurrencyAccumulator(
  accumulators: Map<CurrencyCode, CurrencyAccumulator>,
  currency: CurrencyCode,
) {
  const existing = accumulators.get(currency);
  if (existing) return existing;

  const created: CurrencyAccumulator = {
    breakdowns: Object.fromEntries(
      breakdownKeys.map((key) => [
        key,
        new Map<string, BreakdownAccumulator>(),
      ]),
    ) as Record<BreakdownKey, Map<string, BreakdownAccumulator>>,
    grossValue: 0,
    lineItems: [],
    rowCount: 0,
    trackRevenue: new Map<string, TrackRevenueAccumulator>(),
    units: 0,
    value: 0,
  };
  accumulators.set(currency, created);

  return created;
}

function getClientAccumulator(
  accumulators: Map<string, Map<CurrencyCode, CurrencyAccumulator>>,
  clientCode: string,
) {
  const existing = accumulators.get(clientCode);
  if (existing) return existing;

  const created = new Map<CurrencyCode, CurrencyAccumulator>();
  accumulators.set(clientCode, created);
  return created;
}

function buildStatementLineItem({
  amount,
  clientCode,
  currency,
  grossIncome,
  headers,
  row,
  units,
}: {
  amount: number;
  clientCode: string;
  currency: CurrencyCode;
  grossIncome: number | null;
  headers: HeaderMap;
  row: SheetRow;
  units: number;
}): StatementLineItem {
  const accountNo =
    parseClientCode(readCell(row, headers.clientCode)) ||
    (clientCode === 'single-client' ? '' : clientCode);

  return {
    accountNo,
    configuration: normalizeOptionalLabel(readCell(row, headers.configuration)),
    contractName: normalizeOptionalLabel(readCell(row, headers.contractName)),
    contentType: normalizeOptionalLabel(readCell(row, headers.contentType)),
    currency,
    distributionChannel: normalizeOptionalLabel(
      readCell(row, headers.distributionChannel),
    ),
    grossIncome,
    isrc: normalizeOptionalLabel(readCell(row, headers.trackExternalId)),
    netPayable: roundMoney(amount),
    partner: normalizeOptionalLabel(readCell(row, headers.source)),
    periodEndDate: normalizeDateCell(readCell(row, headers.periodEndDate)),
    releaseArtist: normalizeOptionalLabel(readCell(row, headers.releaseArtist)),
    releaseLabel: normalizeOptionalLabel(readCell(row, headers.label)),
    releaseTitle: normalizeOptionalLabel(readCell(row, headers.release)),
    royaltyRate: parseNumber(readCell(row, headers.royaltyRate)),
    rowIndex: row.index,
    sales: units,
    salesPeriod: normalizeOptionalLabel(readCell(row, headers.salesPeriod)),
    startDate: normalizeDateCell(readCell(row, headers.startDate)),
    territory: normalizeOptionalLabel(readCell(row, headers.territory)),
    trackArtist: normalizeOptionalLabel(readCell(row, headers.artist)),
    trackTitle: normalizeOptionalLabel(readCell(row, headers.track)),
    trackVersion: normalizeOptionalLabel(readCell(row, headers.trackVersion)),
  };
}

function addBreakdownValue(
  target: Map<string, BreakdownAccumulator>,
  label: string,
  value: number,
  units: number,
) {
  const entry = target.get(label) ?? {
    rows: 0,
    units: 0,
    value: 0,
  };
  entry.rows += 1;
  entry.units += units;
  entry.value += value;
  target.set(label, entry);
}

function addTrackRevenueValue(
  target: Map<string, TrackRevenueAccumulator>,
  trackTitle: string,
  trackExternalId: string | null,
  value: number,
  units: number,
) {
  const key = trackExternalId
    ? `isrc:${normalizeLookupKey(trackExternalId)}`
    : `title:${normalizeLookupKey(trackTitle)}`;
  if (!key) return;

  const entry = target.get(key) ?? {
    rows: 0,
    trackExternalId,
    trackTitle,
    units: 0,
    value: 0,
  };
  entry.rows += 1;
  entry.units += units;
  entry.value += value;
  target.set(key, entry);
}

function finalizeBreakdowns(accumulator: CurrencyAccumulator) {
  const result = createEmptyCurrencyBreakdowns();

  for (const key of breakdownKeys) {
    result[key] = finalizeBreakdownItems(
      accumulator.breakdowns[key],
      accumulator.value,
    );
  }

  return result;
}

function finalizeBreakdownItems(
  source: Map<string, BreakdownAccumulator>,
  totalValue: number,
): BreakdownItem[] {
  const sorted = Array.from(source.entries()).sort(
    ([, left], [, right]) => Math.abs(right.value) - Math.abs(left.value),
  );
  const limited = sorted.slice(0, BREAKDOWN_LIMIT);
  const remaining = sorted.slice(BREAKDOWN_LIMIT);

  if (remaining.length > 0) {
    limited.push([
      'Others',
      remaining.reduce(
        (total, [, entry]) => ({
          rows: total.rows + entry.rows,
          units: total.units + entry.units,
          value: total.value + entry.value,
        }),
        { rows: 0, units: 0, value: 0 },
      ),
    ]);
  }

  const totalAbsValue = Math.abs(totalValue);
  return limited.map(([name, entry]) => ({
    name,
    percentage:
      totalAbsValue > 0
        ? roundPercentage((Math.abs(entry.value) / totalAbsValue) * 100)
        : 0,
    rows: entry.rows,
    units: entry.units,
    value: roundMoney(entry.value),
  }));
}

function finalizeTrackRevenue(
  source: Map<string, TrackRevenueAccumulator>,
): ParsedTrackRevenue[] {
  return Array.from(source.entries())
    .sort(([, left], [, right]) => Math.abs(right.value) - Math.abs(left.value))
    .map(([, entry]) => ({
      rows: entry.rows,
      trackExternalId: entry.trackExternalId,
      trackTitle: entry.trackTitle,
      units: entry.units,
      value: roundMoney(entry.value),
    }));
}

function readCell(row: SheetRow, index: number | undefined) {
  if (index === undefined) return '';
  return row.cells[index] ?? '';
}

function normalizeLabel(value: string) {
  const label = value.replace(/\s+/g, ' ').trim();
  return label || 'Unknown';
}

function normalizeOptionalLabel(value: string) {
  const label = value.replace(/\s+/g, ' ').trim();
  return label || null;
}

function normalizeDateCell(value: string) {
  const label = normalizeOptionalLabel(value);
  if (!label) return null;

  const isoLike = label.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoLike) {
    return [
      isoLike[1],
      isoLike[2].padStart(2, '0'),
      isoLike[3].padStart(2, '0'),
    ].join('-');
  }

  if (/^\d+(?:\.\d+)?$/.test(label)) {
    const serial = Number(label);
    if (Number.isFinite(serial) && serial >= 20_000 && serial <= 80_000) {
      return excelSerialDate(serial);
    }
  }

  return label;
}

function parseClientCode(value: string) {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseCurrency(value: string): CurrencyCode | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return 'VND';
  if (
    normalized.includes('VND') ||
    normalized.includes('VNĐ') ||
    normalized.includes('VIETNAM DONG')
  ) {
    return 'VND';
  }

  return null;
}

function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isNegative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
  let normalized = trimmed
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[^\d,.-]/g, '')
    .replace(/^-/, '');

  if (!normalized) return null;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = normalized
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.');
  } else if (lastComma >= 0) {
    normalized = normalizeSingleSeparatorNumber(normalized, ',');
  } else if (lastDot >= 0) {
    normalized = normalizeSingleSeparatorNumber(normalized, '.');
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;

  return isNegative ? -number : number;
}

function normalizeSingleSeparatorNumber(value: string, separator: ',' | '.') {
  const escapedSeparator = `\\${separator}`;
  const groups = value.split(separator);
  if (separator === '.') {
    if (groups.length === 2) return value;
    if (groups.slice(1).every((group) => group.length === 3)) {
      return value.replace(new RegExp(escapedSeparator, 'g'), '');
    }

    const decimalGroup = groups.pop() ?? '0';
    return `${groups.join('')}.${decimalGroup}`;
  }

  const lastGroup = groups.at(-1) ?? '';
  const looksDecimal = lastGroup.length > 0 && lastGroup.length <= 2;

  if (groups.length > 2 || !looksDecimal) {
    return value.replace(new RegExp(escapedSeparator, 'g'), '');
  }

  return value.replace(separator, '.');
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercentage(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function excelSerialDate(value: number) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const date = new Date(
    Date.UTC(1899, 11, 30) + Math.floor(value) * millisecondsPerDay,
  );
  return date.toISOString().slice(0, 10);
}

function normalizeLookupKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
}
