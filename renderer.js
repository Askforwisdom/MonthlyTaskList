let currentDate = new Date();
let tasks = [];
let currentEditingTaskId = null;
let settings = { autoStart: false };
let contextMenuTaskId = null;

function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAPI() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return {
    async invoke(channel, ...args) {
      if (channel === 'load-tasks') {
        const [year, month] = args;
        const key = `tasks-${year}-${month}`;
        const data = localStorage.getItem(key);
        return { success: true, tasks: data ? JSON.parse(data) : [] };
      }
      if (channel === 'save-tasks') {
        const [year, month, taskList] = args;
        const key = `tasks-${year}-${month}`;
        localStorage.setItem(key, JSON.stringify(taskList));
        return { success: true };
      }
      if (channel === 'get-settings') {
        const data = localStorage.getItem('settings');
        return { success: true, settings: data ? JSON.parse(data) : { autoStart: false } };
      }
      if (channel === 'set-settings') {
        localStorage.setItem('settings', JSON.stringify(args[0]));
        return { success: true };
      }
      if (channel === 'set-autostart') return { success: true };
      return { success: false, error: '未知命令' };
    }
  };
}

let api = null;

document.addEventListener('DOMContentLoaded', async function() {
  api = getAPI();
  await loadSettings();
  updateMonthDisplay();
  await loadTasks();
  setupEventListeners();
});

async function loadSettings() {
  try {
    const result = await api.invoke('get-settings');
    if (result.success) {
      settings = { ...settings, ...result.settings };
      updateToggleUI();
    }
  } catch (error) {}
}

function updateToggleUI() {
  const autoStartToggle = document.getElementById('autostart-toggle');
  if (autoStartToggle) autoStartToggle.classList.toggle('active', settings.autoStart);
}

function setupEventListeners() {
  const btnMinimize = document.getElementById('btn-minimize');
  const btnClose = document.getElementById('btn-close');
  
  if (btnMinimize) {
    btnMinimize.addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.invoke('window-minimize');
    });
  }
  
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.invoke('window-close');
    });
  }

  document.getElementById('prev-month').addEventListener('click', async () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    updateMonthDisplay();
    await loadTasks();
  });

  document.getElementById('next-month').addEventListener('click', async () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    updateMonthDisplay();
    await loadTasks();
  });

  document.getElementById('add-task-btn').addEventListener('click', openAddTaskModal);
  document.getElementById('menu-btn').addEventListener('click', toggleMenu);

  document.getElementById('autostart-toggle').addEventListener('click', toggleAutoStart);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);

  document.getElementById('cancel-add-task').addEventListener('click', closeAddTaskModal);
  document.getElementById('confirm-add-task').addEventListener('click', confirmAddTask);
  document.getElementById('new-task-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') confirmAddTask(); });

  document.getElementById('cancel-completion').addEventListener('click', closeModal);
  document.getElementById('save-completion').addEventListener('click', saveCompletion);
  
  document.getElementById('cancel-edit-task').addEventListener('click', closeEditTaskModal);
  document.getElementById('save-edit-task').addEventListener('click', saveEditTask);
  document.getElementById('edit-task-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') saveEditTask(); });
  
  document.getElementById('completion-modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
  document.getElementById('add-task-modal').addEventListener('click', function(e) { if (e.target === this) closeAddTaskModal(); });
  document.getElementById('edit-task-modal').addEventListener('click', function(e) { if (e.target === this) closeEditTaskModal(); });

  document.addEventListener('click', function(e) {
    const menuDropdown = document.getElementById('menu-dropdown');
    const menuBtn = document.getElementById('menu-btn');
    if (menuDropdown && menuBtn && !menuDropdown.contains(e.target) && e.target !== menuBtn) closeMenu();
  });

  document.getElementById('context-edit').addEventListener('click', handleContextEdit);
  document.getElementById('context-delete').addEventListener('click', handleContextDelete);
  
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.context-menu')) {
      hideContextMenu();
    }
  });
  
  document.addEventListener('contextmenu', function(e) {
    if (!e.target.closest('.task-item')) {
      hideContextMenu();
    }
  });
}

function toggleMenu() {
  document.getElementById('menu-dropdown').classList.toggle('active');
}

function closeMenu() {
  document.getElementById('menu-dropdown').classList.remove('active');
}

function openAddTaskModal() {
  closeMenu();
  document.getElementById('add-task-modal').classList.add('active');
  document.getElementById('new-task-input').focus();
}

function closeAddTaskModal() {
  document.getElementById('add-task-modal').classList.remove('active');
  document.getElementById('new-task-input').value = '';
}

