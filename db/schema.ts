import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    companyName: text('company_name'),
    displayName: text('display_name'),
    phone: text('phone'),
    role: text('role', {
      enum: ['super_admin', 'admin', 'client', 'auditor', 'pending'],
    }).notNull(),
    status: text('status', { enum: ['active', 'disabled'] }).notNull(),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at'),
  },
  (table) => [
    index('idx_users_role_status').on(table.role, table.status),
    index('idx_users_email').on(table.email),
  ],
);

export const clients = sqliteTable(
  'clients',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    legalName: text('legal_name').notNull(),
    displayName: text('display_name').notNull(),
    defaultCurrency: text('default_currency').notNull(),
    status: text('status', {
      enum: ['active', 'locked', 'archived'],
    }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_clients_status').on(table.status),
    index('idx_clients_code').on(table.code),
  ],
);

export const clientUsers = sqliteTable(
  'client_users',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    accessLevel: text('access_level', {
      enum: ['owner', 'viewer', 'finance', 'uploader'],
    }).notNull(),
    status: text('status', { enum: ['active', 'disabled'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_client_users_unique_client_user').on(
      table.clientId,
      table.userId,
    ),
    index('idx_client_users_client').on(table.clientId),
    index('idx_client_users_user').on(table.userId),
    index('idx_client_users_user_status').on(table.userId, table.status),
  ],
);

export const passwordCredentials = sqliteTable(
  'password_credentials',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    passwordHash: text('password_hash').notNull(),
    passwordUpdatedAt: text('password_updated_at').notNull(),
    mustChangePassword: integer('must_change_password', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_password_credentials_user').on(table.userId)],
);

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    userAgentHash: text('user_agent_hash'),
    ipHash: text('ip_hash'),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_auth_sessions_token_hash').on(table.tokenHash),
    index('idx_auth_sessions_user').on(table.userId),
    index('idx_auth_sessions_expires').on(table.expiresAt),
  ],
);

export const accountInvites = sqliteTable(
  'account_invites',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    purpose: text('purpose', {
      enum: ['account_activation', 'password_reset'],
    }).notNull(),
    status: text('status', {
      enum: ['pending', 'used', 'revoked'],
    }).notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_account_invites_token_hash').on(table.tokenHash),
    index('idx_account_invites_user_status').on(table.userId, table.status),
    index('idx_account_invites_email_status').on(table.email, table.status),
  ],
);

export const reportPeriods = sqliteTable(
  'report_periods',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    period: text('period').notNull(),
    currency: text('currency').notNull(),
    status: text('status', {
      enum: ['draft', 'validating', 'published', 'locked', 'replaced'],
    }).notNull(),
    publishedAt: text('published_at'),
    lockedAt: text('locked_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_report_periods_unique_client_period_currency').on(
      table.clientId,
      table.period,
      table.currency,
    ),
    index('idx_report_periods_client_period').on(table.clientId, table.period),
    index('idx_report_periods_status').on(table.status),
  ],
);

export const uploads = sqliteTable(
  'uploads',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    reportPeriodId: text('report_period_id')
      .notNull()
      .references(() => reportPeriods.id),
    uploadedByUserId: text('uploaded_by_user_id')
      .notNull()
      .references(() => users.id),
    originalFilename: text('original_filename').notNull(),
    objectKey: text('object_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status', {
      enum: ['uploaded', 'validated', 'imported', 'failed', 'quarantined'],
    }).notNull(),
    validationSummary: text('validation_summary'),
    replacedUploadId: text('replaced_upload_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_uploads_client_period').on(table.clientId, table.reportPeriodId),
    index('idx_uploads_status').on(table.status),
    index('idx_uploads_uploaded_by').on(table.uploadedByUserId),
  ],
);

