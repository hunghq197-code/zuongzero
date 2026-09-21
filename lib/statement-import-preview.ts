export type StatementImportPreviewCustomer = {
  clientCode: string;
  clientId: string;
  clientName: string;
  currentGrossRevenue: number;
  currentRevenue: number;
  currentRows: number;
  excelRows: number;
  guaranteeRecouped: number;
  mergeStats: {
    added: number;
    previous: number;
    total: number;
    unchanged: number;
    updated: number;
  } | null;
  nextGrossRevenue: number;
  nextPayable: number;
  nextRevenue: number;
  nextRows: number;
  revenueDelta: number;
  royaltyRuleRows: number;
  rowDelta: number;
  settlementStatus: 'carried_forward' | 'paid';
};

export type StatementImportPreview = {
  clientCount: number;
  customers: StatementImportPreviewCustomer[];
  destructive: boolean;
  filename: string;
  importStrategy: 'create' | 'replace' | 'sync';
  period: string;
  totals: {
    currentRevenue: number;
    currentRows: number;
    excelRows: number;
    guaranteeRecouped: number;
    nextGrossRevenue: number;
    nextPayable: number;
    nextRevenue: number;
    nextRows: number;
    revenueDelta: number;
    royaltyRuleRows: number;
    rowDelta: number;
  };
  uploadMode: 'bulk' | 'single';
  warnings: string[];
};

export async function createImportConfirmationToken({
  fileSha256,
  preview,
}: {
  fileSha256: string;
  preview: StatementImportPreview;
}) {
  const payload = JSON.stringify({ fileSha256, preview });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(payload),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function sumStatementImportPreview(
  customers: StatementImportPreviewCustomer[],
) {
  return customers.reduce<StatementImportPreview['totals']>(
    (total, customer) => ({
      currentRevenue: roundMoney(
        total.currentRevenue + customer.currentRevenue,
      ),
      currentRows: total.currentRows + customer.currentRows,
      excelRows: total.excelRows + customer.excelRows,
      guaranteeRecouped: roundMoney(
        total.guaranteeRecouped + customer.guaranteeRecouped,
      ),
      nextGrossRevenue: roundMoney(
        total.nextGrossRevenue + customer.nextGrossRevenue,
      ),
      nextPayable: roundMoney(total.nextPayable + customer.nextPayable),
      nextRevenue: roundMoney(total.nextRevenue + customer.nextRevenue),
      nextRows: total.nextRows + customer.nextRows,
      revenueDelta: roundMoney(total.revenueDelta + customer.revenueDelta),
      royaltyRuleRows: total.royaltyRuleRows + customer.royaltyRuleRows,
      rowDelta: total.rowDelta + customer.rowDelta,
    }),
    {
      currentRevenue: 0,
      currentRows: 0,
      excelRows: 0,
      guaranteeRecouped: 0,
      nextGrossRevenue: 0,
      nextPayable: 0,
      nextRevenue: 0,
      nextRows: 0,
      revenueDelta: 0,
      royaltyRuleRows: 0,
      rowDelta: 0,
    },
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
