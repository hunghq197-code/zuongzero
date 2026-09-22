import fontkit from '@pdf-lib/fontkit';
import { strToU8, zipSync } from 'fflate';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type ExportStatementLineItem = {
  accountNo: string;
  configuration: string | null;
  contentType: string | null;
  contractName: string | null;
  currency: string;
  distributionChannel: string | null;
  grossIncome: number | null;
  isrc: string | null;
  netPayable: number;
  partner: string | null;
  periodEndDate: string | null;
  releaseArtist: string | null;
  releaseLabel: string | null;
  releaseTitle: string | null;
  royaltyRate: number | null;
  sales: number;
  salesPeriod: string | null;
  sourceNetPayable?: number | null;
  sourceRoyaltyRate?: number | null;
  startDate: string | null;
  territory: string | null;
  trackArtist: string | null;
  trackTitle: string | null;
  trackVersion: string | null;
};

export type ExportStatementFileData = {
  breakdowns: Array<{
    dimension: string;
    label: string;
    percentage: number;
    rowCount: number;
    units: number;
    value: number;
  }>;
  clientCode: string;
  clientName: string;
  currency: string;
  legalName: string;
  lineItems: ExportStatementLineItem[];
  period: string;
  periodLabel: string;
  publishedAt: string | null;
  reportPeriodId: string;
  settlement: {
    carryForward: number;
    paidAt: string | null;
    paidAmount: number;
    paymentStatus: 'paid' | 'unpaid';
    payable: number;
  };
  statement: {
    grossRevenue: number;
    netCosts: number;
    netRevenue: number;
    openingBalance: number;
    reservesReleased: number;
    reservesWithheld: number;
    rowCount: number;
    units: number;
  };
};

export type StatementWorkbookColumn = {
  key: keyof ExportStatementLineItem;
  label: string;
};

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const colors = {
  dark: rgb(0.035, 0.086, 0.11),
  gray: rgb(0.39, 0.45, 0.49),
  line: rgb(0.82, 0.87, 0.89),
  mint: rgb(0.9, 0.98, 0.97),
  paper: rgb(0.975, 0.985, 0.987),
  teal: rgb(0, 0.67, 0.63),
  white: rgb(1, 1, 1),
};

export function buildDetailedStatementXlsx(
  data: Pick<ExportStatementFileData, 'lineItems'>,
  columns: StatementWorkbookColumn[],
) {
  const rows = data.lineItems.map((item) =>
    columns.map((column) => sourceLineItemValue(item, column.key)),
  );
  const sheetXml = worksheetXml(
    columns.map((column) => column.label),
    rows,
  );
  const now = new Date().toISOString();
  const archive = zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypesXml()),
      '_rels/.rels': strToU8(rootRelationshipsXml()),
      'docProps/app.xml': strToU8(appPropertiesXml()),
      'docProps/core.xml': strToU8(corePropertiesXml(now)),
      'xl/_rels/workbook.xml.rels': strToU8(workbookRelationshipsXml()),
      'xl/styles.xml': strToU8(stylesXml()),
      'xl/workbook.xml': strToU8(workbookXml()),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    },
    { level: 6 },
  );

  return {
    body: archive,
    contentType: XLSX_CONTENT_TYPE,
  };
}

