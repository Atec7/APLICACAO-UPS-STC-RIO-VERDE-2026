const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'ups.db');
let db;
let dbReady = false;

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.error('Erro ao salvar DB:', e.message);
  }
}

function dbAll(sql, params) {
  if (params && params.length > 0) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
  const result = db.exec(sql);
  if (result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map(v => {
    const obj = {};
    cols.forEach((c, i) => { obj[c] = v[i]; });
    return obj;
  });
}

function dbGet(sql, params) {
  const rows = dbAll(sql, params || []);
  return rows.length > 0 ? rows[0] : undefined;
}

function dbRun(sql, params) {
  db.run(sql, params || []);
  saveDb();
  return { changes: db.getRowsModified(), lastInsertRowid: parseInt(db.exec('SELECT last_insert_rowid()')[0].values[0][0]) };
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'equipe',
    latitude TEXT DEFAULT '',
    longitude TEXT DEFAULT '',
    last_seen DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS catalog_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ups_value REAL DEFAULT 0,
    money_value REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service_name TEXT NOT NULL,
    ups_value REAL DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    ups_per_unit REAL DEFAULT 0,
    money_per_unit REAL DEFAULT 0,
    total_money REAL DEFAULT 0,
    grade REAL DEFAULT 0,
    latitude TEXT DEFAULT '',
    longitude TEXT DEFAULT '',
    catalog_service_id INTEGER DEFAULT NULL,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class TEXT NOT NULL,
    min_ups REAL DEFAULT 0,
    max_ups REAL DEFAULT 9999,
    color TEXT DEFAULT '#94a3b8'
  )`);

  const adminCount = dbGet('SELECT COUNT(*) as c FROM users WHERE username = ?', ['admin']);
  if (adminCount.c === 0) {
    dbRun('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', 'admin123', 'admin']);
  }

  const ruleCount = dbGet('SELECT COUNT(*) as c FROM rules');
  if (ruleCount.c === 0) {
    dbRun('INSERT INTO rules (class, min_ups, max_ups, color) VALUES (?, ?, ?, ?)', ['A', 42, 9999, '#2ecc71']);
    dbRun('INSERT INTO rules (class, min_ups, max_ups, color) VALUES (?, ?, ?, ?)', ['B', 31, 41, '#3498db']);
    dbRun('INSERT INTO rules (class, min_ups, max_ups, color) VALUES (?, ?, ?, ?)', ['C', 19, 30, '#f39c12']);
    dbRun('INSERT INTO rules (class, min_ups, max_ups, color) VALUES (?, ?, ?, ?)', ['D', 0, 18, '#e74c3c']);
  }

  const catCount = dbGet('SELECT COUNT(*) as c FROM catalog_services');
  if (catCount.c === 0) {
    dbRun('INSERT INTO catalog_services (name, ups_value, money_value) VALUES (?, ?, ?)', ['Instalacao', 10, 50.00]);
    dbRun('INSERT INTO catalog_services (name, ups_value, money_value) VALUES (?, ?, ?)', ['Manutencao', 8, 35.00]);
    dbRun('INSERT INTO catalog_services (name, ups_value, money_value) VALUES (?, ?, ?)', ['Suporte', 5, 25.00]);
  }

  // Migrate existing databases: add columns if missing
  try { db.run('ALTER TABLE services ADD COLUMN grade REAL DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE services ADD COLUMN latitude TEXT DEFAULT \'\''); } catch (e) {}
  try { db.run('ALTER TABLE services ADD COLUMN longitude TEXT DEFAULT \'\''); } catch (e) {}
  try { db.run('ALTER TABLE users ADD COLUMN last_seen DATETIME'); } catch (e) {}

  dbReady = true;
  console.log('Banco de dados inicializado');
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ok(extra) {
  const base = { success: true };
  if (extra) Object.assign(base, extra);
  return base;
}

function err(msg) {
  return { success: false, message: msg };
}

// ===== SERVER INFO =====
app.get('/api/server-info', (req, res) => {
  res.json({ ips: getLocalIPs(), port: PORT, hostname: os.hostname() });
});

// ===== RPC =====
app.post('/api/rpc', (req, res) => {
  const { method, args } = req.body;
  try {
    let result;
    switch (method) {
      case 'checkConnection':           result = checkConnection(); break;
      case 'authenticate':              result = authenticate(args[0], args[1]); break;
      case 'getUsers':                  result = getUsers(); break;
      case 'getTeams':                  result = getTeams(); break;
      case 'getUser':                   result = getUser(args[0]); break;
      case 'createUser':                result = createUser(args[0], args[1], args[2], args[3], args[4]); break;
      case 'deleteUser':                result = deleteUser(args[0]); break;
      case 'resetPassword':             result = resetPassword(args[0], args[1]); break;
      case 'updateUserLocation':        result = updateUserLocation(args[0], args[1], args[2]); break;
      case 'getCatalogServices':        result = getCatalogServices(); break;
      case 'getActiveCatalogServices':  result = getActiveCatalogServices(); break;
      case 'createCatalogService':      result = createCatalogService(args[0], args[1], args[2]); break;
      case 'updateCatalogService':      result = updateCatalogService(args[0], args[1], args[2], args[3], args[4]); break;
      case 'deleteCatalogService':      result = deleteCatalogService(args[0]); break;
      case 'addService':                result = addService(args[0], args[1], args[2], args[3], args[4], args[5], args[6]); break;
      case 'addServiceFromCatalog':     result = addServiceFromCatalog(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[10], args[11]); break;
      case 'getTodayServices':          result = getTodayServices(args[0]); break;
      case 'getServicesByDate':         result = getServicesByDate(args[0], args[1]); break;
      case 'getDailySummary': {
        const dailyEnd = args[2] || args[1];
        result = getTeamSummaryForPeriod(args[0], args[1], dailyEnd); break;
      }
      case 'getTeamSummaryForPeriod':   result = getTeamSummaryForPeriod(args[0], args[1], args[2]); break;
      case 'getAllTeamsDailySummary':   result = getAllTeamsSummaryForPeriod(args[0], args[1]); break;
      case 'exportServicesForPeriod':   result = exportServicesForPeriod(args[0], args[1]); break;
      case 'getClassificationRules':    result = getClassificationRules(); break;
      case 'saveClassificationRules':   result = saveClassificationRules(args[0]); break;
      case 'updateLastSeen':            result = updateLastSeen(args[0]); break;
      case 'getUserStatuses':           result = getUserStatuses(); break;
      case 'deleteService':             result = deleteService(args[0]); break;
      default:
        res.json({ error: { message: 'Metodo desconhecido: ' + method } });
        return;
    }
    res.json(result);
  } catch (e) {
    res.json({ error: { message: e.message } });
  }
});

// ===== HANDLERS =====
function checkConnection() {
  return ok({ message: 'Conexao OK', time: new Date().toISOString() });
}

function authenticate(username, password) {
  const user = dbGet('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
  if (user) return ok({ id: user.id, username: user.username, role: user.role });
  return err('Usuario ou senha invalidos');
}

function getUser(id) {
  return dbGet('SELECT id, username, role, latitude, longitude FROM users WHERE id = ?', [id]) || null;
}

function getUsers_() {
  return dbAll('SELECT id, username, role, latitude, longitude, last_seen, created_at FROM users ORDER by id');
}

function getUsers() { return getUsers_(); }
function getTeams() { return getUsers_().filter(u => u.role !== 'admin'); }

function createUser(username, password, role, latitude, longitude) {
  if (!username || String(username).trim().length < 2) return err('Nome de usuario muito curto');
  if (!password || password.length < 3) return err('Senha deve ter pelo menos 3 caracteres');

  const existing = dbGet('SELECT id FROM users WHERE username = ?', [username.trim()]);
  if (existing) return err('Nome de usuario ja existe');

  const info = dbRun('INSERT INTO users (username, password, role, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
    [username.trim(), password, role || 'equipe', latitude || '', longitude || '']);

  return ok({ id: info.lastInsertRowid });
}

function deleteUser(userId) {
  const user = dbGet('SELECT role FROM users WHERE id = ?', [userId]);
  if (!user) return err('Usuario nao encontrado');
  if (user.role === 'admin') return err('Nao e possivel excluir o administrador');
  dbRun('DELETE FROM users WHERE id = ?', [userId]);
  return ok();
}

function resetPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 3) return err('Senha deve ter pelo menos 3 caracteres');
  const info = dbRun('UPDATE users SET password = ? WHERE id = ?', [newPassword, userId]);
  if (info.changes === 0) return err('Usuario nao encontrado');
  return ok();
}

function updateUserLocation(userId, lat, lng) {
  const info = dbRun('UPDATE users SET latitude = ?, longitude = ? WHERE id = ?', [lat || '', lng || '', userId]);
  if (info.changes === 0) return err('Usuario nao encontrado');
  return ok();
}

function getCatalogServices() {
  return dbAll('SELECT * FROM catalog_services ORDER BY id').map(r => ({
    id: r.id, name: r.name, upsValue: r.ups_value, moneyValue: r.money_value,
    active: !!r.active, createdAt: r.created_at
  }));
}

function getActiveCatalogServices() {
  return getCatalogServices().filter(s => s.active);
}

function createCatalogService(name, upsValue, moneyValue) {
  if (!name || String(name).trim().length === 0) return err('Nome do servico obrigatorio');
  if (isNaN(upsValue) || Number(upsValue) < 0) return err('Valor UPS invalido');
  if (isNaN(moneyValue) || Number(moneyValue) < 0) return err('Valor em dinheiro invalido');

  const info = dbRun('INSERT INTO catalog_services (name, ups_value, money_value) VALUES (?, ?, ?)',
    [String(name).trim(), Number(upsValue), Number(moneyValue)]);

  return ok({ id: info.lastInsertRowid });
}

function updateCatalogService(id, name, upsValue, moneyValue, active) {
  const info = dbRun('UPDATE catalog_services SET name = ?, ups_value = ?, money_value = ?, active = ? WHERE id = ?',
    [name, Number(upsValue), Number(moneyValue), active ? 1 : 0, id]);
  if (info.changes === 0) return err('Servico nao encontrado');
  return ok();
}

function deleteCatalogService(id) {
  const info = dbRun('DELETE FROM catalog_services WHERE id = ?', [id]);
  if (info.changes === 0) return err('Servico nao encontrado');
  return ok();
}

function addService(userId, serviceName, upsValue, dateStr, grade, lat, lng) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const g = (grade !== undefined && grade !== null) ? Number(grade) : 0;
  return addServiceFromCatalog(userId, null, serviceName, Number(upsValue), 1, Number(upsValue), 0, 0, date, g, lat, lng);
}

function addServiceFromCatalog(userId, catalogId, serviceName, totalUps, quantity, upsPerUnit, moneyPerUnit, totalMoney, dateStr, grade, lat, lng) {
  if (!serviceName || String(serviceName).trim().length === 0) return err('Nome do servico obrigatorio');
  if (!quantity || isNaN(quantity) || quantity < 1) return err('Quantidade invalida');

  const date = dateStr || new Date().toISOString().slice(0, 10);
  const g = (grade !== undefined && grade !== null) ? Number(grade) : 0;

  const info = dbRun(`INSERT INTO services (user_id, service_name, ups_value, quantity, ups_per_unit, money_per_unit, total_money, grade, latitude, longitude, catalog_service_id, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, String(serviceName).trim(), Number(totalUps), Number(quantity), Number(upsPerUnit), Number(moneyPerUnit), Number(totalMoney), g, lat || '', lng || '', catalogId || null, date]);

  // Also update user location if provided
  if (lat && lng) {
    dbRun('UPDATE users SET latitude = ?, longitude = ?, last_seen = datetime(\'now\', \'localtime\') WHERE id = ?', [lat, lng, userId]);
  } else {
    dbRun('UPDATE users SET last_seen = datetime(\'now\', \'localtime\') WHERE id = ?', [userId]);
  }

  return ok({ id: info.lastInsertRowid });
}

