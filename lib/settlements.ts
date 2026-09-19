export const SETTLEMENT_THRESHOLD_VND = 1_000_000;

export type SettlementStatus = 'paid' | 'carried_forward';
export type StatementPaymentStatus = 'unpaid' | 'paid';

export type SettlementSummary = {
  carryForward: number;
  paidAmount: number;
  payable: number;
  status: SettlementStatus;
};

export type StatementPaymentSummary = {
  paidAmount: number;
  status: StatementPaymentStatus;
};

export function summarizeSettlement({
  costs = 0,
  opening,
  reservesReleased = 0,
  reservesWithheld = 0,
  revenue,
}: {
  costs?: number;
  opening: number;
  reservesReleased?: number;
  reservesWithheld?: number;
  revenue: number;
}): SettlementSummary {
  const payable = roundMoney(
    opening + revenue - costs - reservesWithheld + reservesReleased,
  );
  const isPaid = payable >= SETTLEMENT_THRESHOLD_VND;

  return {
    carryForward: isPaid ? 0 : payable,
    paidAmount: isPaid ? payable : 0,
    payable,
    status: isPaid ? 'paid' : 'carried_forward',
  };
}

export function summarizeStatementPayment(
  settlement: SettlementSummary,
  paymentStatus: StatementPaymentStatus,
): StatementPaymentSummary {
  const status =
    settlement.status === 'paid' && paymentStatus === 'paid'
      ? 'paid'
      : 'unpaid';

  return {
    paidAmount: status === 'paid' ? settlement.payable : 0,
    status,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
