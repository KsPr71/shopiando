import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from '@/database/migrations';

let databasePromise: Promise<SQLiteDatabase> | undefined;
let operationQueue: Promise<void> = Promise.resolve();

function queueDatabaseOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
  const queuedOperation = operationQueue.then(operation, operation);
  operationQueue = queuedOperation.then(
    () => undefined,
    () => undefined,
  );
  return queuedOperation;
}

function serializeDatabaseOperations(database: SQLiteDatabase): SQLiteDatabase {
  return new Proxy(database, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string' || !property.endsWith('Async')) {
        return value;
      }

      return (...args: unknown[]) =>
        queueDatabaseOperation(() => value.apply(target, args));
    },
  }) as SQLiteDatabase;
}

async function prepareDatabase(database: SQLiteDatabase): Promise<SQLiteDatabase> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 10000;
  `);
  await migrateDatabase(database);
  return serializeDatabaseOperations(database);
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