function getServicesForPeriod(userId, startDate, endDate) {
  return dbAll('SELECT * FROM services WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY id', [userId, startDate, endDate]).map(r => ({
    id: r.id, userId: r.user_id, serviceName: r.service_name, upsValue: r.ups_value,
    quantity: r.quantity || 1, upsPerUnit: r.ups_per_unit || r.ups_value,
    moneyPerUnit: r.money_per_unit || 0, totalMoney: r.total_money || 0,
    grade: r.grade || 0, latitude: r.latitude || '', longitude: r.longitude || '',
    date: r.date
  }));
}

function getServicesByDate(userId, date) {
  return getServicesForPeriod(userId, date, date);
}

function getTodayServices(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return getServicesByDate(userId, today);
}

function getTeamSummaryForPeriod(userId, startDate, endDate) {
  const services = getServicesForPeriod(userId, startDate, endDate);
  const totalUps = services.reduce((s, sv) => s + sv.upsValue, 0);
  const totalMoney = services.reduce((s, sv) => s + (sv.totalMoney || 0), 0);
  const classInfo = getClassification_(totalUps);

  return {
    userId, startDate, endDate, services, totalUps, totalMoney,
    class: classInfo.class, color: classInfo.color, count: services.length
  };
}

function getAllTeamsSummaryForPeriod(startDate, endDate) {
  return getTeams().map(team => {
    const summary = getTeamSummaryForPeriod(team.id, startDate, endDate);
    summary.username = team.username;
    summary.latitude = team.latitude;
    summary.longitude = team.longitude;
    summary.lastSeen = team.last_seen || null;
    return summary;
  });
}

