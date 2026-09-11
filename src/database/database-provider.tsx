import { useEffect, type PropsWithChildren } from 'react';

import { getDatabase } from '@/database/database';

export function DatabaseProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    void getDatabase().catch((error) => {
      console.warn('No se pudo inicializar la base de datos local.', error);
    });
  }, []);

  return children;
}