export const statements = sqliteTable(
  'statements',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    reportPeriodId: text('report_period_id')
      .notNull()
      .references(() => reportPeriods.id),
    sourceUploadId: text('source_upload_id')
      .notNull()
      .references(() => uploads.id),
    openingBalance: real('opening_balance').notNull(),
    grossRevenue: real('gross_revenue').notNull(),
    netRevenue: real('net_revenue').notNull(),
    netCosts: real('net_costs').notNull(),
    reservesWithheld: real('reserves_withheld').notNull(),
    reservesReleased: real('reserves_released').notNull(),
    closingBalance: real('closing_balance').notNull(),
    units: integer('units').notNull().default(0),
    rowCount: integer('row_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_statements_client_period').on(
      table.clientId,
      table.reportPeriodId,
    ),
    index('idx_statements_source_upload').on(table.sourceUploadId),
  ],
);

export const revenueBreakdowns = sqliteTable(
  'revenue_breakdowns',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    reportPeriodId: text('report_period_id')
      .notNull()
      .references(() => reportPeriods.id),
    dimension: text('dimension', {
      enum: [
        'channel',
        'configuration',
        'territory',
        'source',
        'sub_source',
        'track',
        'artist',
        'release',
        'label',
      ],
    }).notNull(),
    label: text('label').notNull(),
    value: real('value').notNull(),
    percentage: real('percentage').notNull(),
    units: integer('units').notNull().default(0),
    rowCount: integer('row_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_breakdowns_client_period_dimension').on(
      table.clientId,
      table.reportPeriodId,
      table.dimension,
    ),
  ],
);

export const trackGuarantees = sqliteTable(
  'track_guarantees',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    trackTitle: text('track_title').notNull(),
    trackKey: text('track_key').notNull(),
    initialAmount: real('initial_amount').notNull(),
    recoupedAmount: real('recouped_amount').notNull().default(0),
    balanceAmount: real('balance_amount').notNull(),
    status: text('status', {
      enum: ['active', 'recouped', 'archived'],
    }).notNull(),
    notes: text('notes'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_track_guarantees_client_status').on(
      table.clientId,
      table.status,
    ),
    index('idx_track_guarantees_client_track').on(
      table.clientId,
      table.trackKey,
    ),
  ],
);

export const trackGuaranteeRecoupments = sqliteTable(
  'track_guarantee_recoupments',
  {
    id: text('id').primaryKey(),
    guaranteeId: text('guarantee_id')
      .notNull()
      .references(() => trackGuarantees.id),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    reportPeriodId: text('report_period_id')
      .notNull()
      .references(() => reportPeriods.id),
    sourceUploadId: text('source_upload_id')
      .notNull()
      .references(() => uploads.id),
    trackTitle: text('track_title').notNull(),
    revenueAmount: real('revenue_amount').notNull(),
    amount: real('amount').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_track_recoupments_guarantee').on(table.guaranteeId),
    index('idx_track_recoupments_client_period').on(
      table.clientId,
      table.reportPeriodId,
    ),
    index('idx_track_recoupments_upload').on(table.sourceUploadId),
  ],
);

export const accessRequests = sqliteTable(
  'access_requests',
  {
    id: text('id').primaryKey(),
    requesterUserId: text('requester_user_id')
      .notNull()
      .references(() => users.id),
    requesterEmail: text('requester_email').notNull(),
    requestType: text('request_type', {
      enum: ['client_access', 'admin_access'],
    }).notNull(),
    companyName: text('company_name'),
    clientCode: text('client_code'),
    contactName: text('contact_name'),
    reason: text('reason'),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
    }).notNull(),
    metadata: text('metadata'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_access_requests_requester').on(table.requesterUserId),
    index('idx_access_requests_status_created').on(
      table.status,
      table.createdAt,
    ),
    index('idx_access_requests_type_status').on(
      table.requestType,
      table.status,
    ),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    clientId: text('client_id').references(() => clients.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    ipHash: text('ip_hash'),
    metadata: text('metadata'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_audit_logs_client_created').on(table.clientId, table.createdAt),
    index('idx_audit_logs_actor_created').on(
      table.actorUserId,
      table.createdAt,
    ),
    index('idx_audit_logs_target').on(table.targetType, table.targetId),
  ],
);
