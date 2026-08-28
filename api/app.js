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
  function ensureEmail(){
    let group=d.getElementById('person-email-group');
    if(group)return group;
    const value=d.getElementById('input-modal-value');
    if(!value)return null;
    group=d.createElement('div');
    group.id='person-email-group';
    group.className='form-group';
    group.innerHTML='<label>Email ID:</label><input type="email" id="person-email-input" placeholder="name@company.com" autocomplete="email" style="width:100%;box-sizing:border-box">';
    value.closest('.form-group').insertAdjacentElement('afterend',group);
    return group;
  }
  w.handleDropdownChange=function(selectElem,type){
    originalHandle.call(this,selectElem,type);
    const group=ensureEmail();
    if(!group)return;
    const isPerson=selectElem.value==='__ADD_NEW__'&&type==='name';
    group.style.display=isPerson?'block':'none';
    if(isPerson){
      d.getElementById('input-modal-title').textContent='👤 Add New Person';
      d.getElementById('input-modal-label').textContent='Enter Person Name:';
      d.getElementById('person-email-input').value='';
      d.querySelector('#input-modal .btn-primary').textContent='Add Person';
    }
  };
  w.closeInputModal=function(){const g=ensureEmail();if(g)g.style.display='none';return originalClose.call(this)};
  w.submitInputModal=async function(){
    if(w.activeInputType!=='name')return originalSubmit.call(this);
    const name=(d.getElementById('input-modal-value').value||'').trim();
    const email=(d.getElementById('person-email-input').value||'').trim();
    if(!name){w.showToast('Please enter a valid person name.','error');return}
    if(!email){w.showToast('Please enter an email address.','error');return}
    try{
      const response=await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to save person');
      const current=w.activeSelectElem;
      await w.loadOptions();
      if(current)current.value=name;
      ensureEmail().style.display='none';
      d.getElementById('input-modal').style.display='none';
      w.activeSelectElem=null;w.activeInputType='';
      w.showToast('Added '+name+' with email address.','success');
    }catch(error){w.showToast(error.message||'Unable to add person.','error')}
  };
  const observer=new MutationObserver(()=>ensureEmail());
  observer.observe(d.body,{childList:true,subtree:true});
});
</script></body></html>`);
};
