import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from '@/database/migrations';

let databasePromise: Promise<SQLiteDatabase> | undefined;

async function prepareDatabase(database: SQLiteDatabase): Promise<SQLiteDatabase> {
  await database.execAsync('PRAGMA busy_timeout = 10000');
  await migrateDatabase(database);
  return database;
}

/** Registers the provider database so every service uses the same native connection. */
export async function initializeDatabase(database: SQLiteDatabase): Promise<void> {
  if (!databasePromise) {
    databasePromise = prepareDatabase(database);
  }
  await databasePromise;
}

/** Opens the same database used by the provider for repositories and background sync. */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('shopiando.db').then(prepareDatabase);
  }

  return databasePromise;
}
