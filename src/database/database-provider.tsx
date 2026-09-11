import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { getDatabase } from '@/database/database';

const DatabaseReadyContext = createContext(false);

export function DatabaseProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    void getDatabase()
      .catch((error) => {
        console.warn('No se pudo inicializar la base de datos local.', error);
      })
      .finally(() => setIsReady(true));
  }, []);

  return <DatabaseReadyContext.Provider value={isReady}>{children}</DatabaseReadyContext.Provider>;
}

export function useDatabaseReady(): boolean {
  return useContext(DatabaseReadyContext);
}
