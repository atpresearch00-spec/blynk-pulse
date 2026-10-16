import {sqliteTable,integer,text} from 'drizzle-orm/sqlite-core';
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
