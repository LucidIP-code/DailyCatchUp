(() => {
  const $ = (id) => document.getElementById(id);

  function selectedName() {
    const select = $('name-select');
    return select ? select.value : '';
  }

  function escapeText(value) {
    return String(value == null ? '' : value);
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

  async function loadPreviousStatus() {
    const name = selectedName();
    if (!name || name === '__ADD_NEW__') {
      window.showToast('Please select a person first.', 'error');
      return;
    }

    const button = $('individual-status-actions')?.querySelector('button');
    if (button) { button.disabled = true; button.textContent = '↩️ Loading...'; }

    try {
      const response = await fetch('/api/previous-status?name=' + encodeURIComponent(name));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load previous status.');

      if (!Array.isArray(data.tasks) || !data.tasks.length) {
        window.showToast(`No previous status found for ${name}.`, 'info');
        return;
      }

      fillPreviousTasks(data.tasks);
      window.showToast(`Previous status loaded for ${name}. You can edit it before submitting.`, 'success');
    } catch (error) {
      console.error('Previous status error:', error);
      window.showToast(error.message || 'Unable to load previous status.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = '↩️ Use Previous Day Status'; }
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

      window.showToast(data.message || `${name} marked as On Leave.`, 'success');
      if (typeof window.loadDailyStatus === 'function') window.loadDailyStatus();
    } catch (error) {
      console.error('On Leave error:', error);
      window.showToast(error.message || 'Unable to mark On Leave.', 'error');
    } finally {
      if (leaveButton) { leaveButton.disabled = false; leaveButton.textContent = '🏖️ Mark as On Leave'; }
    }
  }

  function start() {
    addControls();
    const observer = new MutationObserver(() => addControls());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
