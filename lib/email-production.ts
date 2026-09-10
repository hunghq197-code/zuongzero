import { getEmailConfigStatus, type EmailRuntimeEnv } from '@/lib/email';

const RESEND_API_BASE = 'https://api.resend.com';
const DNS_QUERY_BASE = 'https://cloudflare-dns.com/dns-query';

export type EmailProductionRuntimeEnv = EmailRuntimeEnv & {
  APP_BASE_URL?: string;
};

export type EmailDnsRecordStatus =
  | 'not_started'
  | 'pending'
  | 'verified'
  | 'failed'
  | 'temporary_failure'
  | 'unknown';

export type EmailProductionStatus = {
  apiKeyConfigured: boolean;
  checkedAt: string;
  dmarc: {
    records: string[];
    status: 'present' | 'missing' | 'unknown';
  };
  fromAddress: string | null;
  fromConfigured: boolean;
  fromDomain: string | null;
  issues: string[];
  portalUrl: string;
  productionReady: boolean;
  resendDomain: {
    id: string;
    name: string;
    records: Array<{
      name: string;
      record: string;
      status: EmailDnsRecordStatus;
      type: string;
      value: string;
    }>;
    sending: string | null;
    status: string;
  } | null;
  resendReachable: boolean;
  sendingReady: boolean;
};

type ResendDomainListResponse = {
  data?: ResendDomainSummary[];
};

type ResendDomainSummary = {
  capabilities?: {
    receiving?: string;
    sending?: string;
  };
  id?: string;
  name?: string;
  status?: string;
};

type ResendDomainDetail = ResendDomainSummary & {
  records?: Array<{
    name?: string;
    record?: string;
    status?: string;
    type?: string;
    value?: string;
  }>;
};

export async function getEmailProductionStatus(
  runtimeEnv: EmailProductionRuntimeEnv,
): Promise<EmailProductionStatus> {
  const config = getEmailConfigStatus(runtimeEnv);
  const fromDomain = config.fromAddress
    ? config.fromAddress.split('@')[1]
    : null;
  const issues: string[] = [];
  let resendDomain: EmailProductionStatus['resendDomain'] = null;
  let resendReachable = false;

  if (!config.apiKeyConfigured) {
    issues.push('RESEND_API_KEY chưa được cấu hình.');
  }
  if (!config.fromConfigured) {
    issues.push('EMAIL_FROM chưa được cấu hình.');
  }
  if (config.fromConfigured && !config.fromAddress) {
    issues.push('EMAIL_FROM không đúng định dạng email gửi.');
  }

  if (config.apiKeyConfigured && fromDomain) {
    const domainResult = await readResendDomain(
      runtimeEnv.RESEND_API_KEY,
      fromDomain,
    );
    resendReachable = domainResult.reachable;
    if (domainResult.issue) issues.push(domainResult.issue);
    resendDomain = domainResult.domain;
  }

  if (fromDomain && !resendDomain && config.apiKeyConfigured) {
    issues.push(`Chưa tìm thấy domain ${fromDomain} trong Resend.`);
  }

  const dmarc = fromDomain
    ? await readDmarcRecords(fromDomain)
    : { records: [], status: 'unknown' as const };
  if (fromDomain && dmarc.status === 'missing') {
    issues.push(`Chưa tìm thấy DMARC cho ${fromDomain}.`);
  }

  const sendingReady =
    Boolean(config.apiKeyConfigured && config.fromAddress && resendDomain) &&
    resendDomain?.status === 'verified' &&
    resendDomain?.sending === 'enabled';
  const productionReady = sendingReady && dmarc.status === 'present';

  if (resendDomain && resendDomain.status !== 'verified') {
    issues.push(`Domain Resend đang ở trạng thái ${resendDomain.status}.`);
  }
  if (resendDomain && resendDomain.sending !== 'enabled') {
    issues.push('Sending capability trong Resend chưa enabled.');
  }

  return {
    apiKeyConfigured: config.apiKeyConfigured,
    checkedAt: new Date().toISOString(),
    dmarc,
    fromAddress: config.fromAddress,
    fromConfigured: config.fromConfigured,
    fromDomain,
    issues,
    portalUrl: portalUrl(runtimeEnv),
    productionReady,
    resendDomain,
    resendReachable,
    sendingReady,
  };
}

