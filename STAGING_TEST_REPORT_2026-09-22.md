# Staging test report - 2026-09-22

Environment: `https://royalty-dashboard-staging.hung-hq197.workers.dev/`

Production was not changed or deployed. Tests used only synthetic data.

## Passed

- `npm test`: 30 unit tests and 13 contract tests passed.
- `npm run test:staging`: 13 public/unauthenticated smoke checks passed.
- Created one synthetic client, `STAGING-CLIENT-001`, with a non-routable test email. The account was left inactive and pending activation.
- Imported a 2026-Q3 statement with 2 rows, 1,500 units and VND 1,000,000 net revenue. Payment status defaulted to unpaid.
- Synced an update containing one matching business key and one new row. Result: 3 rows, 1,700 units and VND 1,150,000 net revenue. Preview and ledger agreed.
- Replaced the statement with a one-row file. Result: 1 row, 900 units and VND 900,000 net revenue. The ledger marked the amount as carried forward because it is below the VND 1,000,000 payment threshold.
- Rolled back the replacement. The statement returned to 3 rows, 1,700 units and VND 1,150,000 net revenue. Admin overview showed 1 client, 1 statement and the same revenue.

## Findings

1. The XLSX parser in `lib/xlsx-royalty-parser.ts` does not recognize worksheet XML with a valid namespace prefix such as `<x:row>` and `<x:c>`. Files exported by `@oai/artifact-tool` were rejected with "Khong tim thay sheet du lieu..." despite containing all required columns. The test continued with mechanically normalized copies of the same synthetic workbooks. Add parser coverage for prefixed OOXML tags before considering this case resolved.
2. In the replace preview, "Thuc nhan du kien" displayed VND 900,000, while the resulting ledger correctly carried VND 900,000 forward and showed no payment due. The preview wording/amount should distinguish net revenue from cash payable after the threshold.

## Not covered

- Customer login, OTP delivery to a real inbox, and cross-client isolation were not tested because the synthetic account has no real mailbox and was not activated.
- Payment confirmation, GM recoupment, rate rules, and PDF/Excel downloads were not exercised in this run.

The synthetic client and its Q3 statement remain on staging for review. No real customer data was used.
