var CONFIG = {
  SHEET_USERS: 'Usuarios',
  SHEET_SERVICES: 'Servicos',
  SHEET_RULES: 'RegrasClassificacao',
  SHEET_CATALOG: 'ServicosCadastrados',
  DEFAULT_ADMIN_USER: 'admin',
  DEFAULT_ADMIN_PASS: 'admin123',
  CENTER_LAT: -15.7939,
  CENTER_LNG: -47.8828
};

function doGet() {
  try {
    setupSheet_();
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Sistema UPS - Classificacao de Equipes')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    return HtmlService.createHtmlOutput(
      '<h2>Erro ao carregar o sistema</h2><p>' + e.message + '</p>' +
      '<pre>' + e.stack + '</pre>'
    );
  }
}

function checkConnection() {
  return { success: true, message: 'Conexão OK', time: new Date().toISOString() };
}

function setupSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Nao foi possivel acessar a planilha ativa');
  setupUsersSheet_(ss);
  setupServicesSheet_(ss);
  setupRulesSheet_(ss);
  setupCatalogSheet_(ss);
}

function setupUsersSheet_(ss) {
  var HEADERS = ['ID', 'NomeUsuario', 'Senha', 'Funcao', 'Latitude', 'Longitude', 'UltimoVisto', 'DataCriacao'];
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_USERS);
    sheet.appendRow(HEADERS);
    sheet.appendRow([1, CONFIG.DEFAULT_ADMIN_USER, CONFIG.DEFAULT_ADMIN_PASS, 'admin', '', '', '', new Date()]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HEADERS.length, 120);
    return;
  }
  // Add UltimoVisto column if missing
  var header = sheet.getDataRange().getValues()[0];
  if (header.length < 7 || header[6] !== 'UltimoVisto') {
    var col = header.length + 1;
    sheet.getRange(1, col).setValue('UltimoVisto');
  }
}

function setupServicesSheet_(ss) {
  var HEADERS = ['ID', 'UsuarioID', 'NomeServico', 'ValorUPS', 'Quantidade', 'ValorUPSUnitario', 'ValorDinheiroUnitario', 'ValorDinheiroTotal', 'Nota', 'Latitude', 'Longitude', 'CatalogServiceID', 'Data', 'DataCriacao'];

  var sheet = ss.getSheetByName(CONFIG.SHEET_SERVICES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_SERVICES);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HEADERS.length, 100);
    return;
  }

  var header = sheet.getDataRange().getValues()[0];

  // Add missing columns
  var extraCols = ['Nota', 'Latitude', 'Longitude'];
  for (var ci = 0; ci < extraCols.length; ci++) {
    if (header.indexOf(extraCols[ci]) === -1) {
      var colPos = header.length + 1;
      sheet.getRange(1, colPos).setValue(extraCols[ci]);
      header.push(extraCols[ci]);
    }
  }
}

function setupRulesSheet_(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_RULES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_RULES);
    sheet.appendRow(['ID', 'Classe', 'MinUPS', 'MaxUPS', 'Cor']);
    sheet.appendRow([1, 'A', 42, 9999, '#2ecc71']);
    sheet.appendRow([2, 'B', 31, 41, '#3498db']);
    sheet.appendRow([3, 'C', 19, 30, '#f39c12']);
    sheet.appendRow([4, 'D', 0, 18, '#e74c3c']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 5, 100);
  }
}

function setupCatalogSheet_(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_CATALOG);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_CATALOG);
    sheet.appendRow(['ID', 'Nome', 'ValorUPS', 'ValorDinheiro', 'Ativo', 'DataCriacao']);
    sheet.appendRow([1, 'Instalacao', 10, 50.00, 'Sim', new Date()]);
    sheet.appendRow([2, 'Manutencao', 8, 35.00, 'Sim', new Date()]);
    sheet.appendRow([3, 'Suporte', 5, 25.00, 'Sim', new Date()]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 6, 140);
  }
}

function getSheet_(name) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('Planilha "' + name + '" nao encontrada');
  return s;
}

function getNextId_(sheet) {
  var data = sheet.getDataRange().getValues();
  var maxId = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && Number(data[i][0]) > maxId) maxId = Number(data[i][0]);
  }
  return maxId + 1;
}

function err_(msg) { return { success: false, message: msg }; }
function ok_(extra) {
  var base = { success: true };
  if (extra) { for (var k in extra) base[k] = extra[k]; }
  return base;
}