function portalUrl(runtimeEnv: EmailProductionRuntimeEnv) {
  const configured = runtimeEnv.APP_BASE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to production default.
    }
  }

  return 'https://artistportal.zuongzeroent.com';
}

async function readResendDomain(
  apiKey: string | undefined,
  fromDomain: string,
): Promise<{
  domain: EmailProductionStatus['resendDomain'];
  issue: string | null;
  reachable: boolean;
}> {
  if (!apiKey) {
    return {
      domain: null,
      issue: 'RESEND_API_KEY chưa được cấu hình.',
      reachable: false,
    };
  }

  try {
    const listResponse = await fetch(`${RESEND_API_BASE}/domains`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!listResponse.ok) {
      return {
        domain: null,
        issue: `Resend Domains API trả HTTP ${listResponse.status}.`,
        reachable: true,
      };
    }

    const listPayload = (await listResponse
      .json()
      .catch(() => null)) as ResendDomainListResponse | null;
    const domains = Array.isArray(listPayload?.data) ? listPayload.data : [];
    const exactDomain = domains.find(
      (domain) => domain.name?.toLowerCase() === fromDomain.toLowerCase(),
    );
    if (!exactDomain?.id || !exactDomain.name) {
      return {
        domain: null,
        issue: null,
        reachable: true,
      };
    }

    const detailResponse = await fetch(
      `${RESEND_API_BASE}/domains/${encodeURIComponent(exactDomain.id)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    const detail = detailResponse.ok
      ? ((await detailResponse
          .json()
          .catch(() => null)) as ResendDomainDetail | null)
      : null;
    const source = detail ?? exactDomain;

    return {
      domain: {
        id: exactDomain.id,
        name: exactDomain.name,
        records: Array.isArray(detail?.records)
          ? detail.records.map((record) => ({
              name: record.name ?? '',
              record: record.record ?? '',
              status: normalizeRecordStatus(record.status),
              type: record.type ?? '',
              value: record.value ?? '',
            }))
          : [],
        sending: source.capabilities?.sending ?? null,
        status: source.status ?? 'unknown',
      },
      issue: detailResponse.ok
        ? null
        : `Không đọc được chi tiết domain Resend (${detailResponse.status}).`,
      reachable: true,
    };
  } catch (error) {
    console.error('[email-production] failed to read Resend domain', error);
    return {
      domain: null,
      issue: 'Không kết nối được Resend Domains API.',
      reachable: false,
    };
  }
}

async function readDmarcRecords(domain: string) {
  try {
    const url = new URL(DNS_QUERY_BASE);
    url.searchParams.set('name', `_dmarc.${domain}`);
    url.searchParams.set('type', 'TXT');
    const response = await fetch(url, {
      headers: {
        Accept: 'application/dns-json',
      },
    });
    if (!response.ok) {
      return { records: [], status: 'unknown' as const };
    }

    const payload = (await response.json().catch(() => null)) as {
      Answer?: Array<{ data?: string }>;
    } | null;
    const records = (payload?.Answer ?? [])
      .map((answer) => answer.data ?? '')
      .filter((record) => record.toLowerCase().includes('v=dmarc1'));

    return {
      records,
      status: records.length > 0 ? ('present' as const) : ('missing' as const),
    };
  } catch (error) {
    console.error('[email-production] failed to read DMARC', error);
    return { records: [], status: 'unknown' as const };
  }
}

function normalizeRecordStatus(
  value: string | undefined,
): EmailDnsRecordStatus {
  if (
    value === 'not_started' ||
    value === 'pending' ||
    value === 'verified' ||
    value === 'failed' ||
    value === 'temporary_failure'
  ) {
    return value;
  }

  return 'unknown';
}