export async function buildStatementInvoicePdf(
  data: ExportStatementFileData,
  fontBytes: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.addPage([595.28, 841.89]);
  const pageWidth = page.getWidth();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const rightEdge = pageWidth - margin;
  const revenueReduction = Math.max(
    data.statement.grossRevenue - data.statement.netRevenue,
    0,
  );
  const quarterNet =
    data.statement.netRevenue -
    data.statement.netCosts -
    data.statement.reservesWithheld +
    data.statement.reservesReleased;
  const documentNumber = `ZZ-${safeDocumentPart(data.clientCode)}-${safeDocumentPart(data.period)}`;
  const issuedAt = formatDate(data.publishedAt ?? new Date().toISOString());

  page.drawRectangle({
    color: colors.teal,
    height: 12,
    width: pageWidth,
    x: 0,
    y: page.getHeight() - 12,
  });

  drawText(page, font, 'ZUONG ZERO', margin, 793, 10, colors.teal);
  drawText(
    page,
    font,
    'BÁO CÁO ĐỐI SOÁT BẢN QUYỀN',
    margin,
    766,
    19,
    colors.dark,
  );
  drawRightText(page, font, 'MÃ BÁO CÁO', rightEdge, 795, 8, colors.gray);
  drawRightText(page, font, documentNumber, rightEdge, 779, 10, colors.dark);
  drawRightText(
    page,
    font,
    `Ngày phát hành: ${issuedAt}`,
    rightEdge,
    762,
    8,
    colors.gray,
  );

  page.drawRectangle({
    borderColor: colors.line,
    borderWidth: 0.8,
    color: colors.paper,
    height: 76,
    width: contentWidth,
    x: margin,
    y: 666,
  });
  drawText(page, font, 'KHÁCH HÀNG', margin + 14, 724, 8, colors.gray);
  drawText(
    page,
    font,
    truncateText(font, data.clientName, 230, 13),
    margin + 14,
    704,
    13,
    colors.dark,
  );
  drawText(
    page,
    font,
    truncateText(font, data.legalName || data.clientName, 230, 9),
    margin + 14,
    685,
    9,
    colors.gray,
  );
  drawText(page, font, 'KỲ ĐỐI SOÁT', 345, 724, 8, colors.gray);
  drawText(page, font, data.periodLabel, 345, 704, 13, colors.dark);
  drawText(
    page,
    font,
    `Mã khách hàng: ${data.clientCode}`,
    345,
    685,
    9,
    colors.gray,
  );

  drawText(page, font, 'TỔNG KẾT TÀI CHÍNH', margin, 640, 9, colors.gray);
  const financialRows: Array<{
    accent?: boolean;
    label: string;
    value: number;
  }> = [
    { label: 'Tổng doanh thu', value: data.statement.grossRevenue },
    { label: 'Các khoản giảm trừ doanh thu', value: revenueReduction },
    { label: 'Doanh thu ròng', value: data.statement.netRevenue },
    { label: 'GM đã khấu trừ', value: data.statement.netCosts },
    { label: 'Dự phòng giữ lại', value: data.statement.reservesWithheld },
    { label: 'Dự phòng hoàn lại', value: data.statement.reservesReleased },
    { accent: true, label: 'Thực nhận trong quý', value: quarterNet },
    { label: 'Số dư đầu kỳ', value: data.statement.openingBalance },
    { label: 'Tổng phải trả', value: data.settlement.payable },
    { label: 'Đã thanh toán', value: data.settlement.paidAmount },
    { label: 'Chuyển kỳ sau', value: data.settlement.carryForward },
  ];
  let rowY = 616;
  for (const row of financialRows) {
    if (row.accent) {
      page.drawRectangle({
        color: colors.mint,
        height: 23,
        width: contentWidth,
        x: margin,
        y: rowY - 6,
      });
    }
    drawText(
      page,
      font,
      row.label,
      margin + 10,
      rowY,
      row.accent ? 10 : 9,
      row.accent ? colors.dark : colors.gray,
    );
    drawRightText(
      page,
      font,
      formatMoney(row.value, data.currency),
      rightEdge - 10,
      rowY,
      row.accent ? 11 : 9,
      row.accent ? colors.teal : colors.dark,
    );
    page.drawLine({
      color: colors.line,
      end: { x: rightEdge, y: rowY - 8 },
      start: { x: margin, y: rowY - 8 },
      thickness: row.accent ? 0 : 0.45,
    });
    rowY -= 23;
  }

  const statusPaid = data.settlement.paymentStatus === 'paid';
  page.drawRectangle({
    borderColor: statusPaid ? colors.teal : colors.line,
    borderWidth: 0.8,
    color: statusPaid ? colors.mint : colors.paper,
    height: 58,
    width: contentWidth,
    x: margin,
    y: 286,
  });
  drawText(
    page,
    font,
    'TRẠNG THÁI THANH TOÁN',
    margin + 14,
    324,
    8,
    colors.gray,
  );
  drawText(
    page,
    font,
    statusPaid ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN',
    margin + 14,
    303,
    12,
    statusPaid ? colors.teal : colors.dark,
  );
  drawRightText(
    page,
    font,
    statusPaid && data.settlement.paidAt
      ? `Ngày thanh toán: ${formatDate(data.settlement.paidAt)}`
      : 'Chờ xác nhận chuyển khoản',
    rightEdge - 14,
    304,
    9,
    colors.gray,
  );

  drawText(page, font, 'THỐNG KÊ DỮ LIỆU', margin, 261, 9, colors.gray);
  const metricWidth = (contentWidth - 12) / 2;
  drawMetric(
    page,
    font,
    margin,
    205,
    metricWidth,
    'Lượt khai thác',
    formatInteger(data.statement.units),
  );
  drawMetric(
    page,
    font,
    margin + metricWidth + 12,
    205,
    metricWidth,
    'Dòng dữ liệu',
    formatInteger(data.statement.rowCount),
  );

  const leadingBreakdowns = preferredBreakdowns(data.breakdowns).slice(0, 3);
  drawText(page, font, 'NGUỒN DOANH THU NỔI BẬT', margin, 183, 9, colors.gray);
  if (leadingBreakdowns.length === 0) {
    drawText(
      page,
      font,
      'Chưa có dữ liệu phân bổ cho kỳ này.',
      margin,
      162,
      9,
      colors.gray,
    );
  } else {
    let breakdownY = 162;
    for (const item of leadingBreakdowns) {
      drawText(
        page,
        font,
        truncateText(font, item.label, 260, 9),
        margin,
        breakdownY,
        9,
        colors.dark,
      );
      drawRightText(
        page,
        font,
        `${formatMoney(item.value, data.currency)}  •  ${formatPercent(item.percentage)}`,
        rightEdge,
        breakdownY,
        9,
        colors.gray,
      );
      breakdownY -= 18;
    }
  }

  page.drawLine({
    color: colors.line,
    end: { x: rightEdge, y: 76 },
    start: { x: margin, y: 76 },
    thickness: 0.65,
  });
  drawText(
    page,
    font,
    'Báo cáo này được tạo từ dữ liệu đối soát đã lưu trên Zuong Zero Artist Portal.',
    margin,
    56,
    7.5,
    colors.gray,
  );
  drawText(page, font, 'Đơn vị tiền tệ: VND', margin, 42, 7.5, colors.gray);
  drawRightText(page, font, 'Trang 1 / 1', rightEdge, 42, 7.5, colors.gray);

  return pdf.save({ useObjectStreams: false });
}