/** ==============================
  LOGIN / AUTH
  ============================== */
function authenticate(username, password) {
  try {
    setupSheet_();
    var sheet = getSheet_(CONFIG.SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === username && data[i][2] === password) {
        return ok_({ id: Number(data[i][0]), username: data[i][1], role: data[i][3] });
      }
    }
    return err_('Usuario ou senha invalidos');
  } catch (e) {
    return err_('Erro interno: ' + e.message);
  }
}

function getUser(id) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === id) {
        return { id: Number(data[i][0]), username: data[i][1], role: data[i][3], latitude: data[i][4], longitude: data[i][5] };
      }
    }
    return null;
  } catch (e) { return null; }
}

/** ==============================
  USERS CRUD
  ============================== */
function getUsers_() {
  var sheet = getSheet_(CONFIG.SHEET_USERS);
  var data = sheet.getDataRange().getValues();
  var users = [];
  var header = data[0];
  var lastSeenIdx = header.indexOf('UltimoVisto');
  for (var i = 1; i < data.length; i++) {
    users.push({
      id: Number(data[i][0]),
      username: data[i][1],
      role: data[i][3],
      latitude: data[i][4],
      longitude: data[i][5],
      lastSeen: lastSeenIdx > 0 ? data[i][lastSeenIdx] : null,
      createdAt: data[i][7] || data[i][6]
    });
  }
  return users;
}

function getUsers() { try { return getUsers_(); } catch (e) { return []; } }

function getTeams() { try { return getUsers_().filter(function(u) { return u.role !== 'admin'; }); } catch (e) { return []; } }

function createUser(username, password, role, latitude, longitude) {
  try {
    if (!username || username.trim().length < 2) return err_('Nome de usuario muito curto');
    if (!password || password.length < 3) return err_('Senha deve ter pelo menos 3 caracteres');
    var sheet = getSheet_(CONFIG.SHEET_USERS);
    var existing = getUsers_();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].username === username.trim()) return err_('Nome de usuario ja existe');
    }
    var id = getNextId_(sheet);
    sheet.appendRow([id, username.trim(), password, role || 'equipe', latitude || '', longitude || '', new Date()]);
    return ok_({ id: id });
  } catch (e) { return err_('Erro ao criar usuario: ' + e.message); }
}

function deleteUser(userId) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (Number(data[i][0]) === userId) {
        if (data[i][3] === 'admin') return err_('Nao e possivel excluir o administrador');
        sheet.deleteRow(i + 1);
        return ok_();
      }
    }
    return err_('Usuario nao encontrado');
  } catch (e) { return err_('Erro ao excluir: ' + e.message); }
}

function resetPassword(userId, newPassword) {
  try {
    if (!newPassword || newPassword.length < 3) return err_('Senha deve ter pelo menos 3 caracteres');
    var sheet = getSheet_(CONFIG.SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === userId) {
        sheet.getRange(i + 1, 3).setValue(newPassword);
        return ok_();
      }
    }
    return err_('Usuario nao encontrado');
  } catch (e) { return err_('Erro ao redefinir senha: ' + e.message); }
}

function updateUserLocation(userId, lat, lng) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === userId) {
        sheet.getRange(i + 1, 5).setValue(lat);
        sheet.getRange(i + 1, 6).setValue(lng);
        return ok_();
      }
    }
    return err_('Usuario nao encontrado');
  } catch (e) { return err_('Erro ao atualizar localizacao: ' + e.message); }
}

/** ==============================
  CATALOG SERVICES CRUD
  ============================== */
function getCatalogServices() {
  try {
    var sheet = getSheet_(CONFIG.SHEET_CATALOG);
    var data = sheet.getDataRange().getValues();
    var services = [];
    for (var i = 1; i < data.length; i++) {
      if (!String(data[i][1])) continue;
      services.push({
        id: Number(data[i][0]),
        name: String(data[i][1]),
        upsValue: Number(data[i][2]) || 0,
        moneyValue: Number(data[i][3]) || 0,
        active: String(data[i][4]) === 'Sim',
        createdAt: data[i][5]
      });
    }
    return services;
  } catch (e) { return []; }
}

function getActiveCatalogServices() {
  try { return getCatalogServices().filter(function(s) { return s.active; }); } catch (e) { return []; }
}

