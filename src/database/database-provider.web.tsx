import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';

type SQLiteProviderComponent = typeof import('expo-sqlite').SQLiteProvider;

export function DatabaseProvider({ children }: PropsWithChildren) {
  const [provider, setProvider] = useState<{
    SQLiteProvider: SQLiteProviderComponent;
    migrateDatabase: NonNullable<Parameters<SQLiteProviderComponent>[0]['onInit']>;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([import('expo-sqlite'), import('@/database/migrations')]).then(
      ([sqlite, migrations]) => {
        if (isMounted) {
          setProvider({
            SQLiteProvider: sqlite.SQLiteProvider,
            migrateDatabase: migrations.migrateDatabase,
          });
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, []);

  if (!provider) {
    return null;
  }

  const { SQLiteProvider, migrateDatabase } = provider;

  return (
    <SQLiteProvider databaseName="shopiando.db" onInit={migrateDatabase} useSuspense>
      {children}
    </SQLiteProvider>
  );
}
