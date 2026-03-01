const { app, BrowserWindow, ipcMain, dialog, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');

const isDev = !app.isPackaged;
const appPath = isDev ? __dirname : path.dirname(app.getPath('exe'));
const DATA_DIR = path.join(appPath, 'data');
const SETTINGS_FILE = path.join(appPath, 'settings.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createAppIcon() {
  const size = 256;
  const canvas = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const radius = size / 2 - 8;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      
      if (dist <= radius) {
        canvas[idx] = 250;
        canvas[idx + 1] = 250;
        canvas[idx + 2] = 250;
        canvas[idx + 3] = 255;
      } else {
        canvas[idx + 3] = 0;
      }
    }
  }
  
  for (let i = 0; i < 3; i++) {
    const lineY = 80 + i * 48;
    const lineX = 70;
    const lineWidth = 116;
    const lineHeight = 8;
    
    for (let y = lineY; y < lineY + lineHeight; y++) {
      for (let x = lineX; x < lineX + lineWidth; x++) {
        if (x >= 0 && x < size && y >= 0 && y < size) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist <= radius - 5) {
            const idx = (y * size + x) * 4;
            canvas[idx] = 200;
            canvas[idx + 1] = 200;
            canvas[idx + 2] = 200;
            canvas[idx + 3] = 255;
          }
        }
      }
    }
  }
  
  const checkPoints = [
    [85, 128], [100, 144], [130, 104]
  ];
  
  for (let t = 0; t <= 1; t += 0.01) {
    const x1 = checkPoints[0][0] + (checkPoints[1][0] - checkPoints[0][0]) * t;
    const y1 = checkPoints[0][1] + (checkPoints[1][1] - checkPoints[0][1]) * t;
    
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dy * dy <= 36) {
          const x = Math.floor(x1 + dx);
          const y = Math.floor(y1 + dy);
          if (x >= 0 && x < size && y >= 0 && y < size) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist <= radius - 5) {
              const idx = (y * size + x) * 4;
              canvas[idx] = 76;
              canvas[idx + 1] = 175;
              canvas[idx + 2] = 80;
              canvas[idx + 3] = 255;
            }
          }
        }
      }
    }
  }
  
  for (let t = 0; t <= 1; t += 0.01) {
    const x2 = checkPoints[1][0] + (checkPoints[2][0] - checkPoints[1][0]) * t;
    const y2 = checkPoints[1][1] + (checkPoints[2][1] - checkPoints[1][1]) * t;
    
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dy * dy <= 36) {
          const x = Math.floor(x2 + dx);
          const y = Math.floor(y2 + dy);
          if (x >= 0 && x < size && y >= 0 && y < size) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist <= radius - 5) {
              const idx = (y * size + x) * 4;
              canvas[idx] = 76;
              canvas[idx + 1] = 175;
              canvas[idx + 2] = 80;
              canvas[idx + 3] = 255;
            }
          }
        }
      }
    }
  }
  
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

const DEFAULT_SETTINGS = {
  autoStart: false
};

function getMonthFilePath(year, month) {
  return path.join(DATA_DIR, `${year}-${String(month).padStart(2, '0')}.json`);
}

async function loadMonthTasks(year, month) {
  try {
    const filePath = getMonthFilePath(year, month);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveMonthTasks(year, month, tasks) {
  ensureDataDir();
  const filePath = getMonthFilePath(year, month);
  await fs.writeFile(filePath, JSON.stringify(tasks, null, 2), 'utf8');
  return true;
}

async function exportAllData() {
  try {
    const files = await fs.readdir(DATA_DIR);
    const allData = {};
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(DATA_DIR, file);
        const data = await fs.readFile(filePath, 'utf8');
        const monthKey = file.replace('.json', '');
        allData[monthKey] = JSON.parse(data);
      }
    }
    
    return allData;
  } catch (error) {
    return {};
  }
}

async function importAllData(data) {
  ensureDataDir();
  
  for (const [monthKey, tasks] of Object.entries(data)) {
    const [year, month] = monthKey.split('-');
    await saveMonthTasks(year, month, tasks);
  }
  
  return true;
}

function loadSettings() {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = readFileSync(SETTINGS_FILE, 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings) {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    return false;
  }
}

function setAutoStart(enable) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: false,
      path: app.getPath('exe')
    });
    return true;
  } catch (error) {
    console.error('设置开机自启失败:', error);
    return false;
  }
}

let mainWindow;
let settings = loadSettings();

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const windowWidth = 320;
  const windowHeight = Math.min(700, height - 40);
  const windowX = width - windowWidth - 20;
  const windowY = Math.floor((height - windowHeight) / 2);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowX,
    y: windowY,
    minWidth: 280,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: '',
    icon: createAppIcon(),
    frame: false,
    show: false,
    autoHideMenuBar: true
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('renderer.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  setAutoStart(settings.autoStart);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle('load-tasks', async (event, year, month) => {
  try {
    const tasks = await loadMonthTasks(year, month);
    return { success: true, tasks };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-tasks', async (event, year, month, tasks) => {
  try {
    await saveMonthTasks(year, month, tasks);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-data', async () => {
  try {
    const data = await exportAllData();
    
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出任务数据',
      defaultPath: `task-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] }
      ]
    });
    
    if (!result.canceled) {
      await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
      return { success: true, filePath: result.filePath };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-data', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入任务数据',
      filters: [
        { name: 'JSON 文件', extensions: ['json'] }
      ],
      properties: ['openFile']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const data = await fs.readFile(result.filePaths[0], 'utf8');
      const parsed = JSON.parse(data);
      await importAllData(parsed);
      return { success: true };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-settings', () => {
  return { success: true, settings: loadSettings() };
});

ipcMain.handle('set-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  const success = saveSettings(settings);
  return { success };
});

ipcMain.handle('set-autostart', (event, enable) => {
  settings.autoStart = enable;
  saveSettings(settings);
  const success = setAutoStart(enable);
  return { success };
});

ipcMain.handle('window-minimize', () => {
  const win = mainWindow;
  if (win) win.minimize();
  return { success: true };
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
  return { success: true };
});