function getClassification_(totalUps) {
  const rules = dbAll('SELECT * FROM rules ORDER BY id');
  for (let i = rules.length - 1; i >= 0; i--) {
    if (totalUps >= rules[i].min_ups && totalUps <= rules[i].max_ups) {
      return { class: rules[i].class, color: rules[i].color };
    }
  }
  return { class: '-', color: '#94a3b8' };
}

function getClassificationRules() {
  return dbAll('SELECT * FROM rules ORDER BY id').map(r => ({
    id: r.id, class: r.class, minUps: r.min_ups, maxUps: r.max_ups, color: r.color
  }));
}

function saveClassificationRules(rules) {
  if (!rules || rules.length === 0) return err('Nenhuma regra para salvar');
  db.run('DELETE FROM rules');
  for (const rule of rules) {
    dbRun('INSERT INTO rules (class, min_ups, max_ups, color) VALUES (?, ?, ?, ?)',
      [rule.class, rule.minUps, rule.maxUps, rule.color]);
  }
  saveDb();
  return ok();
}

function deleteService(serviceId) {
  const info = dbRun('DELETE FROM services WHERE id = ?', [serviceId]);
  if (info.changes === 0) return err('Servico nao encontrado');
  return ok();
}

function updateLastSeen(userId) {
  const info = dbRun("UPDATE users SET last_seen = datetime('now', 'localtime') WHERE id = ?", [userId]);
  if (info.changes === 0) return err('Usuario nao encontrado');
  return ok();
}

