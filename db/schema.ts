import {sqliteTable,integer,text,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const sharedDashboard=sqliteTable('shared_dashboard',{
  id:integer('id').primaryKey(),
  snapshot:text('snapshot').notNull(),
});
export const savedDevices=sqliteTable('saved_devices',{
  id:text('id').primaryKey(),
  name:text('name').notNull(),
  tokenCiphertext:text('token_ciphertext').notNull(),
  tokenHash:text('token_hash').notNull().unique(),
  metrics:text('metrics').notNull().default('{}'),
  snapshot:text('snapshot'),
  createdAt:integer('created_at').notNull(),
});
export const deviceSelection=sqliteTable('device_selection',{
  id:integer('id').primaryKey(),
  activeDeviceId:text('active_device_id').references(()=>savedDevices.id,{onDelete:'set null'}),
  selectionId:text('selection_id').notNull(),
  autoResume:integer('auto_resume',{mode:'boolean'}).notNull().default(true),
});
export const defrostCycles=sqliteTable('defrost_cycles',{
  id:text('id').primaryKey(),
  deviceKey:text('device_key').notNull(),
  startObservedAt:integer('start_observed_at').notNull(),
  endObservedAt:integer('end_observed_at'),
  lastObservedAt:integer('last_observed_at').notNull(),
  targetSeconds:integer('target_seconds'),
  partialStart:integer('partial_start',{mode:'boolean'}).notNull(),
  hasGaps:integer('has_gaps',{mode:'boolean'}).notNull().default(false),
},table=>[
  index('defrost_device_start_idx').on(table.deviceKey,table.startObservedAt),
  uniqueIndex('defrost_one_open_cycle').on(table.deviceKey).where(sql`${table.endObservedAt} IS NULL`),
]);
export const defrostState=sqliteTable('defrost_state',{
  deviceKey:text('device_key').primaryKey(),
  lastSignal:integer('last_signal'),
  lastFetchedAt:integer('last_fetched_at').notNull(),
});
