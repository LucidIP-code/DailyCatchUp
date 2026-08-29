(() => {
  function emailGroup() { return document.getElementById('person-email-group'); }
  function ensureEmailField() {
    if (emailGroup()) return;
    const group = document.createElement('div');
    group.id = 'person-email-group';
    group.className = 'form-group';
    group.innerHTML = '<label id="person-email-label">Email ID:</label><input type="email" id="person-email-input" placeholder="name@company.in" autocomplete="email">';
    const valueGroup = document.getElementById('input-modal-value').closest('.form-group');
    valueGroup.insertAdjacentElement('afterend', group);
  }

  const originalHandle = window.handleDropdownChange;
  window.handleDropdownChange = function(selectElem, type) {
    originalHandle.call(this, selectElem, type);
    ensureEmailField();
    const group = emailGroup();
    if (!group) return;
    const isPerson = selectElem.value === '__ADD_NEW__' && type === 'name';
    group.style.display = isPerson ? 'block' : 'none';
    if (isPerson) {
      document.getElementById('input-modal-title').textContent = '👤 Add New Person';
      document.getElementById('person-email-input').value = '';
      document.getElementById('person-email-input').required = true;
    }
  };

  const originalClose = window.closeInputModal;
  window.closeInputModal = function() {
    const group = emailGroup();
    if (group) group.style.display = 'none';
    return originalClose.call(this);
  };

  const originalSubmit = window.submitInputModal;
  window.submitInputModal = async function() {
    if (window.activeInputType !== 'name') return originalSubmit.call(this);
    ensureEmailField();
    const name = document.getElementById('input-modal-value').value.trim();
    const email = document.getElementById('person-email-input').value.trim();
    if (!name) return window.showToast('Please enter a valid name.', 'error');
    if (!email) return window.showToast('Please enter an email address.', 'error');
    try {
      const response = await fetch('/api/people', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save person');
      const currentElem = window.activeSelectElem;
      await window.loadOptions();
      if (currentElem) currentElem.value = name;
      window.showToast(`Added ${name} with email address`, 'success');
      const group = emailGroup();
      if (group) group.style.display = 'none';
      document.getElementById('input-modal').style.display = 'none';
    } catch (error) {
      window.showToast(error.message || 'Failed to add person', 'error');
    }
  };

  window.addEventListener('DOMContentLoaded', () => {
    ensureEmailField();
    emailGroup().style.display = 'none';
  });
})();