function getUserStatuses() {
  const users = getUsers_();
  const now = new Date();
  return users.filter(u => u.role !== 'admin').map(u => {
    const lastSeen = u.last_seen;
    let status = 'offline';
    let statusLabel = 'Offline';
    if (lastSeen) {
      const dateStr = lastSeen.replace(' ', 'T');
      const last = new Date(dateStr);
      const diffMin = (now - last) / 60000;
      if (diffMin < 5) {
        status = 'online';
        statusLabel = 'Online';
      } else {
        status = 'offline';
        statusLabel = 'Visto: ' + lastSeen;
      }
    }
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      latitude: u.latitude,
      longitude: u.longitude,
      status: status,
      statusLabel: statusLabel,
      lastSeen: lastSeen || null
    };
  });
}

function exportServicesForPeriod(startDate, endDate) {
  const services = dbAll('SELECT * FROM services WHERE date BETWEEN ? AND ? ORDER BY date, id', [startDate, endDate]);
  const users = getUsers_();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.username);

  return services.map(s => ({
    id: s.id,
    equipe: userMap[s.user_id] || 'Desconhecido',
    servico: s.service_name,
    ups: s.ups_value,
    quantidade: s.quantity,
    valor_total: s.total_money,
    nota: s.grade,
    data: s.date,
    latitude: s.latitude,
    longitude: s.longitude
  }));
}
(async () => {
  await initDatabase();

  const localIPs = getLocalIPs();
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('========================================');
    console.log('  SISTEMA UPS - Rodando!');
    console.log('  Local:    http://localhost:' + PORT);
    localIPs.forEach(ip => console.log('  Rede:     http://' + ip + ':' + PORT));
    console.log('  Login:    admin / admin123');
    console.log('  CORS:     Habilitado para qualquer origem');
    console.log('========================================');
    console.log('');
  });
})();

setInterval(saveDb, 10000); // Auto-save a cada 10s para evitar perda de dados em queda

process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('exit', saveDb);
