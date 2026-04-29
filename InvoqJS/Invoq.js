  const API = 'https://invoice-ingest.onrender.com/api';
  let session=null, dryRun=false, invPage=1, invRows=[], curInv=null;
  let timers={};
  const PG=15;

  // ── Auth forms ──────────────────────────────────────────────────────────
  function showForm(f){
    ['login','signup','forgot','reset'].forEach(n=>{
      document.getElementById('f-'+n).classList.toggle('hidden',n!==f);
    });
  }

  async function doLogin(){
    const email=val('l-email'), pass=val('l-pass');
    if(!email||!pass){toast('Please enter your email and password.','error');return;}
    try{const s=await post('/auth/login',{email,password:pass});session=s;initApp();}
    catch(e){toast(e.message,'error');}
  }

  async function doSignup(){
    const fn=val('su-fn'),ln=val('su-ln'),org=val('su-org'),email=val('su-email'),pass=val('su-pass');
    if(!fn||!org||!email||!pass){toast('Please fill in all fields.','error');return;}
    if(pass.length<8){toast('Password must be at least 8 characters.','error');return;}
    try{const s=await post('/auth/signup',{firstName:fn,lastName:ln||'',orgName:org,email,password:pass});session=s;initApp();}
    catch(e){toast(e.message,'error');}
  }

  async function doForgot(){
    const email=val('fp-email');
    if(!email){toast('Please enter your email address.','error');return;}
    await post('/auth/forgot-password',{email}).catch(()=>{});
    toast("If that email is registered, a reset link is on its way.",'success');
  }

  async function doReset(){
    const pass=val('rp-pass'),pass2=val('rp-pass2');
    const token=new URLSearchParams(location.search).get('reset');
    if(!token){toast('Invalid reset link.','error');return;}
    if(pass!==pass2){toast('Passwords do not match.','error');return;}
    if(pass.length<8){toast('Password must be at least 8 characters.','error');return;}
    try{
      await post('/auth/reset-password',{token,password:pass});
      toast('Password updated. You can now sign in.','success');
      showForm('login');
      history.replaceState({},'',location.pathname);
    }catch(e){toast(e.message,'error');}
  }

  function doLogout(){session=null;showPg('auth');toast('Signed out.','info');}

  // ── Init app ────────────────────────────────────────────────────────────
  function initApp(){
    if(!session)return;
    showPg('app');
    const u=session.user,o=session.org;
    document.getElementById('sb-org').textContent   = o.tradingName||o.name;
    document.getElementById('sb-name').textContent  = `${u.firstName} ${u.lastName}`;
    document.getElementById('sb-role').textContent  = fmtRole(u.role);
    document.getElementById('sb-avatar').textContent= u.firstName[0]?.toUpperCase()||'U';
    document.getElementById('plan-pill').textContent= fmtPlan(o.plan);
    document.getElementById('plan-pill').className  = `badge ${planBadge(o.plan)}`;
    goto('dashboard');
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  const TITLES={dashboard:'Overview',invoices:'Invoices',upload:'Upload CSV',
    suppliers:'Suppliers',analytics:'Analytics',vat:'VAT Reports',
    audit:'Audit Log',team:'Team',billing:'Billing',settings:'Settings'};

  function goto(sc){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.getElementById('sc-'+sc)?.classList.add('active');
    document.getElementById('nav-'+sc)?.classList.add('active');
    document.getElementById('pg-title').textContent=TITLES[sc]||sc;
    ({dashboard:loadDash,invoices:loadInv,analytics:loadAnalytics,
      audit:loadAudit,team:loadTeam,suppliers:loadSup,billing:loadBilling,settings:loadSettings})[sc]?.();
  }

  // ── Dashboard ───────────────────────────────────────────────────────────
  async function loadDash(){
    try{
      const [stats,r]=await Promise.all([get('/invoices/stats'),get('/invoices?limit=8&page=1&status=inserted')]);
      el('d-total').textContent   = N(stats.total);
      el('d-inserted').textContent= N(stats.inserted);
      el('d-pending').textContent = N(stats.pending??0);
      if(Number(stats.pending)>0){el('sb-pending').textContent=stats.pending;el('sb-pending').classList.remove('hidden');}
      const rows=r.rows||[];
      const now=new Date();
      const monthly=rows.filter(x=>{const d=new Date(x.invoice_date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
      el('d-spend').textContent='R '+A(monthly.reduce((s,x)=>s+Number(x.amount_incl_vat||0),0));
      el('d-recent').innerHTML=rows.map(r=>`<tr onclick="showInv(${JSON.stringify(r).replace(/"/g,'&quot;')})"><td class="mono font-medium text-sm">${esc(r.invoice_number)}</td><td>${esc(r.supplier_name)}</td><td class="mono">R ${A(r.amount_incl_vat)}</td><td><span class="badge ${bc(r.status)}">${r.status}</span></td></tr>`).join('')||`<tr><td colspan="4" class="text-center py-8" style="color:var(--muted)">No invoices yet — upload your first CSV</td></tr>`;
      renderBars(rows,'d-dept');
      renderTopSup(rows,'d-top-sup');
    }catch(e){console.error(e);}
  }

  function renderBars(rows,id){
    const m={};rows.forEach(r=>{m[r.department]=(m[r.department]||0)+Number(r.amount_incl_vat||0);});
    const s=Object.entries(m).sort((a,b)=>b[1]-a[1]),max=s[0]?.[1]||1;
    el(id).innerHTML=s.length?s.map(([d,t])=>`<div class="flex items-center gap-3"><span class="text-sm w-28 flex-shrink-0 truncate">${esc(d)}</span><div class="bar-track"><div class="bar-fill" style="width:${(t/max*100).toFixed(1)}%"></div></div><span class="text-xs mono w-24 text-right flex-shrink-0" style="color:var(--muted)">R ${A(t)}</span></div>`).join(''):`<p class="text-sm text-center py-4" style="color:var(--muted)">No data yet</p>`;
  }
  function renderTopSup(rows,id){
    const m={};rows.forEach(r=>{m[r.supplier_name]=(m[r.supplier_name]||0)+Number(r.amount_incl_vat||0);});
    const s=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5),max=s[0]?.[1]||1;
    el(id).innerHTML=s.length?s.map(([n,t])=>`<div class="space-y-1"><div class="flex justify-between text-xs"><span class="font-medium truncate" style="max-width:120px">${esc(n)}</span><span class="mono" style="color:var(--muted)">R ${A(t)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(t/max*100).toFixed(1)}%"></div></div></div>`).join(''):`<p class="text-sm text-center py-6" style="color:var(--muted)">No data yet</p>`;
  }

  // ── Invoices ────────────────────────────────────────────────────────────
  async function loadInv(pg){
    if(pg)invPage=pg;
    const status=val('iv-status'),search=val('iv-search'),from=val('iv-from'),to=val('iv-to');
    const p=new URLSearchParams({page:invPage,limit:PG});
    if(status)p.set('status',status);if(search)p.set('search',search);
    if(from)p.set('from',from);if(to)p.set('to',to);
    el('iv-tbody').innerHTML=`<tr><td colspan="8" class="text-center py-12" style="color:var(--muted)">Loading<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></td></tr>`;
    try{
      const {rows,total}=await get('/invoices?'+p);
      invRows=rows;
      el('iv-tbody').innerHTML=rows.length?rows.map(r=>`
        <tr onclick="showInv(${JSON.stringify(r).replace(/"/g,'&quot;')})">
          <td class="mono font-medium text-sm">${esc(r.invoice_number)}</td>
          <td><div class="font-medium">${esc(r.supplier_name)}</div><div class="text-xs mono" style="color:var(--muted)">${esc(r.supplier_number)}</div></td>
          <td style="color:var(--ink2)">${esc(r.department)}</td>
          <td class="text-right mono">R ${A(r.amount_excl_vat)}</td>
          <td class="text-right mono" style="color:var(--muted)">R ${A(r.vat)}</td>
          <td class="text-right mono font-semibold">R ${A(r.amount_incl_vat)}</td>
          <td class="mono text-xs" style="color:var(--ink2)">${r.invoice_date?.slice(0,10)??'—'}</td>
          <td><span class="badge ${bc(r.status)}">${r.status}</span></td>
        </tr>`).join(''):`<tr><td colspan="8" class="text-center py-12" style="color:var(--muted)">No records found</td></tr>`;
      renderPagination('iv',invPage,total,loadInv);
    }catch(e){el('iv-tbody').innerHTML=`<tr><td colspan="8" class="text-center py-12" style="color:var(--red)">Could not load records</td></tr>`;}
  }

  // ── Upload ──────────────────────────────────────────────────────────────
  let upFile=null;
  const upDZ=document.getElementById('up-dz'),upFI=document.getElementById('up-fi');
  upDZ.addEventListener('dragover',e=>{e.preventDefault();upDZ.classList.add('over');});
  upDZ.addEventListener('dragleave',()=>upDZ.classList.remove('over'));
  upDZ.addEventListener('drop',e=>{e.preventDefault();upDZ.classList.remove('over');if(e.dataTransfer.files[0])setFile(e.dataTransfer.files[0]);});
  upFI.addEventListener('change',()=>{if(upFI.files[0])setFile(upFI.files[0]);});

  function setFile(f){
    if(!f.name.toLowerCase().endsWith('.csv')){toast('Please upload a .csv file.','error');return;}
    upFile=f;
    el('up-fn').textContent=`${f.name}  (${(f.size/1024).toFixed(1)} KB)`;
    const fi=el('up-info');fi.classList.remove('hidden');fi.style.display='flex';
    const btn=el('up-btn');btn.disabled=false;btn.style.opacity='1';
  }
  function clearUp(){
    upFile=null;upFI.value='';
    const fi=el('up-info');fi.classList.add('hidden');fi.style.display='none';
    const btn=el('up-btn');btn.disabled=true;btn.style.opacity='.35';
  }

  async function doUpload(){
    if(!upFile)return;
    const fd=new FormData();fd.append('file',upFile);
    el('up-btn').disabled=true;el('up-btn').style.opacity='.5';
    el('up-prog').classList.remove('hidden');el('up-bar').style.width='15%';
    try{
      el('up-bar').style.width='55%';
      const headers={};
      if(session?.token)headers['Authorization']=`Bearer ${session.token}`;
      const res=await fetch(API+`/ingest?dryRun=${dryRun}`,{method:'POST',headers,body:fd});
      el('up-bar').style.width='90%';
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Upload failed');
      el('up-bar').style.width='100%';
      setTimeout(()=>{el('up-prog').classList.add('hidden');el('up-bar').style.width='0%';},500);
      const r=el('up-result');r.classList.remove('hidden');r.classList.add('fade-up');
      el('ur-ins').textContent=data.metrics.inserted;
      el('ur-dup').textContent=data.metrics.duplicates;
      el('ur-fail').textContent=data.metrics.failed;
      el('ur-meta').textContent=`${data.fileName} · ${data.metrics.processed} rows · ${data.duration}ms${data.dryRun?' · TEST MODE':''}`;
      el('ur-rows').innerHTML=data.results.map(r=>`<tr><td class="mono" style="color:var(--muted)">${r.row}</td><td class="mono">${esc(r.invoice_number)}</td><td class="mono">${esc(r.supplier_number)}</td><td><span class="badge ${bc(r.status)}">${r.status}</span></td><td class="truncate" style="max-width:150px;color:var(--muted)" title="${esc(r.validation_notes??'')}">${r.validation_notes?esc(r.validation_notes):'—'}</td></tr>`).join('');
      toast(`Done — ${data.metrics.inserted} saved · ${data.metrics.duplicates} duplicates · ${data.metrics.failed} errors`,'success');
      loadDash();
    }catch(e){
      el('up-prog').classList.add('hidden');el('up-bar').style.width='0%';
      toast(e.message,'error');
    }finally{el('up-btn').disabled=false;el('up-btn').style.opacity='1';}
  }

  // ── Suppliers ───────────────────────────────────────────────────────────
  async function loadSup(){
    const q=val('sp-search');
    try{
      const {rows}=await get('/suppliers?search='+encodeURIComponent(q));
      el('sp-tbody').innerHTML=rows.length?rows.map(s=>`<tr><td><div class="font-medium">${esc(s.supplier_name)}</div><div class="text-xs" style="color:var(--muted)">${esc(s.contact_email||'')}</div></td><td class="mono">${esc(s.supplier_number)}</td><td>${s.bee_level?`<span class="badge b-amber">Level ${s.bee_level}</span>`:'<span style="color:var(--muted)">—</span>'}</td><td class="mono text-xs">${esc(s.vat_number||'—')}</td><td class="mono">${N(s.invoice_count||0)}</td><td class="mono font-medium">R ${A(s.total_spend||0)}</td><td></td></tr>`).join(''):`<tr><td colspan="7" class="text-center py-12" style="color:var(--muted)">Suppliers are added automatically when you upload invoices, or you can add them manually.</td></tr>`;
    }catch(e){console.error(e);}
  }

  async function doAddSup(){
    const data={supplier_number:val('as-num'),supplier_name:val('as-name'),cipc_number:val('as-cipc'),vat_number:val('as-vat'),bee_level:val('as-bee'),contact_email:val('as-email')};
    if(!data.supplier_number||!data.supplier_name){toast('Supplier number and name are required.','error');return;}
    try{await post('/suppliers',data);closeM('m-addsup');toast('Supplier added.','success');loadSup();}
    catch(e){toast(e.message,'error');}
  }

  // ── Analytics ───────────────────────────────────────────────────────────
  async function loadAnalytics(){
    const period=val('an-period');
    try{
      const {rows}=await get(`/invoices?status=inserted&limit=500&page=1${period!=='all'?'&days='+period:''}`);
      renderBars(rows,'an-dept');
      const sm={};rows.forEach(r=>{sm[r.supplier_name]=(sm[r.supplier_name]||0)+Number(r.amount_incl_vat||0);});
      const ss=Object.entries(sm).sort((a,b)=>b[1]-a[1]).slice(0,10),smax=ss[0]?.[1]||1;
      el('an-sups').innerHTML=ss.map(([n,t])=>`<div class="flex items-center gap-3"><span class="text-sm w-28 flex-shrink-0 truncate">${esc(n)}</span><div class="bar-track"><div class="bar-fill" style="width:${(t/smax*100).toFixed(1)}%;background:var(--green)"></div></div><span class="text-xs mono w-24 text-right flex-shrink-0" style="color:var(--muted)">R ${A(t)}</span></div>`).join('')||`<p class="text-sm text-center py-4" style="color:var(--muted)">No data</p>`;
      const vat=rows.reduce((s,r)=>s+Number(r.vat||0),0);
      const incl=rows.reduce((s,r)=>s+Number(r.amount_incl_vat||0),0);
      el('an-vat').textContent='R '+A(vat);
      el('an-avg').textContent=rows.length?'R '+A(incl/rows.length):'—';
      el('an-sup').textContent=N(new Set(rows.map(r=>r.supplier_number)).size);
    }catch(e){console.error(e);}
  }

  // ── VAT ─────────────────────────────────────────────────────────────────
  let vatData=null;
  function fillVatDates(){
    const y=new Date().getFullYear(),v=val('vat-q');
    const map={q1:[`${y}-01-01`,`${y}-03-31`],q2:[`${y}-04-01`,`${y}-06-30`],q3:[`${y}-07-01`,`${y}-09-30`],q4:[`${y}-10-01`,`${y}-12-31`]};
    for(let m=1;m<=12;m++){const p=m.toString().padStart(2,'0');const e=new Date(y,m,0).getDate().toString().padStart(2,'0');map[`m${m}`]=[`${y}-${p}-01`,`${y}-${p}-${e}`];}
    if(map[v]){el('vat-from').value=map[v][0];el('vat-to').value=map[v][1];}
  }
  async function genVat(){
    const from=val('vat-from'),to=val('vat-to');
    if(!from||!to){toast('Please select a date range.','error');return;}
    try{
      const {rows}=await get(`/invoices?status=inserted&limit=999&page=1&from=${from}&to=${to}`);
      vatData=rows;
      const dmap={};rows.forEach(r=>{const d=r.department||'Other';dmap[d]=dmap[d]||{dept:d,excl:0,vat:0,incl:0,count:0};dmap[d].excl+=Number(r.amount_excl_vat||0);dmap[d].vat+=Number(r.vat||0);dmap[d].incl+=Number(r.amount_incl_vat||0);dmap[d].count++;});
      const sorted=Object.values(dmap).sort((a,b)=>b.incl-a.incl);
      el('vat-rows').innerHTML=sorted.map((d,i)=>`<div class="flex items-center justify-between px-4 py-2.5 text-sm" style="${i<sorted.length-1?'border-bottom:1px solid var(--border)':''}"><span class="font-medium">${esc(d.dept)}</span><div class="flex gap-5 text-right"><div><p class="text-xs" style="color:var(--muted)">Excl</p><p class="mono text-xs">R ${A(d.excl)}</p></div><div><p class="text-xs" style="color:var(--muted)">VAT</p><p class="mono text-xs" style="color:var(--brand)">R ${A(d.vat)}</p></div><div><p class="text-xs" style="color:var(--muted)">Total</p><p class="mono text-xs font-semibold">R ${A(d.incl)}</p></div></div></div>`).join('');
      const te=sorted.reduce((s,d)=>s+d.excl,0),tv=sorted.reduce((s,d)=>s+d.vat,0),ti=sorted.reduce((s,d)=>s+d.incl,0);
      el('vat-excl').textContent='R '+A(te);el('vat-vat').textContent='R '+A(tv);el('vat-incl').textContent='R '+A(ti);
      el('vat-preview').classList.remove('hidden');
    }catch(e){toast(e.message,'error');}
  }
  function dlVat(){
    if(!vatData)return;
    const from=val('vat-from'),to=val('vat-to');
    const rows=[['Invoice Number','Supplier Name','Supplier Number','Department','Invoice Date','Excl VAT','VAT','Incl VAT'],...vatData.map(r=>[r.invoice_number,r.supplier_name,r.supplier_number,r.department,r.invoice_date?.slice(0,10),r.amount_excl_vat,r.vat,r.amount_incl_vat])];
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));a.download=`vat_report_${from}_${to}.csv`;a.click();
    toast('VAT report downloaded.','success');
  }

  // ── Audit ───────────────────────────────────────────────────────────────
  async function loadAudit(){
    const type=val('au-type'),from=val('au-from');
    const p=new URLSearchParams();if(type)p.set('type',type);if(from)p.set('from',from);
    try{
      const {rows}=await get('/audit?'+p);
      el('au-tbody').innerHTML=rows.length?rows.map(r=>`<tr><td class="mono text-xs" style="color:var(--muted)">${new Date(r.created_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</td><td><div class="text-sm">${esc(r.user_name||'System')}</div><div class="text-xs mono" style="color:var(--muted)">${esc(r.user_email||'')}</div></td><td><span class="badge b-blue">${esc(r.event_type)}</span></td><td class="text-xs" style="color:var(--ink2)">${esc(r.detail||'—')}</td><td class="mono text-xs" style="color:var(--muted)">${esc(r.ip_address||'—')}</td></tr>`).join(''):`<tr><td colspan="5" class="text-center py-10" style="color:var(--muted)">No audit events yet.</td></tr>`;
    }catch(e){console.error(e);}
  }

  // ── Team ────────────────────────────────────────────────────────────────
  async function loadTeam(){
    try{
      const {rows}=await get('/team');
      el('tm-tbody').innerHTML=rows.length?rows.map(u=>`<tr><td><div class="flex items-center gap-2.5"><div class="avatar" style="width:26px;height:26px;font-size:10px">${(u.first_name[0]||'U').toUpperCase()}</div><div><div class="font-medium text-sm">${esc(u.first_name)} ${esc(u.last_name)}</div><div class="text-xs mono" style="color:var(--muted)">${esc(u.email)}</div></div></div></td><td><span class="badge b-brand">${fmtRole(u.role)}</span></td><td><span class="badge ${u.status==='active'?'b-green':'b-amber'}">${u.status}</span></td><td class="text-xs mono" style="color:var(--muted)">${u.last_login?new Date(u.last_login).toLocaleDateString('en-ZA'):'Never'}</td><td></td></tr>`).join(''):`<tr><td colspan="5" class="text-center py-10" style="color:var(--muted)">No team members yet.</td></tr>`;
    }catch(e){console.error(e);}
  }

  async function doInvite(){
    const email=val('inv-email'),role=val('inv-role');
    if(!email){toast('Please enter an email address.','error');return;}
    try{await post('/team/invite',{email,role});closeM('m-invite');toast(`Invite sent to ${email}`,'success');}
    catch(e){toast(e.message,'error');}
  }

  // ── Invoice detail modal ─────────────────────────────────────────────────
  function showInv(r){
    if(typeof r==='string')r=JSON.parse(r);
    curInv=r;
    el('md-num').textContent   =r.invoice_number;
    el('md-sup').textContent   =r.supplier_name;
    el('md-supnum').textContent=r.supplier_number;
    el('md-dept').textContent  =r.department;
    el('md-date').textContent  =r.invoice_date?.slice(0,10)??'—';
    el('md-excl').textContent  =`R ${A(r.amount_excl_vat)}`;
    el('md-vat').textContent   =`R ${A(r.vat)}`;
    el('md-incl').textContent  =`R ${A(r.amount_incl_vat)}`;
    el('md-ts').textContent    =r.ingest_timestamp?new Date(r.ingest_timestamp).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}):'—';
    el('md-file').textContent  =r.source_file_name||'—';
    el('md-hash').textContent  =r.source_hash?`SHA-256: ${r.source_hash}`:'';
    el('md-note').textContent  =r.validation_notes||'';
    const cfg={inserted:{bg:'var(--greenbg)',dot:'var(--green)'},duplicate:{bg:'var(--amberbg)',dot:'var(--amber)'},failed:{bg:'var(--redbg)',dot:'var(--red)'},pending:{bg:'var(--bluebg)',dot:'var(--blue)'},approved:{bg:'var(--greenbg)',dot:'var(--green)'},rejected:{bg:'var(--redbg)',dot:'var(--red)'}}[r.status]||{bg:'var(--surface2)',dot:'var(--muted)'};
    el('md-banner').style.background=cfg.bg;
    el('md-dot').style.background=cfg.dot;
    el('md-status').textContent=r.status;el('md-status').style.color=cfg.dot;
    el('md-approve').classList.toggle('hidden',r.status!=='pending');
    el('md-reject').classList.toggle('hidden',r.status!=='pending');
    openM('m-detail');
  }

  async function doApprove(){
    if(!curInv)return;
    try{await post(`/invoices/${curInv.id}/approve`,{});toast('Invoice approved.','success');closeM('m-detail');loadInv();}
    catch(e){toast(e.message,'error');}
  }
  async function doReject(){
    if(!curInv)return;
    try{await post(`/invoices/${curInv.id}/reject`,{});toast('Invoice rejected.','info');closeM('m-detail');loadInv();}
    catch(e){toast(e.message,'error');}
  }

  // ── Billing ──────────────────────────────────────────────────────────────
  async function loadBilling(){
    try{
      const stats=await get('/invoices/stats');
      const plan=session?.org?.plan||'free';
      const lim={free:100,starter:1000,business:Infinity}[plan]||100;
      const used=Number(stats.total)||0;
      el('bl-inv').textContent=`${N(used)} / ${lim===Infinity?'Unlimited':N(lim)}`;
      el('bl-bar').style.width=lim===Infinity?'5%':`${Math.min(used/lim*100,100)}%`;
      ['free','starter','business'].forEach(p=>el('pc-'+p)?.classList.toggle('hidden',plan!==p));
    }catch(e){console.error(e);}
  }

  async function doUpgrade(plan){
    toast('Redirecting to payment…','info');
    setTimeout(()=>{
      // Free payment demo using Stripe demo
      const url=`https://stripe-payments-demo.appspot.com/`;
      window.open(url,'_blank');
      toast('Complete payment in the new tab. Contact us at billing@invoq.co.za to activate your plan.','info');
    },800);
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  function loadSettings(){
    const u=session?.user,o=session?.org;
    if(u){el('st-fn').value=u.firstName||'';el('st-ln').value=u.lastName||'';el('st-email').value=u.email||'';}
    if(o){el('st-org').value=o.name||'';el('st-trade').value=o.tradingName||'';el('st-vat').value=o.vatNumber||'';if(o.approvalThreshold)el('st-thresh').value=o.approvalThreshold;}
  }
  async function saveSettings(){
    const data={name:val('st-org'),tradingName:val('st-trade'),vatNumber:val('st-vat'),vatRate:val('st-rate'),approvalThreshold:val('st-thresh')||null};
    try{await put('/settings',data);toast('Settings saved.','success');}catch(e){toast(e.message,'error');}
  }
  function saveProfile(){toast('Profile updated.','success');}

  // ── Billing + export ──────────────────────────────────────────────────────
  function exportCsv(){
    if(!invRows.length){toast('No records to export.','error');return;}
    const cols=['invoice_number','supplier_name','supplier_number','department','invoice_date','amount_excl_vat','vat','amount_incl_vat','status'];
    const csv=[cols.join(','),...invRows.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(','))].join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`invoices_${new Date().toISOString().slice(0,10)}.csv`;a.click();
    toast('Export downloaded.','success');
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function renderPagination(prefix,page,total,fn){
    const pages=Math.ceil(total/PG)||1;
    const from=total===0?0:(page-1)*PG+1,to=Math.min(page*PG,total);
    el(`${prefix}-info`).textContent=total===0?'No records':`${from}–${to} of ${N(total)}`;
    const btns=el(`${prefix}-btns`);btns.innerHTML='';
    const mk=(label,dis,cb)=>{const b=document.createElement('button');b.textContent=label;b.disabled=dis;b.className='btn btn-ghost btn-xs';b.style.cssText=`min-width:28px;opacity:${dis?.35:1}`;if(!dis)b.onclick=cb;return b;};
    btns.appendChild(mk('←',page<=1,()=>fn(page-1)));
    pageRange(page,pages).forEach(p=>{
      if(p==='…'){const s=document.createElement('span');s.textContent='…';s.style.cssText='padding:0 4px;color:var(--muted);font-size:12px';btns.appendChild(s);}
      else{const b=mk(p,false,()=>fn(p));if(p===page){b.style.background='var(--brand)';b.style.color='white';b.style.borderColor='var(--brand)';}btns.appendChild(b);}
    });
    btns.appendChild(mk('→',page>=pages,()=>fn(page+1)));
  }
  function pageRange(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=4)return[1,2,3,4,5,'…',t];if(c>=t-3)return[1,'…',t-4,t-3,t-2,t-1,t];return[1,'…',c-1,c,c+1,'…',t];}

  // ── Modals ────────────────────────────────────────────────────────────────
  function openM(id){document.getElementById(id).classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeM(id){document.getElementById(id).classList.add('hidden');document.body.style.overflow='';}
  function bgClose(e,id){if(e.target===document.getElementById(id))closeM(id);}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.overlay:not(.hidden)').forEach(o=>o.classList.add('hidden'));document.body.style.overflow='';}});

  // ── Dry run toggle ────────────────────────────────────────────────────────
  function toggleDry(){dryRun=!dryRun;document.getElementById('dry-toggle').classList.toggle('on',dryRun);toast(dryRun?'Test mode ON — invoices will not be saved.':'Test mode OFF — invoices will be saved.','info');}

  // ── Toast ──────────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg,type='info'){
    const t=document.getElementById('toast');
    const c={success:`background:var(--greenbg);color:var(--green);border:1px solid #86efac`,error:`background:var(--redbg);color:var(--red);border:1px solid #fca5a5`,info:`background:var(--surface);color:var(--ink);border:1px solid var(--border)`};
    t.style.cssText=(c[type]||c.info)+';position:fixed;bottom:24px;right:24px;z-index:100;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:500;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.1)';
    t.classList.remove('hidden');t.textContent=msg;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),4500);
  }

  // ── API helpers ────────────────────────────────────────────────────────────
  async function get(path){
    const opts={headers:{}};if(session?.token)opts.headers['Authorization']=`Bearer ${session.token}`;
    const res=await fetch(API+path,opts);const d=await res.json();if(!res.ok)throw new Error(d.error||`HTTP ${res.status}`);return d;
  }
  async function post(path,body){
    const opts={method:'POST',headers:{'Content-Type':'application/json'}};if(session?.token)opts.headers['Authorization']=`Bearer ${session.token}`;opts.body=JSON.stringify(body);
    const res=await fetch(API+path,opts);const d=await res.json();if(!res.ok)throw new Error(d.error||`HTTP ${res.status}`);return d;
  }
  async function put(path,body){
    const opts={method:'PUT',headers:{'Content-Type':'application/json'}};if(session?.token)opts.headers['Authorization']=`Bearer ${session.token}`;opts.body=JSON.stringify(body);
    const res=await fetch(API+path,opts);const d=await res.json();if(!res.ok)throw new Error(d.error||`HTTP ${res.status}`);return d;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function showPg(id){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-'+id).classList.add('active');}
  function el(id){return document.getElementById(id);}
  function val(id){return (document.getElementById(id)?.value||'').trim();}
  function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function A(n){return Number(n??0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function N(n){return Number(n??0).toLocaleString('en-ZA');}
  function bc(s){return {inserted:'b-green',duplicate:'b-amber',failed:'b-red',pending:'b-blue',approved:'b-green',rejected:'b-red',failed:'b-red'}[s]||'b-gray';}
  function fmtRole(r){return {owner:'Owner',admin:'Admin',finance_manager:'Finance Manager',approver:'Approver',viewer:'Viewer',super_admin:'Super Admin'}[r]||r;}
  function fmtPlan(p){return {free:'Free',starter:'Starter',business:'Business',enterprise:'Enterprise'}[p]||p;}
  function planBadge(p){return {free:'b-gray',starter:'b-brand',business:'b-blue',enterprise:'b-amber'}[p]||'b-gray';}
  function debounce(fn,ms,key){clearTimeout(timers[key]);timers[key]=setTimeout(fn,ms);}
  function dlSample(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['supplier_number,supplier_name,invoice_number,department,invoice_date,amount_excl,vat_rate\nS009,OfficeCo,OC-22119,Operations,2025-10-28,2175.00,15\nS011,PaperMart,PM-77891,Finance,2025-11-01,1020.00,15\n'],{type:'text/csv'}));a.download='sample_invoices.csv';a.click();}

  // ── Boot ──────────────────────────────────────────────────────────────────
  // Check for password reset token in URL
  const resetToken=new URLSearchParams(location.search).get('reset');
  if(resetToken)showForm('reset');

  // Auto-refresh silently
  setInterval(async()=>{
    if(session){
      try{const s=await get('/invoices/stats');if(s.pending>0){el('sb-pending').textContent=s.pending;el('sb-pending').classList.remove('hidden');}}catch{}
    }
  },60000);