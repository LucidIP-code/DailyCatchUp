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
    style.textContent='#holiday-manager-btn{margin-left:8px}.holiday-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}.holiday-year{width:110px!important}.holiday-table{width:100%;border-collapse:collapse;margin-top:10px}.holiday-table th,.holiday-table td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}.holiday-table th{color:var(--accent);font-size:.8rem}.holiday-delete{padding:5px 9px!important}.holiday-empty{padding:18px;text-align:center;color:var(--muted)}';
    d.head.appendChild(style);
    const actions=d.querySelector('.top-actions')||d.querySelector('.header');
    if(!actions)return;
    const btn=d.createElement('button');
    btn.id='holiday-manager-btn'; btn.className='btn btn-ghost'; btn.textContent='📅 Manage Holidays';
    actions.appendChild(btn);
    const modal=d.createElement('div'); modal.id='holiday-modal'; modal.className='modal';
    modal.innerHTML=`<div class="modal-content" style="border-top:4px solid var(--accent);max-width:620px;width:92%;"><h3 style="color:var(--accent);margin-bottom:12px;">📅 Manage Holidays</h3><p style="font-size:.85rem;color:var(--muted);margin-bottom:14px;">Maintain government/company holidays by year. These dates will later be used to skip daily reminders and Catch-up posts.</p><div class="holiday-toolbar"><label for="holiday-year">Year:</label><input id="holiday-year" class="holiday-year" type="number" min="2000" max="2100"><button id="holiday-load" class="btn btn-ghost btn-sm">Load</button><button id="holiday-add" class="btn btn-primary btn-sm">+ Add Holiday</button></div><div id="holiday-list"></div><div style="display:flex;justify-content:flex-end;margin-top:16px;"><button id="holiday-close" class="btn btn-ghost">Close</button></div></div>`;
    d.body.appendChild(modal);
    const yearInput=d.getElementById('holiday-year'); yearInput.value=new Date().getFullYear();
    async function loadHolidays(){
      const year=String(yearInput.value||'').trim(); const list=d.getElementById('holiday-list');
      if(!/^\\d{4}$/.test(year)){list.innerHTML='<div class="holiday-empty">Enter a valid 4-digit year.</div>';return;}
      list.innerHTML='<div class="holiday-empty">Loading holidays...</div>';
      try{const r=await fetch('/api/holidays?year='+encodeURIComponent(year));const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to load holidays');
        const holidays=data.holidays||[]; if(!holidays.length){list.innerHTML='<div class="holiday-empty">No holidays configured for '+year+'.</div>';return;}
        list.innerHTML='<table class="holiday-table"><thead><tr><th>Date</th><th>Holiday</th><th></th></tr></thead><tbody>'+holidays.map(h=>`<tr><td>${h.date}</td><td>${escapeHtml(h.name)}</td><td style="text-align:right"><button class="btn btn-danger btn-sm holiday-delete" data-date="${h.date}">Delete</button></td></tr>`).join('')+'</tbody></table>';
        list.querySelectorAll('.holiday-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this holiday?'))return;try{const r=await fetch('/api/holidays',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,date:b.dataset.date})});const x=await r.json();if(!r.ok)throw new Error(x.error||'Unable to delete holiday');w.showToast('Holiday deleted.','success');loadHolidays();}catch(e){w.showToast(e.message,'error')}});
      }catch(e){list.innerHTML='<div class="holiday-empty">'+escapeHtml(e.message)+'</div>';}
    }
    function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
    d.getElementById('holiday-load').onclick=loadHolidays;
    d.getElementById('holiday-close').onclick=()=>modal.style.display='none';
    btn.onclick=()=>{modal.style.display='flex';loadHolidays();};
    d.getElementById('holiday-add').onclick=async()=>{
      const year=String(yearInput.value||'').trim();
      const date=prompt('Holiday date (YYYY-MM-DD):',''); if(date===null)return;
      const name=prompt('Holiday name:',''); if(name===null)return;
      try{const r=await fetch('/api/holidays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,date,name})});const x=await r.json();if(!r.ok)throw new Error(x.error||'Unable to add holiday');w.showToast('Holiday added.','success');loadHolidays();}catch(e){w.showToast(e.message,'error');}
    };
  }

  ensureEmail();
  injectHolidayUI();
  const observer=new MutationObserver(()=>{ensureEmail();injectHolidayUI();});
  observer.observe(d.body,{childList:true,subtree:true});
});
</script></body></html>`);
};
