(() => {
  const $ = (id) => document.getElementById(id);
  let dirty = false;
  let baselineSnapshot = '';
  let currentName = '';
  let leaveLocked = false;

  function selectedName() {
    const select = $('name-select');
    return select ? select.value : '';
  }

  function escapeText(value) {
    return String(value == null ? '' : value);
  }

  function currentSnapshot() {
    const rows = Array.from(document.querySelectorAll('.task-row')).map(row => ({
      project: row.querySelector('.project-select')?.value || '',
      details: row.querySelector('.task-input')?.value || ''
    }));
    return JSON.stringify({ name: selectedName(), rows });
  }

  function refreshDirtyState() {
    dirty = currentSnapshot() !== baselineSnapshot;
  }

  function markClean() {
    baselineSnapshot = currentSnapshot();
    dirty = false;
  }

  function addControls() {
    const nameSelect = $('name-select');
    if (!nameSelect || $('individual-status-actions')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'individual-status-actions';
    wrapper.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';

    const previousButton = document.createElement('button');
    previousButton.type = 'button';
    previousButton.className = 'btn btn-ghost btn-sm';
    previousButton.textContent = '↩️ Use Previous Day Status';
    previousButton.onclick = loadPreviousStatus;

    const leaveButton = document.createElement('button');
    leaveButton.type = 'button';
    leaveButton.className = 'btn btn-ghost btn-sm';
    leaveButton.textContent = '🏖️ Mark as On Leave';
    leaveButton.onclick = markOnLeave;

    wrapper.append(previousButton, leaveButton);
    nameSelect.insertAdjacentElement('afterend', wrapper);
    applyTabOrder();
  }

  function setProjectValue(select, project) {
    const wanted = escapeText(project);
    const match = Array.from(select.options).find(o => o.value === wanted);
    if (match) {
      select.value = wanted;
      return true;
    }
    const option = document.createElement('option');
    option.value = wanted;
    option.textContent = wanted;
    select.insertBefore(option, select.querySelector('option[value="__ADD_NEW__"]') || null);
    select.value = wanted;
    return true;
  }

  function clearTaskRows() {
    const container = $('tasks-container');
    if (!container) return;
    container.innerHTML = '';
  }

  function fillPreviousTasks(tasks) {
    clearTaskRows();
    if (!Array.isArray(tasks) || !tasks.length) {
      if (typeof window.addTaskRow === 'function') window.addTaskRow();
      return;
    }

    tasks.forEach((task, index) => {
      if (typeof window.addTaskRow === 'function') window.addTaskRow();
      const rows = document.querySelectorAll('.task-row');
      const row = rows[index];
      if (!row) return;
      const project = row.querySelector('.project-select');
      const details = row.querySelector('.task-input');
      if (project) setProjectValue(project, task.project);
      if (details) details.value = escapeText(task.details);
    });

    if (typeof window.updateRemoveButtonsVisibility === 'function') {
      window.updateRemoveButtonsVisibility();
    }
    applyTabOrder();
  }

  function showLeaveConfirmation(name) {
    return new Promise((resolve) => {
      let modal = $('leave-confirm-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'leave-confirm-modal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content" style="border-top: 4px solid var(--accent);">
            <h3 style="color: var(--accent); margin-bottom: 12px;">🏖️ Mark On Leave</h3>
            <p>Are you sure you want to mark <strong id="leave-confirm-name" style="color: var(--accent);"></strong> as On Leave for today?</p>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 8px;">Any existing entry for this person today will be replaced with <strong>"On Leave"</strong>.</p>
            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
              <button class="btn btn-ghost" id="leave-confirm-cancel">Cancel</button>
              <button class="btn btn-primary" id="leave-confirm-ok">Yes, Mark On Leave</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }

      $('leave-confirm-name').textContent = name;
      modal.style.display = 'flex';

      const finish = (value) => {
        modal.style.display = 'none';
        resolve(value);
      };

      $('leave-confirm-cancel').onclick = () => finish(false);
      $('leave-confirm-ok').onclick = () => finish(true);
    });
  }

  function showOverwriteConfirmation(name) {
    return new Promise((resolve) => {
      let modal = $('previous-overwrite-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'previous-overwrite-modal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content" style="border-top: 4px solid var(--accent);">
            <h3 style="color: var(--accent); margin-bottom: 12px;">↩️ Use Previous Status</h3>
            <p>You already have task details entered for <strong id="previous-overwrite-name" style="color: var(--accent);"></strong>.</p>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 8px;">Using the previous status will replace the current task entries.</p>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
              <button class="btn btn-ghost" id="previous-overwrite-cancel">Cancel</button>
              <button class="btn btn-primary" id="previous-overwrite-ok">Yes, Replace</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }

      $('previous-overwrite-name').textContent = name;
      modal.style.display = 'flex';

      const finish = (value) => {
        modal.style.display = 'none';
        resolve(value);
      };
      $('previous-overwrite-cancel').onclick = () => finish(false);
      $('previous-overwrite-ok').onclick = () => finish(true);
    });
  }

  function showUnsavedChangeConfirmation() {
    return new Promise((resolve) => {
      let modal = $('unsaved-change-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'unsaved-change-modal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content" style="border-top: 4px solid var(--accent);">
            <h3 style="color: var(--accent); margin-bottom: 12px;">⚠️ Unsaved Changes</h3>
            <p>You have unsaved task changes for <strong id="unsaved-current-name" style="color: var(--accent);"></strong>.</p>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 8px;">If you switch to another person, these changes will be discarded.</p>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
              <button class="btn btn-ghost" id="unsaved-cancel">Stay Here</button>
              <button class="btn btn-primary" id="unsaved-discard">Discard & Switch</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }

      $('unsaved-current-name').textContent = currentName || 'the current person';
      modal.style.display = 'flex';

      const finish = (value) => {
        modal.style.display = 'none';
        resolve(value);
      };
      $('unsaved-cancel').onclick = () => finish(false);
      $('unsaved-discard').onclick = () => finish(true);
    });
  }

  function setEntryLocked(locked) {
    leaveLocked = locked;
    document.querySelectorAll('#tasks-container select, #tasks-container textarea, #tasks-container button').forEach(el => {
      el.disabled = locked;
    });
    document.querySelectorAll('.task-row').forEach(row => {
      row.style.opacity = locked ? '0.55' : '';
    });
  }

  function applyTabOrder() {
    const nameSelect = $('name-select');
    if (!nameSelect) return;

    nameSelect.tabIndex = 1;
    document.querySelectorAll('#tasks-container .task-row').forEach(row => {
      const project = row.querySelector('.project-select');
      const details = row.querySelector('.task-input');
      const rowButtons = row.querySelectorAll('button');
      if (project) project.tabIndex = 1;
      if (details) details.tabIndex = 1;
      rowButtons.forEach(button => { button.tabIndex = -1; });
    });

    document.querySelectorAll('#individual-status-actions button, #tab-entry .label-row button').forEach(button => {
      button.tabIndex = -1;
    });
  }

  async function loadPreviousStatus() {
    const name = selectedName();
    if (!name || name === '__ADD_NEW__') {
      window.showToast('Please select a person first.', 'error');
      return;
    }

    refreshDirtyState();
    if (dirty) {
      const confirmed = await showOverwriteConfirmation(name);
      if (!confirmed) return;
    }

    const button = $('individual-status-actions')?.querySelector('button');
    if (button) { button.disabled = true; button.textContent = '↩️ Loading...'; }

    try {
      const response = await fetch('/api/previous-status?name=' + encodeURIComponent(name));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load previous status.');

      if (!Array.isArray(data.tasks) || !data.tasks.length) {
        window.showToast(`No previous filled status found for ${name}.`, 'info');
        return;
      }

      fillPreviousTasks(data.tasks);
      dirty = true;

      let dateMessage = '';
      if (data.date) {
        const date = new Date(data.date + 'T12:00:00');
        if (!Number.isNaN(date.getTime())) {
          dateMessage = ` from ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}`;
        }
      }
      window.showToast(`Previous status loaded${dateMessage} for ${name}. You can edit it before submitting.`, 'success');

      const firstInput = document.querySelector('#tasks-container .task-input');
      if (firstInput) setTimeout(() => firstInput.focus(), 50);
    } catch (error) {
      console.error('Previous status error:', error);
      window.showToast(error.message || 'Unable to load previous status.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = '↩️ Use Previous Day Status'; }
      if (leaveLocked) setEntryLocked(true);
    }
  }

  async function markOnLeave() {
    const name = selectedName();
    if (!name || name === '__ADD_NEW__') {
      window.showToast('Please select a person first.', 'error');
      return;
    }

    const confirmed = await showLeaveConfirmation(name);
    if (!confirmed) return;

    const buttons = $('individual-status-actions')?.querySelectorAll('button');
    const leaveButton = buttons && buttons[1];
    if (leaveButton) { leaveButton.disabled = true; leaveButton.textContent = '🏖️ Saving...'; }

    try {
      const response = await fetch('/api/previous-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to mark On Leave.');

      setEntryLocked(true);
      markClean();
      window.showToast(data.message || `${name} marked as On Leave.`, 'success');
      if (typeof window.loadDailyStatus === 'function') window.loadDailyStatus();
    } catch (error) {
      console.error('On Leave error:', error);
      window.showToast(error.message || 'Unable to mark On Leave.', 'error');
    } finally {
      if (leaveButton) { leaveButton.disabled = false; leaveButton.textContent = '🏖️ Mark as On Leave'; }
    }
  }

  function setupUnsavedChangeProtection() {
    const nameSelect = $('name-select');
    if (!nameSelect || nameSelect.dataset.unsavedProtection === '1') return;
    nameSelect.dataset.unsavedProtection = '1';

    currentName = nameSelect.value || '';
    baselineSnapshot = currentSnapshot();

    nameSelect.addEventListener('change', async (event) => {
      const nextName = nameSelect.value;
      if (!nextName || nextName === '__ADD_NEW__' || nextName === currentName) return;

      refreshDirtyState();
      if (!currentName || !dirty) {
        currentName = nextName;
        leaveLocked = false;
        setEntryLocked(false);
        markClean();
        return;
      }

      event.preventDefault();
      nameSelect.value = currentName;
      const confirmed = await showUnsavedChangeConfirmation();
      if (!confirmed) return;

      clearTaskRows();
      if (typeof window.addTaskRow === 'function') window.addTaskRow();
      nameSelect.value = nextName;
      currentName = nextName;
      leaveLocked = false;
      setEntryLocked(false);
      markClean();
      applyTabOrder();
    }, true);
  }

  function setupDirtyTracking() {
    document.addEventListener('input', (event) => {
      if (event.target.matches('#tasks-container .task-input')) refreshDirtyState();
    });
    document.addEventListener('change', (event) => {
      if (event.target.matches('#tasks-container .project-select')) refreshDirtyState();
    });

    const wrapSubmit = () => {
      if (typeof window.submitFinalData !== 'function' || window.submitFinalData.__dailyCatchUpWrapped) return false;
      const original = window.submitFinalData;
      const wrapped = async function(...args) {
        const result = await original.apply(this, args);
        markClean();
        return result;
      };
      wrapped.__dailyCatchUpWrapped = true;
      window.submitFinalData = wrapped;
      return true;
    };

    if (!wrapSubmit()) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (wrapSubmit() || attempts >= 50) clearInterval(timer);
      }, 100);
    }

    window.addEventListener('beforeunload', (event) => {
      refreshDirtyState();
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  function start() {
    addControls();
    setupUnsavedChangeProtection();
    setupDirtyTracking();
    applyTabOrder();

    const observer = new MutationObserver(() => {
      addControls();
      applyTabOrder();
      if (!leaveLocked) refreshDirtyState();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
