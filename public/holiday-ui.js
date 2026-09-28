(() => {
  function injectHolidayUI() {
    if (document.getElementById('holiday-manager-btn')) return;
    
    const style = document.createElement('style');
    style.textContent = `
      #holiday-manager-btn{margin-left:8px}
      .holiday-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
      .holiday-toolbar>label{color:var(--accent);font-size:1rem;font-weight:700}
      .holiday-year{width:110px!important;height:40px!important;box-sizing:border-box;background:#292e38!important;color:#e8edf5!important;border:1px solid #3f4655!important;border-radius:8px!important;padding:8px 12px!important;font-size:1rem!important;font-weight:600!important;outline:none!important;appearance:textfield;-moz-appearance:textfield;transition:border-color .2s,box-shadow .2s}
      .holiday-year:focus{border-color:var(--accent)!important;box-shadow:0 0 0 2px rgba(92,191,237,.12)!important}
      .holiday-year::-webkit-outer-spin-button,.holiday-year::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
      .holiday-table{width:100%;border-collapse:collapse;margin-top:10px}
      .holiday-table th,.holiday-table td{padding:11px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
      .holiday-table th{color:var(--accent);font-size:.9rem}
      .holiday-table td{font-size:1rem;font-weight:500}
      .holiday-btn-sm{padding:5px 9px!important;font-size:0.8rem!important;margin-left:4px;}
      .holiday-empty{padding:18px;text-align:center;color:var(--muted);font-size:.95rem}
      .holiday-form-group{margin-bottom:12px;}
      .holiday-form-group label{display:block;color:var(--accent);font-size:0.85rem;font-weight:600;margin-bottom:4px;}
      .holiday-form-group input{width:100%;box-sizing:border-box;background:#292e38;color:#e8edf5;border:1px solid #3f4655;border-radius:8px;padding:9px 12px;font:inherit;outline:none;}
      .holiday-form-group input:focus{border-color:var(--accent);}
    `;
    document.head.appendChild(style);
    
    const actions = document.querySelector('.top-actions') || document.querySelector('.header');
    if (!actions) return;
    
    const btn = document.createElement('button');
    btn.id = 'holiday-manager-btn'; 
    btn.className = 'btn btn-ghost'; 
    btn.textContent = '📅 Manage Holidays';
    actions.appendChild(btn);
    
    const modal = document.createElement('div'); 
    modal.id = 'holiday-modal'; 
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="border-top:4px solid var(--accent);max-width:640px;width:92%;">
        <h3 style="color:var(--accent);margin-bottom:12px;">📅 Manage Holidays</h3>
        <p style="font-size:.95rem;color:var(--muted);margin-bottom:16px;">Maintain government/company holidays by year. Changes persist directly in Redis storage.</p>
        <div class="holiday-toolbar">
          <label for="holiday-year">Year:</label>
          <input id="holiday-year" class="holiday-year" type="number" min="2000" max="2100">
          <button id="holiday-load" class="btn btn-ghost btn-sm">Load</button>
          <button id="holiday-add" class="btn btn-primary btn-sm">+ Add Holiday</button>
        </div>
        <div id="holiday-list"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button id="holiday-close" class="btn btn-ghost">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Edit/Add Form Modal
    const formModal = document.createElement('div');
    formModal.id = 'holiday-form-modal';
    formModal.className = 'modal';
    formModal.innerHTML = `
      <div class="modal-content" style="border-top:4px solid var(--accent);max-width:440px;width:90%;">
        <h3 id="holiday-form-title" style="color:var(--accent);margin-bottom:14px;">➕ Add Holiday</h3>
        <div class="holiday-form-group">
          <label for="holiday-form-date">Holiday Date:</label>
          <input type="date" id="holiday-form-date" required>
        </div>
        <div class="holiday-form-group">
          <label for="holiday-form-name">Holiday Name:</label>
          <input type="text" id="holiday-form-name" placeholder="e.g. Independence Day" required>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
          <button type="button" class="btn btn-ghost" id="holiday-form-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="holiday-form-save">Save Holiday</button>
        </div>
      </div>`;
    document.body.appendChild(formModal);
    
    const yearInput = document.getElementById('holiday-year'); 
    yearInput.value = new Date().getFullYear();
    let currentEditingOldDate = null;
    
    async function loadHolidays() {
      const year = String(yearInput.value || '').trim(); 
      const list = document.getElementById('holiday-list');
      if (!/^[0-9]{4}$/.test(year)) { 
        list.innerHTML = '<div class="holiday-empty">Enter a valid 4-digit year.</div>'; 
        return; 
      }
      list.innerHTML = '<div class="holiday-empty">Loading holidays...</div>';
      try {
        const r = await fetch('/api/holidays?year=' + encodeURIComponent(year));
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load holidays');
        const holidays = data.holidays || [];
        if (!holidays.length) { 
          list.innerHTML = '<div class="holiday-empty">No holidays configured for ' + year + '.</div>'; 
          return; 
        }
        list.innerHTML = '<table class="holiday-table"><thead><tr><th>Date</th><th>Holiday</th><th style="text-align:right">Actions</th></tr></thead><tbody>' + holidays.map(function(h) {
          return '<tr><td>' + escapeHtml(h.date) + '</td><td>' + escapeHtml(h.name) + '</td><td style="text-align:right"><button class="btn btn-ghost holiday-btn-sm holiday-edit" data-date="' + escapeHtml(h.date) + '" data-name="' + escapeHtml(h.name) + '">✏️ Edit</button><button class="btn btn-danger holiday-btn-sm holiday-delete" data-date="' + escapeHtml(h.date) + '" data-name="' + escapeHtml(h.name) + '">🗑️ Delete</button></td></tr>';
        }).join('') + '</tbody></table>';
        
        list.querySelectorAll('.holiday-delete').forEach(function(b) {
          b.onclick = async function() {
            const confirmed = typeof window.showThemeConfirmModal === 'function'
              ? await window.showThemeConfirmModal({
                  title: '🗑️ Delete Holiday',
                  message: `Are you sure you want to delete the holiday "${b.dataset.name || 'this holiday'}" (${b.dataset.date})?`,
                  okText: 'Yes, Delete',
                  cancelText: 'Cancel',
                  isDanger: true
                })
              : confirm(`Delete this holiday (${b.dataset.date})?`);

            if (!confirmed) return;
            try {
              const r = await fetch('/api/holidays', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: year, date: b.dataset.date })
              });
              const x = await r.json();
              if (!r.ok) throw new Error(x.error || 'Unable to delete holiday');
              window.showToast('Holiday deleted.', 'success');
              loadHolidays();
            } catch(e) {
              window.showToast(e.message, 'error');
            }
          };
        });

        list.querySelectorAll('.holiday-edit').forEach(function(b) {
          b.onclick = function() {
            openHolidayForm(b.dataset.date, b.dataset.name);
          };
        });
      } catch(e) {
        list.innerHTML = '<div class="holiday-empty">' + escapeHtml(e.message) + '</div>';
      }
    }
    
    function escapeHtml(v) {
      return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function openHolidayForm(editDate = null, editName = null) {
      currentEditingOldDate = editDate;
      const titleEl = document.getElementById('holiday-form-title');
      const dateEl = document.getElementById('holiday-form-date');
      const nameEl = document.getElementById('holiday-form-name');
      const selectedYear = String(yearInput.value || new Date().getFullYear()).trim();

      if (editDate && editName) {
        titleEl.textContent = '✏️ Edit Holiday';
        dateEl.value = editDate;
        nameEl.value = editName;
      } else {
        titleEl.textContent = '➕ Add Holiday';
        dateEl.value = `${selectedYear}-01-01`;
        nameEl.value = '';
      }
      formModal.style.display = 'flex';
      setTimeout(() => nameEl.focus(), 50);
    }
    
    document.getElementById('holiday-load').onclick = loadHolidays;
    document.getElementById('holiday-close').onclick = function() { modal.style.display = 'none'; };
    btn.onclick = function() { modal.style.display = 'flex'; loadHolidays(); };
    document.getElementById('holiday-add').onclick = () => openHolidayForm();

    document.getElementById('holiday-form-cancel').onclick = () => { formModal.style.display = 'none'; };
    document.getElementById('holiday-form-save').onclick = async function() {
      const year = String(yearInput.value || '').trim();
      const date = String(document.getElementById('holiday-form-date').value || '').trim();
      const name = String(document.getElementById('holiday-form-name').value || '').trim();

      if (!date) {
        window.showToast('Please select a holiday date.', 'error');
        return;
      }
      if (!name) {
        window.showToast('Please enter a holiday name.', 'error');
        return;
      }

      const saveBtn = document.getElementById('holiday-form-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        // If editing and date changed, delete previous date entry first
        if (currentEditingOldDate && currentEditingOldDate !== date) {
          await fetch('/api/holidays', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year: year, date: currentEditingOldDate })
          });
        }

        const r = await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: year, date: date, name: name })
        });
        const x = await r.json();
        if (!r.ok) throw new Error(x.error || 'Unable to save holiday');
        
        window.showToast(currentEditingOldDate ? 'Holiday updated.' : 'Holiday added.', 'success');
        formModal.style.display = 'none';
        loadHolidays();
      } catch(e) {
        window.showToast(e.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Holiday';
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHolidayUI);
  } else {
    injectHolidayUI();
  }
})();
