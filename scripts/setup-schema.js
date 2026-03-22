/**
 * PocketBase Schema Setup Script
 * Creates the alpr_records and duplicate_queue collections,
 * and configures the users collection for username auth.
 *
 * Usage: node scripts/setup-schema.js
 */

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@local.dev';
const ADMIN_PASS = process.env.PB_ADMIN_PASS || 'admin123456';

async function apiRequest(path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${PB_URL}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    console.error(`❌ ${method} ${path} → ${res.status}:`, data);
    throw new Error(`API error: ${res.status}`);
  }
  return data;
}

async function main() {
  console.log(`\n🔌 Connecting to PocketBase at ${PB_URL}...\n`);

  // 1. Authenticate as superuser
  const auth = await apiRequest('/api/superusers/auth-with-password', 'POST', {
    identity: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  const token = auth.token;
  console.log('✅ Authenticated as superuser\n');

  // 2. Check existing collections
  const existing = await apiRequest('/api/collections', 'GET', null, token);
  const existingNames = existing.items?.map(c => c.name) || existing.map?.(c => c.name) || [];

  // 3. Create alpr_records collection
  if (existingNames.includes('alpr_records')) {
    console.log('⏭️  alpr_records collection already exists, skipping...');
  } else {
    console.log('📦 Creating alpr_records collection...');
    await apiRequest('/api/collections', 'POST', {
      name: 'alpr_records',
      type: 'base',
      schema: [
        { name: 'plate',            type: 'text',   required: true, options: { maxLength: 10 } },
        { name: 'state',            type: 'text',   required: true, options: { maxLength: 2 } },
        { name: 'make',             type: 'text',   options: { maxLength: 50 } },
        { name: 'model',            type: 'text',   options: { maxLength: 50 } },
        { name: 'color',            type: 'select', options: { values: ['BR', 'GR', 'BK', 'BL', 'TN', 'SL', 'R', 'WH'] } },
        { name: 'ice',              type: 'select', options: { values: ['Y', 'N', 'HS'] } },
        { name: 'match',            type: 'select', options: { values: ['Y', 'N', ''] } },
        { name: 'registration',     type: 'text' },
        { name: 'vin',              type: 'text' },
        { name: 'title_issues',     type: 'text' },
        { name: 'notes',            type: 'text' },
        { name: 'location',         type: 'text' },
        { name: 'date',             type: 'date' },
        { name: 'plate_confidence', type: 'number' },
        { name: 'searchable',       type: 'bool',   options: {} },
      ],
      listRule: '@request.auth.id != "" && searchable = true',
      viewRule: '@request.auth.id != "" && searchable = true',
      createRule: null,  // Only admin/API can create
      updateRule: null,
      deleteRule: null,
    }, token);
    console.log('✅ alpr_records collection created');
  }

  // 4. Create duplicate_queue collection
  if (existingNames.includes('duplicate_queue')) {
    console.log('⏭️  duplicate_queue collection already exists, skipping...');
  } else {
    console.log('📦 Creating duplicate_queue collection...');
    await apiRequest('/api/collections', 'POST', {
      name: 'duplicate_queue',
      type: 'base',
      schema: [
        { name: 'raw_data',     type: 'json' },
        { name: 'reason',       type: 'text' },
        { name: 'status',       type: 'select', options: { values: ['pending', 'approved', 'rejected'] } },
        { name: 'import_batch', type: 'text' },
      ],
      listRule: null,  // Admin only
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    }, token);
    console.log('✅ duplicate_queue collection created');
  }

  // 5. Ensure users collection has a 'role' field for admin vs user distinction
  const usersCol = (existing.items || existing).find(c => c.name === 'users');
  if (usersCol) {
    const hasRole = usersCol.schema?.some(f => f.name === 'role');
    if (!hasRole) {
      console.log('📦 Adding role field to users collection...');
      const updatedSchema = [
        ...(usersCol.schema || []),
        { name: 'role', type: 'select', options: { values: ['user', 'admin'] } },
      ];
      await apiRequest(`/api/collections/${usersCol.id}`, 'PATCH', {
        schema: updatedSchema,
      }, token);
      console.log('✅ role field added to users collection');
    } else {
      console.log('⏭️  users.role field already exists, skipping...');
    }
  }

  console.log('\n🎉 Schema setup complete!\n');
  console.log('Collections created:');
  console.log('  - alpr_records (15 fields + searchable)');
  console.log('  - duplicate_queue (4 fields)');
  console.log('  - users (with role field)\n');
  console.log('Next steps:');
  console.log('  👤 Create a test user in the PocketBase Admin UI at http://127.0.0.1:8090/_/');
  console.log('  👤 Set the user\'s role to "user" or "admin"');
}

main().catch(err => {
  console.error('\n💥 Setup failed:', err.message);
  process.exit(1);
});
