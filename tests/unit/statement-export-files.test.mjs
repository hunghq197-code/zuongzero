import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { strFromU8, unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';

import {
  buildDetailedStatementXlsx,
  buildStatementInvoicePdf,
} from '../../lib/statement-export-files.ts';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const previewDirectory = process.env.EXPORT_PREVIEW_DIR;

const sampleData = {
  breakdowns: [
    {
      dimension: 'source',
      label: 'Spotify',
      percentage: 62.5,
      rowCount: 1,
      units: 12500,
      value: 6250000,
    },
  ],
  clientCode: 'artist-001',
  clientName: 'Nghệ sĩ thử nghiệm',
  currency: 'VND',
  legalName: 'Công ty TNHH Âm nhạc Việt',
  lineItems: [
    {
      accountNo: 'artist-001',
      configuration: 'Stream',
      contentType: 'Track',
      contractName: 'Hợp đồng 01',
      currency: 'VND',
      distributionChannel: 'Digital',
      grossIncome: 10000000,
      isrc: 'VNA0A2600001',
      netPayable: 7000000,
      partner: 'Spotify',
      periodEndDate: '2026-09-30',
      releaseArtist: 'Nghệ sĩ thử nghiệm',
      releaseLabel: 'Zuong Zero',
      releaseTitle: 'Album mùa thu',
      royaltyRate: 70,
      sales: 12500,
      salesPeriod: '2026-08',
      sourceNetPayable: 6500000,
      sourceRoyaltyRate: 65,
      startDate: '2026-07-01',
      territory: 'VN',
      trackArtist: 'Nghệ sĩ thử nghiệm',
      trackTitle: 'Bài hát mùa thu',
      trackVersion: 'Bản gốc',
    },
  ],
  period: '2026-Q3',
  periodLabel: 'Quý 3/2026',
  publishedAt: '2026-09-22T02:00:00.000Z',
  reportPeriodId: 'period-001',
  settlement: {
    carryForward: 0,
    paidAt: null,
    paidAmount: 0,
    paymentStatus: 'unpaid',
    payable: 6300000,
  },
  statement: {
    grossRevenue: 10000000,
    netCosts: 700000,
    netRevenue: 7000000,
    openingBalance: 0,
    reservesReleased: 0,
    reservesWithheld: 0,
    rowCount: 1,
    units: 12500,
  },
};

const columns = [
  { key: 'accountNo', label: 'Account No.' },
  { key: 'trackTitle', label: 'Track Title' },
  { key: 'grossIncome', label: 'Gross Income' },
  { key: 'royaltyRate', label: 'Royalty Rate' },
  { key: 'netPayable', label: 'Net Payable' },
  { key: 'currency', label: 'Currency' },
];

test('detailed XLSX is a valid OOXML workbook and keeps uploaded values', () => {
  const workbook = buildDetailedStatementXlsx(sampleData, columns);
  if (previewDirectory) {
    mkdirSync(previewDirectory, { recursive: true });
    writeFileSync(
      join(previewDirectory, 'bao-cao-chi-tiet.xlsx'),
      workbook.body,
    );
  }
  const files = unzipSync(workbook.body);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);

  assert.equal(
    workbook.contentType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.ok(files['[Content_Types].xml']);
  assert.ok(files['xl/workbook.xml']);
  assert.match(sheet, /<autoFilter ref="A1:F2"\/>/);
  assert.match(sheet, /<pane ySplit="1"/);
  assert.match(sheet, /Bài hát mùa thu/);
  assert.match(sheet, /<v>65<\/v>/);
  assert.match(sheet, /<v>6500000<\/v>/);
  assert.doesNotMatch(sheet, /<v>7000000<\/v>/);
});

test('invoice PDF embeds Vietnamese text in one A4 page', async () => {
  const font = readFileSync(join(root, 'assets/fonts/Roboto-Vietnamese.ttf'));
  const bytes = await buildStatementInvoicePdf(sampleData, font);
  if (previewDirectory) {
    mkdirSync(previewDirectory, { recursive: true });
    writeFileSync(join(previewDirectory, 'bao-cao-doi-soat.pdf'), bytes);
  }
  const pdf = await PDFDocument.load(bytes);

  assert.equal(pdf.getPageCount(), 1);
  assert.ok(bytes.byteLength > 5_000);
  assert.equal(strFromU8(bytes.slice(0, 8)), '%PDF-1.7');
});
