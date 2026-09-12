import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 17;

/** Creates the local, offline-first data store. Monetary values are integer cents. */
export async function migrateDatabase(database: SQLiteDatabase): Promise<void> {
  const result = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = result?.user_version ?? 0;

  if (version >= DATABASE_VERSION) {
    return;
  }

  if (version === 0) {
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS families (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS family_members (
        id TEXT PRIMARY KEY NOT NULL,
        family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (family_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL,
        family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT,
        unit TEXT NOT NULL DEFAULT 'unidad',
        reference_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (reference_price_cents >= 0),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_requests (
        id TEXT PRIMARY KEY NOT NULL,
        family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        requester_id TEXT NOT NULL REFERENCES profiles(id),
        assignee_id TEXT REFERENCES profiles(id),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'partially_delivered', 'delivered', 'cancelled')),
        notes TEXT,
        budget_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_total_cents >= 0),
        invoiced_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (invoiced_total_cents >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        delivered_at TEXT
      );

      CREATE TABLE IF NOT EXISTS purchase_request_items (
        id TEXT PRIMARY KEY NOT NULL,
        request_id TEXT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'unidad',
        quantity REAL NOT NULL CHECK (quantity > 0),
        estimated_unit_price_cents INTEGER NOT NULL CHECK (estimated_unit_price_cents >= 0),
        actual_unit_price_cents INTEGER CHECK (actual_unit_price_cents >= 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'purchased', 'delivered', 'cancelled')),
        purchased_at TEXT,
        delivered_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('families', 'profiles', 'family_members', 'products', 'purchase_requests', 'purchase_request_items', 'audit_events')),
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS products_by_family ON products(family_id, is_active);
      CREATE INDEX IF NOT EXISTS requests_by_assignee ON purchase_requests(assignee_id, status);
      CREATE INDEX IF NOT EXISTS items_by_request ON purchase_request_items(request_id, status);
      CREATE INDEX IF NOT EXISTS sync_queue_pending ON sync_queue(synced_at, created_at);
    `);

    version = 1;
  }

  if (version === 1) {
    await database.execAsync(`
      ALTER TABLE family_members RENAME TO family_members_legacy;
      CREATE TABLE family_members (
        id TEXT PRIMARY KEY NOT NULL,
        family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (family_id, user_id)
      );
      INSERT INTO family_members (id, family_id, user_id, role, created_at, updated_at)
      SELECT lower(hex(randomblob(16))), family_id, user_id, role, created_at, updated_at FROM family_members_legacy;
      DROP TABLE family_members_legacy;
    `);
    version = 2;
  }

  if (version === 2) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS local_profile_details (
        user_id TEXT PRIMARY KEY NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        birth_date TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        avatar_uri TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    version = 3;
  }

  if (version === 3) {
    await database.execAsync(`
      ALTER TABLE products ADD COLUMN image_uri TEXT;
    `);
    version = 4;
  }

  if (version === 4) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS product_catalog_cache (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        unit_type TEXT NOT NULL,
        package_quantity REAL NOT NULL,
        is_available INTEGER NOT NULL,
        image_url TEXT,
        synced_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS product_catalog_cache_by_category
        ON product_catalog_cache(category, is_available);
    `);
    version = 5;
  }

  if (version === 5) {
    await database.execAsync(`
      DELETE FROM purchase_request_items;
      DELETE FROM purchase_requests;
    `);
    version = 6;
  }

  if (version === 6) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS order_notifications (
        id TEXT PRIMARY KEY NOT NULL,
        recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        order_id TEXT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS order_notifications_by_recipient
        ON order_notifications(recipient_id, read_at, created_at DESC);
    `);
    version = 7;
  }

  if (version === 7) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS warehouse_cache (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        created_by TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS warehouse_item_cache (
        id TEXT PRIMARY KEY NOT NULL,
        warehouse_id TEXT NOT NULL,
        warehouse_name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        name TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        image_url TEXT,
        status TEXT NOT NULL,
        extracted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS warehouse_item_cache_by_owner
        ON warehouse_item_cache(owner_id, status, updated_at DESC);
    `);
    version = 8;
  }

  if (version === 8) {
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(local_profile_details)');
    if (!columns.some((column) => column.name === 'gender')) {
      await database.execAsync(`
        ALTER TABLE local_profile_details
        ADD COLUMN gender TEXT NOT NULL DEFAULT '';
      `);
    }
    version = 9;
  }

  if (version === 9) {
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(warehouse_item_cache)');
    if (!columns.some((column) => column.name === 'created_at')) {
      await database.execAsync("ALTER TABLE warehouse_item_cache ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
    }
    version = 10;
  }

  if (version === 10) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS purchase_order_sync_state (
        order_id TEXT PRIMARY KEY NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
        changed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS purchase_order_sync_state_by_changed_at
        ON purchase_order_sync_state(changed_at);
    `);
    version = 11;
  }

  if (version === 11) {
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(product_catalog_cache)');
    if (!columns.some((column) => column.name === 'supplier_id')) {
      await database.execAsync('ALTER TABLE product_catalog_cache ADD COLUMN supplier_id TEXT');
    }
    version = 12;
  }

  if (version === 12) {
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(purchase_request_items)');
    if (!columns.some((column) => column.name === 'supplier_name')) {
      await database.execAsync("ALTER TABLE purchase_request_items ADD COLUMN supplier_name TEXT NOT NULL DEFAULT ''");
    }
    version = 13;
  }

  if (version === 13) {
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(warehouse_item_cache)');
    if (!columns.some((column) => column.name === 'image_path')) {
      await database.execAsync('ALTER TABLE warehouse_item_cache ADD COLUMN image_path TEXT');
    }
    if (!columns.some((column) => column.name === 'image_url_expires_at')) {
      await database.execAsync('ALTER TABLE warehouse_item_cache ADD COLUMN image_url_expires_at TEXT');
    }
    version = 14;
  }

  if (version === 14) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT NOT NULL,
        preference_key TEXT NOT NULL,
        preference_value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, preference_key)
      );
    `);
    version = 15;
  }

  if (version === 15) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS supplier_cache (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        created_by TEXT NOT NULL,
        image_path TEXT,
        image_url TEXT,
        updated_at TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS supplier_cache_by_name ON supplier_cache(name);
    `);
    version = 16;
  }

  if (version === 16) {
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(purchase_requests)');
    if (!columns.some((column) => column.name === 'notes')) {
      await database.execAsync('ALTER TABLE purchase_requests ADD COLUMN notes TEXT');
    }
    version = 17;
  }

  await database.execAsync(`PRAGMA user_version = ${version}`);
}
