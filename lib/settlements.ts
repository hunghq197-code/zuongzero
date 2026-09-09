export const SETTLEMENT_THRESHOLD_VND = 1_000_000;

export type SettlementStatus = 'paid' | 'carried_forward';

export type SettlementSummary = {
  carryForward: number;
  paidAmount: number;
  payable: number;
  status: SettlementStatus;
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
