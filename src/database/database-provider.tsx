import { SQLiteProvider } from 'expo-sqlite';
import type { PropsWithChildren } from 'react';

import { initializeDatabase } from '@/database/database';

export function DatabaseProvider({ children }: PropsWithChildren) {
  return (
    <SQLiteProvider databaseName="shopiando.db" onInit={initializeDatabase} useSuspense>
      {children}
    </SQLiteProvider>
  );
}
