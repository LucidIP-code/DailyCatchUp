module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>IP Team Portal</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block;overflow:hidden;background:#10131a}</style></head>
<body><iframe id="app" src="/app"></iframe>
<script>
const frame=document.getElementById('app');
frame.addEventListener('load',()=>{
  const w=frame.contentWindow,d=frame.contentDocument;
  if(!w||!d||w.__peopleEmailPatched)return;
  w.__peopleEmailPatched=true;
  const originalHandle=w.handleDropdownChange;
  const originalSubmit=w.submitInputModal;
  const originalClose=w.closeInputModal;
  let selectedPersonSelect=null;
  let selectedInputType='';

  function injectTheme(){
    if(d.getElementById('people-email-theme'))return;
    const style=d.createElement('style');
    style.id='people-email-theme';
    style.textContent='#person-email-group{margin-top:14px}#person-email-group label{display:block;color:var(--accent);font-size:.82rem;font-weight:700;margin-bottom:6px}#person-email-input{width:100%;box-sizing:border-box;background:#292e38!important;color:#e8edf5!important;border:1px solid #3f4655!important;border-radius:8px!important;padding:11px 12px!important;font:inherit!important;outline:none!important;box-shadow:none!important;transition:border-color .2s,box-shadow .2s}#person-email-input::placeholder{color:#8e97a7!important;opacity:1}#person-email-input:focus{border-color:var(--accent)!important;box-shadow:0 0 0 2px rgba(92,191,237,.12)!important}#person-email-group input:-webkit-autofill,#person-email-group input:-webkit-autofill:hover,#person-email-group input:-webkit-autofill:focus{-webkit-text-fill-color:#e8edf5!important;-webkit-box-shadow:0 0 0 1000px #292e38 inset!important;transition:background-color 9999s ease-out 0s}';
    d.head.appendChild(style);
  }

  function ensureEmail(){
    let group=d.getElementById('person-email-group');
    if(group)return group;
    const value=d.getElementById('input-modal-value');
    if(!value)return null;
    group=d.createElement('div');
    group.id='person-email-group';
    group.className='form-group';
    group.innerHTML='<label>Email ID:</label><input type="email" id="person-email-input" placeholder="name@company.com" autocomplete="email">';
    const parent=value.closest('.form-group');
    if(parent)parent.insertAdjacentElement('afterend',group);
    injectTheme();
    return group;
  }

  w.handleDropdownChange=function(selectElem,type){
    originalHandle.call(this,selectElem,type);
    const group=ensureEmail();
    if(!group)return;
    const isPerson=selectElem.value==='__ADD_NEW__'&&type==='name';
    group.style.display=isPerson?'block':'none';
    if(isPerson){
      selectedPersonSelect=selectElem;
      selectedInputType='name';
      d.getElementById('input-modal-title').textContent='👤 Add New Person';
      d.getElementById('input-modal-label').textContent='Enter Person Name:';
      d.getElementById('person-email-input').value='';
      d.getElementById('person-email-input').required=true;
      const btn=d.querySelector('#input-modal .btn-primary');
      if(btn)btn.textContent='Add Person';
    } else if(type==='project') {
      selectedPersonSelect=null;
      selectedInputType='project';
      group.style.display='none';
    }
  };

  w.closeInputModal=function(){
    const g=ensureEmail();
    if(g)g.style.display='none';
    selectedPersonSelect=null;
    selectedInputType='';
    return originalClose.call(this);
  };

  w.submitInputModal=async function(){
    if(selectedInputType!=='name')return originalSubmit.call(this);
    const name=(d.getElementById('input-modal-value').value||'').trim();
    const email=(d.getElementById('person-email-input').value||'').trim();
    if(!name){w.showToast('Please enter a valid person name.','error');return}
    if(!/^\\S+@\\S+\\.\\S+$/.test(email)){w.showToast('Please enter a valid email address.','error');return}
    try{
      const response=await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to save person');
      const current=selectedPersonSelect;
      await w.loadOptions();
      if(current)current.value=name;
      const group=ensureEmail();
      if(group)group.style.display='none';
      d.getElementById('input-modal').style.display='none';
      selectedPersonSelect=null;
      selectedInputType='';
      w.showToast('Added '+name+' with email address.','success');
    }catch(error){
      w.showToast(error.message||'Unable to add person','error');
    }
  };

  function injectHolidayUI(){
    if(d.getElementById('holiday-manager-btn'))return;
    const style=d.createElement('style');
    style.id='holiday-manager-theme';
    style.textContent=`
      #holiday-manager-btn{margin-left:8px}
      #holiday-modal{background:rgba(3,7,12,.78)!important;backdrop-filter:blur(6px)}
      #holiday-modal .holiday-modal-card{background:var(--surface)!important;color:var(--text);border:1px solid var(--border)!important;border-top:3px solid var(--accent)!important;border-radius:var(--radius)!important;box-shadow:var(--shadow-lg)!important;max-width:680px;width:92%;padding:22px}
      #holiday-modal .holiday-title{color:var(--accent);font-size:1.05rem;font-weight:800;margin-bottom:7px}
      #holiday-modal .holiday-description{font-size:.82rem;color:var(--muted);line-height:1.5;margin-bottom:16px}
      #holiday-modal .holiday-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap}
      #holiday-modal .holiday-toolbar label{color:var(--accent);font-size:.82rem;font-weight:700}
      #holiday-modal .holiday-year{width:100px!important;height:38px!important;background:var(--surface2)!important;color:var(--text)!important;border:1px solid var(--border-light)!important;border-radius:8px!important;padding:8px 10px!important;font:inherit!important;outline:none!important}
      #holiday-modal .holiday-year:focus{border-color:var(--accent)!important;box-shadow:0 0 0 2px rgba(92,191,237,.12)!important}
      #holiday-modal .holiday-table-wrap{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:rgba(34,37,45,.55)}
      #holiday-modal .holiday-table{width:100%;border-collapse:collapse;margin:0}
      #holiday-modal .holiday-table th,#holiday-modal .holiday-table td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left}
      #holiday-modal .holiday-table tr:last-child td{border-bottom:0}
      #holiday-modal .holiday-table th{background:var(--surface2);color:var(--accent);font-size:.76rem;text-transform:uppercase;letter-spacing:.04em}
      #holiday-modal .holiday-table td{font-size:.84rem;color:var(--text)}
      #holiday-modal .holiday-table td:first-child{font-variant-numeric:tabular-nums;white-space:nowrap}
      #holiday-modal .holiday-delete{padding:5px 9px!important}
      #holiday-modal .holiday-empty{padding:20px;text-align:center;color:var(--muted);background:rgba(34,37,45,.45);border:1px dashed var(--border);border-radius:10px}
      #holiday-modal .holiday-add-form{display:grid;grid-template-columns:1fr 1.6fr auto;gap:8px;align-items:end;margin-top:14px;padding:12px;background:rgba(34,37,45,.55);border:1px solid var(--border);border-radius:10px}
      #holiday-modal .holiday-field label{display:block;color:var(--accent);font-size:.72rem;font-weight:700;margin-bottom:5px}
      #holiday-modal .holiday-field input{width:100%;height:36px;box-sizing:border-box;background:var(--surface2)!important;color:var(--text)!important;border:1px solid var(--border-light)!important;border-radius:7px!important;padding:7px 9px!important;font:inherit!important;outline:none!important}
      #holiday-modal .holiday-field input:focus{border-color:var(--accent)!important;box-shadow:0 0 0 2px rgba(92,191,237,.12)!important}
      #holiday-modal .holiday-footer{display:flex;justify-content:flex-end;margin-top:16px}
      @media(max-width:600px){#holiday-modal .holiday-add-form{grid-template-columns:1fr}.holiday-toolbar{align-items:stretch}}
    `;
    d.head.appendChild(style);
    const actions=d.querySelector('.top-actions')||d.querySelector('.header');
    if(!actions)return;
    const btn=d.createElement('button');
    btn.id='holiday-manager-btn'; btn.className='btn btn-ghost'; btn.textContent='📅 Manage Holidays';
    actions.appendChild(btn);
    const modal=d.createElement('div'); modal.id='holiday-modal'; modal.className='modal';
    modal.innerHTML='<div class="holiday-modal-card"><h3 class="holiday-title">📅 Manage Holidays</h3><p class="holiday-description">Maintain government/company holidays by year. These dates will later be used to skip daily reminders and Catch-up posts.</p><div class="holiday-toolbar"><label for="holiday-year">Year:</label><input id="holiday-year" class="holiday-year" type="number" min="2000" max="2100"><button id="holiday-load" class="btn btn-ghost btn-sm">Load</button><button id="holiday-add-toggle" class="btn btn-primary btn-sm">+ Add Holiday</button></div><div id="holiday-list"></div><div id="holiday-add-form" class="holiday-add-form" style="display:none"><div class="holiday-field"><label for="holiday-date">Date</label><input id="holiday-date" type="date"></div><div class="holiday-field"><label for="holiday-name">Holiday Name</label><input id="holiday-name" type="text" placeholder="e.g. Republic Day" maxlength="100"></div><button id="holiday-save" class="btn btn-primary btn-sm">Save</button></div><div class="holiday-footer"><button id="holiday-close" class="btn btn-ghost">Close</button></div></div>';
    d.body.appendChild(modal);
    const yearInput=d.getElementById('holiday-year'); yearInput.value=new Date().getFullYear();
    const addForm=d.getElementById('holiday-add-form');
    const dateInput=d.getElementById('holiday-date');
    const nameInput=d.getElementById('holiday-name');
    function syncDateYear(){if(/^\\d{4}$/.test(String(yearInput.value||'')))dateInput.min=yearInput.value+'-01-01',dateInput.max=yearInput.value+'-12-31';}
    syncDateYear();
    async function loadHolidays(){
      const year=String(yearInput.value||'').trim(); const list=d.getElementById('holiday-list');
      if(!/^\\d{4}$/.test(year)){list.innerHTML='<div class="holiday-empty">Enter a valid 4-digit year.</div>';return;}
      syncDateYear();
      list.innerHTML='<div class="holiday-empty">Loading holidays...</div>';
      try{const r=await fetch('/api/holidays?year='+encodeURIComponent(year));const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to load holidays');
        const holidays=data.holidays||[];
        if(!holidays.length){list.innerHTML='<div class="holiday-empty">No holidays configured for '+year+'.</div>';return;}
        list.innerHTML='<div class="holiday-table-wrap"><table class="holiday-table"><thead><tr><th>Date</th><th>Holiday</th><th></th></tr></thead><tbody>'+holidays.map(function(h){return '<tr><td>'+escapeHtml(h.date)+'</td><td>'+escapeHtml(h.name)+'</td><td style="text-align:right"><button class="btn btn-danger btn-sm holiday-delete" data-date="'+escapeHtml(h.date)+'">Delete</button></td></tr>';}).join('')+'</tbody></table></div>';
        list.querySelectorAll('.holiday-delete').forEach(function(b){b.onclick=async function(){if(!confirm('Delete this holiday?'))return;try{const r=await fetch('/api/holidays',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:year,date:b.dataset.date})});const x=await r.json();if(!r.ok)throw new Error(x.error||'Unable to delete holiday');w.showToast('Holiday deleted.','success');loadHolidays();}catch(e){w.showToast(e.message,'error');}};});
      }catch(e){list.innerHTML='<div class="holiday-empty">'+escapeHtml(e.message)+'</div>';}
    }
    function escapeHtml(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}
    d.getElementById('holiday-load').onclick=loadHolidays;
    yearInput.addEventListener('change',syncDateYear);
    d.getElementById('holiday-close').onclick=function(){modal.style.display='none';addForm.style.display='none';};
    btn.onclick=function(){modal.style.display='flex';addForm.style.display='none';loadHolidays();};
    d.getElementById('holiday-add-toggle').onclick=function(){syncDateYear();addForm.style.display=addForm.style.display==='none'?'grid':'none';if(addForm.style.display==='grid'){dateInput.value='';nameInput.value='';dateInput.focus();}};
    d.getElementById('holiday-save').onclick=async function(){
      const year=String(yearInput.value||'').trim();
      const date=String(dateInput.value||'').trim();
      const name=String(nameInput.value||'').trim();
      if(!/^\\d{4}$/.test(year)){w.showToast('Enter a valid 4-digit year.','error');return;}
      if(!date){w.showToast('Select a holiday date.','error');return;}
      if(!name){w.showToast('Enter a holiday name.','error');return;}
      try{const r=await fetch('/api/holidays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:year,date:date,name:name})});const x=await r.json();if(!r.ok)throw new Error(x.error||'Unable to add holiday');w.showToast('Holiday added.','success');addForm.style.display='none';loadHolidays();}catch(e){w.showToast(e.message,'error');}
    };
  }

  ensureEmail();
  injectHolidayUI();
  const observer=new MutationObserver(()=>{ensureEmail();injectHolidayUI();});
  observer.observe(d.body,{childList:true,subtree:true});
});
</script></body></html>`);
};