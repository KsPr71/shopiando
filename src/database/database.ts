import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from '@/database/migrations';

let databasePromise: Promise<SQLiteDatabase> | undefined;

/** Opens the same database used by the provider for repositories and background sync. */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('shopiando.db').then(async (database) => {
      await migrateDatabase(database);
      return database;
    });
  }

  return databasePromise;
}