function sourceLineItemValue(
  item: ExportStatementLineItem,
  key: keyof ExportStatementLineItem,
) {
  if (key === 'netPayable') {
    return item.sourceNetPayable ?? item.netPayable;
  }
  if (key === 'royaltyRate') {
    return item.sourceRoyaltyRate ?? item.royaltyRate;
  }
  return item[key];
}

function worksheetXml(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const lastColumn = columnName(headers.length);
  const headerCells = headers
    .map((header, index) => inlineStringCell(index + 1, 1, header, 1))
    .join('');
  const dataRows = rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 2;
      const cells = row
        .map((value, columnIndex) => {
          const key = headers[columnIndex] ?? '';
          const style = numericStyle(key);
          return typeof value === 'number' && Number.isFinite(value)
            ? numberCell(columnIndex + 1, excelRow, value, style)
            : inlineStringCell(
                columnIndex + 1,
                excelRow,
                String(value ?? ''),
                0,
              );
        })
        .join('');
      return `<row r="${excelRow}">${cells}</row>`;
    })
    .join('');
  const columns = headers
    .map((header, index) => {
      const width = Math.min(Math.max(header.length + 4, 12), 28);
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData><row r="1" ht="24" customHeight="1">${headerCells}</row>${dataRows}</sheetData>
  <autoFilter ref="A1:${lastColumn}${Math.max(rows.length + 1, 1)}"/>
</worksheet>`;
}

function inlineStringCell(
  column: number,
  row: number,
  value: string,
  style: number,
) {
  return `<c r="${columnName(column)}${row}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function numberCell(column: number, row: number, value: number, style: number) {
  return `<c r="${columnName(column)}${row}" s="${style}"><v>${value}</v></c>`;
}

function numericStyle(header: string) {
  if (header === 'Sales') return 3;
  if (header === 'Royalty Rate') return 4;
  if (header === 'Gross Income' || header === 'Net Payable') return 2;
  return 0;
}

function columnName(index: number) {
  let value = index;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name || 'A';
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Chi tiết" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function workbookRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
    <numFmt numFmtId="165" formatCode="#,##0"/>
    <numFmt numFmtId="166" formatCode="0.00"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos Display"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF007F7A"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD8E1E4"/></left><right style="thin"><color rgb="FFD8E1E4"/></right><top style="thin"><color rgb="FFD8E1E4"/></top><bottom style="thin"><color rgb="FFD8E1E4"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function corePropertiesXml(now: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Zuong Zero Artist Portal</dc:creator><cp:lastModifiedBy>Zuong Zero Artist Portal</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(now)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xmlEscape(now)}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Zuong Zero Artist Portal</Application><AppVersion>1.0</AppVersion>
</Properties>`;
}

function drawMetric(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
) {
  page.drawRectangle({
    borderColor: colors.line,
    borderWidth: 0.7,
    color: colors.paper,
    height: 44,
    width,
    x,
    y,
  });
  drawText(page, font, label.toUpperCase(), x + 12, y + 28, 7.5, colors.gray);
  drawText(page, font, value, x + 12, y + 10, 12, colors.dark);
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(text, { color, font, size, x, y });
}

function drawRightText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  right: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(text, {
    color,
    font,
    size,
    x: right - font.widthOfTextAtSize(text, size),
    y,
  });
}

function truncateText(
  font: PDFFont,
  value: string,
  maxWidth: number,
  size: number,
) {
  const text = value.trim() || '-';
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let output = text;
  while (
    output.length > 1 &&
    font.widthOfTextAtSize(`${output}…`, size) > maxWidth
  ) {
    output = output.slice(0, -1);
  }
  return `${output.trim()}…`;
}

function preferredBreakdowns(data: ExportStatementFileData['breakdowns']) {
  const preferred = data.filter((item) => item.dimension === 'source');
  const fallback = data.filter((item) => item.dimension === 'track');
  return (preferred.length ? preferred : fallback).sort(
    (left, right) => Math.abs(right.value) - Math.abs(left.value),
  );
}

function formatMoney(value: number, currency: string) {
  const amount = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(amount))} ${currency === 'VND' ? 'đ' : currency}`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(
    Math.round(Number.isFinite(value) ? value : 0),
  );
}

function formatPercent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(date);
}

function safeDocumentPart(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'statement'
  );
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
