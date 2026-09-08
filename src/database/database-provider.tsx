import { SQLiteProvider } from 'expo-sqlite';
import type { PropsWithChildren } from 'react';

import { migrateDatabase } from '@/database/migrations';

export function DatabaseProvider({ children }: PropsWithChildren) {
  return (
    <SQLiteProvider databaseName="shopiando.db" onInit={migrateDatabase} useSuspense>
      {children}
    </SQLiteProvider>
  );
}
