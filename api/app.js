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

  ensureEmail();
  const observer=new MutationObserver(()=>ensureEmail());
  observer.observe(d.body,{childList:true,subtree:true});
});
</script></body></html>`);
};