function createCatalogService(name, upsValue, moneyValue) {
  try {
    if (!name || name.trim().length === 0) return err_('Nome do servico obrigatorio');
    if (isNaN(upsValue) || Number(upsValue) < 0) return err_('Valor UPS invalido');
    if (isNaN(moneyValue) || Number(moneyValue) < 0) return err_('Valor em dinheiro invalido');
    var sheet = getSheet_(CONFIG.SHEET_CATALOG);
    var id = getNextId_(sheet);
    sheet.appendRow([id, name.trim(), Number(upsValue), Number(moneyValue), 'Sim', new Date()]);
    return ok_({ id: id });
  } catch (e) { return err_('Erro ao criar servico: ' + e.message); }
}

function updateCatalogService(id, name, upsValue, moneyValue, active) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_CATALOG);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === id) {
        sheet.getRange(i + 1, 2).setValue(name);
        sheet.getRange(i + 1, 3).setValue(Number(upsValue));
        sheet.getRange(i + 1, 4).setValue(Number(moneyValue));
        sheet.getRange(i + 1, 5).setValue(active ? 'Sim' : 'Nao');
        return ok_();
      }
    }
    return err_('Servico nao encontrado');
  } catch (e) { return err_('Erro ao atualizar servico: ' + e.message); }
}

function deleteCatalogService(id) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_CATALOG);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (Number(data[i][0]) === id) { sheet.deleteRow(i + 1); return ok_(); }
    }
    return err_('Servico nao encontrado');
  } catch (e) { return err_('Erro ao excluir servico: ' + e.message); }
}

/** ==============================
  SERVICES
  ============================== */
function addService(userId, serviceName, upsValue, dateStr, grade, lat, lng) {
  var g = (grade !== undefined && grade !== null) ? Number(grade) : 0;
  return addServiceFromCatalog(userId, null, serviceName, Number(upsValue), 1, Number(upsValue), 0, 0, dateStr, g, lat, lng);
}

function addServiceFromCatalog(userId, catalogId, serviceName, totalUps, quantity, upsPerUnit, moneyPerUnit, totalMoney, dateStr, grade, lat, lng) {
  try {
    if (!serviceName || String(serviceName).trim().length === 0) return err_('Nome do servico obrigatorio');
    if (!quantity || isNaN(quantity) || quantity < 1) return err_('Quantidade invalida');
    var sheet = getSheet_(CONFIG.SHEET_SERVICES);
    var id = getNextId_(sheet);
    var date = dateStr || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var g = (grade !== undefined && grade !== null) ? Number(grade) : 0;
    sheet.appendRow([id, userId, String(serviceName).trim(), Number(totalUps), Number(quantity), Number(upsPerUnit), Number(moneyPerUnit), Number(totalMoney), g, lat || '', lng || '', catalogId || '', date, new Date()]);
    // Also update user last_seen and location
    updateLastSeen(userId);
    if (lat && lng) updateUserLocation(userId, lat, lng);
    return ok_({ id: id });
  } catch (e) { return err_('Erro ao adicionar servico: ' + e.message); }
}

function updateLastSeen(userId) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_USERS);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (Number(data[i][0]) === userId) {
        var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
        sheet.getRange(i + 1, 7).setValue(now);
        return ok_();
      }
    }
    return err_('Usuario nao encontrado');
  } catch (e) { return err_('Erro: ' + e.message); }
}

function getUserStatuses() {
  try {
    var users = getUsers_();
    var now = new Date();
    return users.filter(function(u) { return u.role !== 'admin'; }).map(function(u) {
      var lastSeen = u.lastSeen;
      var status = 'offline';
      var statusLabel = 'Offline';
      if (lastSeen) {
        var last = new Date(lastSeen.replace(' ', 'T'));
        var diffMin = (now - last) / 60000;
        if (diffMin < 5) {
          status = 'online';
          statusLabel = 'Online';
        } else {
          status = 'offline';
          statusLabel = 'Offline';
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
        lastSeen: u.lastSeen || null
      };
    });
  } catch (e) { return []; }
}

function getServicesByDate(userId, date) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_SERVICES);
    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var dateIdx = header.indexOf('Data');
    if (dateIdx === -1) dateIdx = 12;
    var qtyIdx = header.indexOf('Quantidade');
    var upsUnitIdx = header.indexOf('ValorUPSUnitario');
    var moneyUnitIdx = header.indexOf('ValorDinheiroUnitario');
    var moneyTotalIdx = header.indexOf('ValorDinheiroTotal');
    var gradeIdx = header.indexOf('Nota');
    var latIdx = header.indexOf('Latitude');
    var lngIdx = header.indexOf('Longitude');

    var services = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      if (Number(data[i][1]) === userId && String(data[i][dateIdx]) === date) {
        services.push({
          id: Number(data[i][0]),
          userId: Number(data[i][1]),
          serviceName: String(data[i][2]),
          upsValue: Number(data[i][3]),
          quantity: qtyIdx > 0 ? Number(data[i][qtyIdx]) || 1 : 1,
          upsPerUnit: upsUnitIdx > 0 ? Number(data[i][upsUnitIdx]) || Number(data[i][3]) : Number(data[i][3]),
          moneyPerUnit: moneyUnitIdx > 0 ? Number(data[i][moneyUnitIdx]) || 0 : 0,
          totalMoney: moneyTotalIdx > 0 ? Number(data[i][moneyTotalIdx]) || 0 : 0,
          grade: gradeIdx > 0 ? Number(data[i][gradeIdx]) || 0 : 0,
          latitude: latIdx > 0 ? String(data[i][latIdx]) || '' : '',
          longitude: lngIdx > 0 ? String(data[i][lngIdx]) || '' : '',
          date: String(data[i][dateIdx])
        });
      }
    }
    return services;
  } catch (e) { return []; }
}