async function confirmAddTask() {
  const input = document.getElementById('new-task-input');
  const taskText = input.value.trim();
  if (!taskText) { showToast('请输入任务内容', 'error'); return; }

  const newTask = {
    id: Date.now(),
    text: taskText,
    completed: false,
    completion: '',
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  tasks.push(newTask);
  try {
    const { year, month } = getCurrentMonthKey();
    const result = await api.invoke('save-tasks', year, month, tasks);
    if (result.success) { closeAddTaskModal(); renderTasks(); showToast('已添加'); }
    else showToast('保存失败', 'error');
  } catch (error) { showToast('保存失败', 'error'); }
}

function updateMonthDisplay() {
  const monthElement = document.getElementById('current-month');
  if (monthElement) monthElement.textContent = currentDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}

function getCurrentMonthKey() {
  return { year: currentDate.getFullYear(), month: currentDate.getMonth() + 1 };
}

async function loadTasks() {
  try {
    const { year, month } = getCurrentMonthKey();
    const result = await api.invoke('load-tasks', year, month);
    if (result.success) { tasks = result.tasks || []; renderTasks(); }
  } catch (error) {}
}

function renderTasks() {
  const taskList = document.getElementById('task-list');
  if (tasks.length === 0) {
    taskList.innerHTML = '<div class="empty-state">暂无任务</div>';
    return;
  }

  taskList.innerHTML = tasks.map(task => `
    <div class="task-item ${task.completed ? 'task-completed' : ''}" data-id="${task.id}" oncontextmenu="showContextMenu(event, ${task.id})">
      <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete(${task.id})">
      <div class="task-content">
        <div class="task-text">${escapeHtml(task.text)}</div>
        ${task.completion ? `<div class="task-completion">${escapeHtml(task.completion)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function showContextMenu(e, taskId) {
  e.preventDefault();
  contextMenuTaskId = taskId;
  const contextMenu = document.getElementById('context-menu');
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
  contextMenu.classList.add('active');
}

function hideContextMenu() {
  document.getElementById('context-menu').classList.remove('active');
  contextMenuTaskId = null;
}

function handleContextEdit() {
  if (!contextMenuTaskId) return;
  const task = tasks.find(t => t.id === contextMenuTaskId);
  if (task) {
    openEditTaskModal(task);
  }
  hideContextMenu();
}

function openEditTaskModal(task) {
  currentEditingTaskId = task.id;
  document.getElementById('edit-task-input').value = task.text;
  document.getElementById('edit-task-modal').classList.add('active');
  document.getElementById('edit-task-input').focus();
}

function closeEditTaskModal() {
  document.getElementById('edit-task-modal').classList.remove('active');
  document.getElementById('edit-task-input').value = '';
  currentEditingTaskId = null;
}

async function saveEditTask() {
  if (!currentEditingTaskId) return;
  const input = document.getElementById('edit-task-input');
  const newText = input.value.trim();
  if (!newText) {
    showToast('请输入任务内容', 'error');
    return;
  }
  
  const taskIndex = tasks.findIndex(task => task.id === currentEditingTaskId);
  if (taskIndex === -1) return;
  
  tasks[taskIndex].text = newText;
  try {
    const { year, month } = getCurrentMonthKey();
    const result = await api.invoke('save-tasks', year, month, tasks);
    if (result.success) {
      closeEditTaskModal();
      renderTasks();
      showToast('已更新');
    }
  } catch (error) {}
}

async function handleContextDelete() {
  if (!contextMenuTaskId) return;
  if (!confirm('确定删除？')) return;
  tasks = tasks.filter(task => task.id !== contextMenuTaskId);
  try {
    const { year, month } = getCurrentMonthKey();
    const result = await api.invoke('save-tasks', year, month, tasks);
    if (result.success) { renderTasks(); showToast('已删除'); }
  } catch (error) {}
  hideContextMenu();
}

async function toggleTaskComplete(taskId) {
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  if (taskIndex === -1) return;
  const task = tasks[taskIndex];
  task.completed = !task.completed;
  if (task.completed) {
    task.completedAt = new Date().toISOString();
    openModal(taskId);
  } else {
    task.completedAt = null;
    task.completion = '';
    await saveTasks();
  }
}

function openModal(taskId, existingCompletion = '') {
  currentEditingTaskId = taskId;
  document.getElementById('completion-text').value = existingCompletion;
  document.getElementById('completion-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('completion-modal').classList.remove('active');
  currentEditingTaskId = null;
}

async function saveCompletion() {
  if (!currentEditingTaskId) return;
  const completionText = document.getElementById('completion-text').value.trim();
  const taskIndex = tasks.findIndex(task => task.id === currentEditingTaskId);
  if (taskIndex === -1) return;
  tasks[taskIndex].completion = completionText;
  try {
    const { year, month } = getCurrentMonthKey();
    const result = await api.invoke('save-tasks', year, month, tasks);
    if (result.success) { closeModal(); renderTasks(); showToast('已保存'); }
  } catch (error) {}
}

async function saveTasks() {
  try {
    const { year, month } = getCurrentMonthKey();
    const result = await api.invoke('save-tasks', year, month, tasks);
    if (result.success) renderTasks();
  } catch (error) {}
}

async function toggleAutoStart() {
  settings.autoStart = !settings.autoStart;
  updateToggleUI();
  try {
    const result = await api.invoke('set-autostart', settings.autoStart);
    if (result.success) showToast(settings.autoStart ? '已开启' : '已关闭');
    else { settings.autoStart = !settings.autoStart; updateToggleUI(); }
  } catch (error) { settings.autoStart = !settings.autoStart; updateToggleUI(); }
}

async function exportData() {
  try {
    const result = await api.invoke('export-data');
    if (result.success) { showToast('已导出'); closeMenu(); }
    else if (!result.canceled) showToast('导出失败', 'error');
  } catch (error) {}
}

async function importData() {
  try {
    const result = await api.invoke('import-data');
    if (result.success) { await loadTasks(); showToast('已导入'); closeMenu(); }
    else if (!result.canceled) showToast('导入失败', 'error');
  } catch (error) {}
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.classList.remove('show'); }, 2000);
}
