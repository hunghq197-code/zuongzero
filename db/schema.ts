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
    displayName: text('display_name'),
    role: text('role', {
      enum: ['super_admin', 'admin', 'client', 'auditor'],
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