function getTodayServices(userId) {
  try {
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return getServicesByDate(userId, today);
  } catch (e) { return []; }
}

function getDailySummary(userId, dateStr) {
  try {
    var date = dateStr || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var services = getServicesByDate(userId, date);
    var totalUps = 0;
    var totalMoney = 0;
    for (var i = 0; i < services.length; i++) {
      totalUps += services[i].upsValue;
      totalMoney += services[i].totalMoney || 0;
    }
    var classification = getClassification_(totalUps);
    return {
      userId: userId, date: date, services: services,
      totalUps: totalUps, totalMoney: totalMoney,
      class: classification.class, color: classification.color,
      count: services.length
    };
  } catch (e) {
    return { userId: userId, date: dateStr, services: [], totalUps: 0, totalMoney: 0, class: '-', color: '#94a3b8', count: 0 };
  }
}

function getAllTeamsDailySummary(dateStr) {
  try {
    var date = dateStr || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var teams = getTeams();
    var result = [];
    for (var i = 0; i < teams.length; i++) {
      var summary = getDailySummary(teams[i].id, date);
      summary.username = teams[i].username;
      summary.latitude = teams[i].latitude;
      summary.longitude = teams[i].longitude;
      summary.lastSeen = teams[i].lastSeen || null;
      result.push(summary);
    }
    return result;
  } catch (e) { return []; }
}

/** ==============================
  CLASSIFICATION
  ============================== */
function getClassification_(totalUps) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_RULES);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      var minUps = Number(data[i][2]);
      var maxUps = Number(data[i][3]);
      if (totalUps >= minUps && totalUps <= maxUps) {
        return { class: data[i][1], color: data[i][4] };
      }
    }
    return { class: '-', color: '#94a3b8' };
  } catch (e) { return { class: '-', color: '#94a3b8' }; }
}

function getClassificationRules() {
  try {
    var sheet = getSheet_(CONFIG.SHEET_RULES);
    var data = sheet.getDataRange().getValues();
    var rules = [];
    for (var i = 1; i < data.length; i++) {
      rules.push({ id: Number(data[i][0]), class: data[i][1], minUps: Number(data[i][2]), maxUps: Number(data[i][3]), color: data[i][4] });
    }
    return rules;
  } catch (e) { return []; }
}

function saveClassificationRules(rules) {
  try {
    if (!rules || rules.length === 0) return err_('Nenhuma regra para salvar');
    var sheet = getSheet_(CONFIG.SHEET_RULES);
    var data = sheet.getDataRange().getValues();
    if (data.length > 1) sheet.deleteRows(2, data.length - 1);
    var nextId = 1;
    for (var i = 0; i < rules.length; i++) {
      sheet.appendRow([nextId++, rules[i].class, rules[i].minUps, rules[i].maxUps, rules[i].color]);
    }
    return ok_();
  } catch (e) { return err_('Erro ao salvar regras: ' + e.message); }
}

function deleteService(serviceId) {
  try {
    var sheet = getSheet_(CONFIG.SHEET_SERVICES);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (Number(data[i][0]) === serviceId) { sheet.deleteRow(i + 1); return ok_(); }
    }
    return err_('Servico nao encontrado');
  } catch (e) { return err_('Erro ao excluir servico: ' + e.message); }
}
