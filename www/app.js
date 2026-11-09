/* RAHHAL live app. Public publishable key is intended for browser use; database RLS is the security boundary. */
const SUPABASE_URL = 'https://szoptadwcnxbujzbiynm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_clPkAlAvZDN2eq92UhzZaA_y9c0HCvy';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
let currentUser = null, staffProfile = null, lines = [], selectedDays = [];
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekdays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function msg(text, error=false){ const el=$('appMessage'); if(el){el.textContent=text;el.style.color=error?'#b42318':'#167344';} }
function cairoDate(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function setDateMin(){ $('tripDate').min = cairoDate(); }
function showStudent(){ $('adminView').classList.add('hidden'); $('studentView').classList.remove('hidden'); }
function showAdmin(){ $('studentView').classList.add('hidden'); $('adminView').classList.remove('hidden'); }
function renderStudentLineOptions(){
  const university=$('university').value;
  const current=$('line').value;
  const available=university?lines.filter(l=>l.university===university):[];
  $('line').innerHTML='<option value="">'+(university?(available.length?'اختار الخط':'لا توجد خطوط مفعّلة لهذه الجامعة'):'اختار الجامعة أولاً')+'</option>'+available.map(l=>`<option value="${l.id}">${safe(l.name)}</option>`).join('');
  if(current&&available.some(l=>l.id===current)) $('line').value=current;
  else $('line').value='';
}
async function loadPublicLines(){
  const {data,error}=await db.from('lines').select('id,name,university,supervisor_name,supervisor_phone').eq('active',true).order('created_at');
  if(error) throw error;
  lines=data||[];
  renderStudentLineOptions();
}
let selectedDaySchedules=[];
function updateReturnOptions(){
  const go=$('goTime').value;
  const matches=selectedDaySchedules.filter(item=>item.go_time===go&&item.return_time);
  const returns=[...new Set(matches.map(item=>item.return_time))];
  $('backTime').innerHTML='<option value="">'+(matches.length?'اختار ميعاد العودة':'لا توجد عودة محددة لهذا الموعد')+'</option>'+returns.map(t=>`<option value="${t}">${t.slice(0,5)}</option>`).join('');
}
async function updateTripOptions(){
  const lineId=$('line').value, date=$('tripDate').value;
  $('studentBusPhoto').classList.add('hidden');
  $('pickup').innerHTML='<option value="">اختار نقطة التجمع</option>';
  $('goTime').innerHTML='<option value="">اختار الميعاد</option>';
  $('backTime').innerHTML='<option value="">اختار ميعاد العودة</option>';
  selectedDaySchedules=[];
  if(!lineId) return;
  const [{data:points,error:pe},{data:schedules,error:se}]=await Promise.all([
    db.from('pickup_points').select('id,name,arrival_time,sort_order').eq('line_id',lineId).eq('visible_to_students',true).order('sort_order'),
    date ? db.from('line_days').select('id,weekday,go_time,return_time').eq('line_id',lineId).eq('weekday',new Date(date+'T12:00:00').getDay()).eq('active',true).order('go_time') : Promise.resolve({data:[],error:null})
  ]);
  if(pe||se){msg((pe||se).message,true);return;}
  selectedDaySchedules=schedules||[];
  $('pickup').innerHTML+='<option value="">'+(points?.length?'':'لا توجد نقاط تجمع مضافة')+'</option>'+ (points||[]).map(p=>`<option value="${p.id}">${safe(p.name)}${p.arrival_time?' — '+safe(p.arrival_time.slice(0,5)):''}</option>`).join('');
  $('goTime').innerHTML+='<option value="">'+(date?(schedules?.length?'اختار الميعاد':'لا يوجد موعد تشغيل في اليوم المختار'):'اختار تاريخ الرحلة أولاً')+'</option>'+(schedules||[]).map(item=>`<option value="${item.go_time}">${item.go_time.slice(0,5)}</option>`).join('');
  updateReturnOptions();
  const line=lines.find(l=>l.id===lineId);
  $('routePreview').textContent=`${line?.name||''} · ${date?weekdays[new Date(date+'T12:00:00').getDay()]: 'اختار تاريخ الرحلة'} · اختار نقطة التجمع والميعاد.`;
  await loadStudentBusPhoto(lineId,date);
}
async function book(){
  const name=$('studentName').value.trim(), phone=$('phone').value.trim(), university=$('university').value;
  const lineId=$('line').value, pointId=$('pickup').value, date=$('tripDate').value, go=$('goTime').value, back=$('backTime').value||null;
  if(!name||!phone||!university||!lineId||!pointId||!date||!go){alert('من فضلك أكمل بيانات الحجز.');return;}
  if(!/^01[0125][0-9]{8}$/.test(phone)){alert('اكتب رقم موبايل مصري صحيح مكوّن من 11 رقم.');return;}
  $('bookBtn').disabled=true; $('bookBtn').textContent='جاري تسجيل الحجز...'; msg('');
  try{
    const token=Array.from(crypto.getRandomValues(new Uint8Array(24))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const {data,error}=await db.rpc('create_booking',{p_student_name:name,p_student_phone:phone,p_university:university,p_line_id:lineId,p_pickup_point_id:pointId,p_trip_date:date,p_go_time:go,p_return_time:back,p_cancel_token:token});
    if(error) throw error;
    const result=typeof data==='string'?JSON.parse(data):data;
    localStorage.setItem('rahhal_cancel_'+result.booking_code,token);
    const line=lines.find(l=>l.id===lineId);
    $('confirmation').classList.remove('hidden');
    $('confirmation').innerHTML=`<h3>✓ تم تسجيل حجزك</h3><p><b>رقم الحجز:</b> ${safe(result.booking_code)}</p><p><b>الاسم:</b> ${safe(name)}</p><p><b>الخط:</b> ${safe(line?.name)} · <b>نقطة التجمع:</b> ${safe($('pickup').selectedOptions[0].textContent)}</p><p><b>التاريخ:</b> ${safe(date)} · <b>الذهاب:</b> ${safe(go.slice(0,5))} · <b>العودة:</b> ${safe(back?back.slice(0,5):'غير محدد')}</p><p><b>المشرف:</b> ${safe(line?.supervisor_name||'سيتم إعلانه')} ${line?.supervisor_phone?`· <a href="tel:${safe(line.supervisor_phone)}">${safe(line.supervisor_phone)}</a> · <a href="https://wa.me/2${safe(line.supervisor_phone.replace(/^0/,''))}" target="_blank">واتساب</a>`:''}</p><p class="muted">احتفظ برقم الحجز لإلغاء الحجز عند الحاجة.</p><div class="grid" style="margin-top:12px"><input id="cancelCode" value="${safe(result.booking_code)}" readonly><button class="ghost" id="cancelMyBooking">إلغاء حجزي</button></div>`;
    $('cancelMyBooking').onclick=()=>cancelOwn(result.booking_code,token);
    $('studentName').value='';$('phone').value='';
    msg('تم الحجز بنجاح.');
  }catch(e){msg(e.message||'تعذر تسجيل الحجز. تأكد من إعدادات قاعدة البيانات.',true);alert(e.message||'تعذر تسجيل الحجز.');}
  finally{$('bookBtn').disabled=false;$('bookBtn').innerHTML='تأكيد الحجز <span>←</span>';}
}
async function cancelOwn(code,token){
  if(!confirm('هل تريد إلغاء هذا الحجز؟'))return;
  const {data,error}=await db.rpc('cancel_booking',{p_booking_code:code,p_cancel_token:token});
  if(error){msg(error.message,true);return;}
  $('confirmation').innerHTML='<h3>تم إلغاء الحجز</h3><p>رقم الحجز: '+safe(code)+'</p>';
  localStorage.removeItem('rahhal_cancel_'+code);
}
function loginPanel(){
  $('adminAuth').innerHTML=`<section class="panel"><h2>دخول الإدارة</h2><p class="muted">الدخول للمديرين المعتمدين فقط.</p><label>البريد الإلكتروني<input id="adminEmail" type="email" autocomplete="username" placeholder="name@example.com"></label><label style="margin-top:12px">كلمة المرور<input id="adminPassword" type="password" autocomplete="current-password" placeholder="كلمة المرور"></label><button class="primary full" id="loginBtn">دخول لوحة الإدارة</button><p id="loginMessage" class="muted"></p></section>`;
  $('loginBtn').onclick=async()=>{ $('loginBtn').disabled=true; const {data,error}=await db.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value}); $('loginBtn').disabled=false; if(error){$('loginMessage').textContent='بيانات الدخول غير صحيحة أو الحساب غير مفعّل.';return;} await verifyStaff(data.user); };
}
async function verifyStaff(user){
  const {data,error}=await db.from('staff_profiles').select('user_id,full_name,role').eq('user_id',user.id).maybeSingle();
  if(error||!data){await db.auth.signOut();$('loginMessage')&&($('loginMessage').textContent='هذا الحساب غير مضاف كمدير في رحّال.');return;}
  currentUser=user;staffProfile=data;await renderDashboard();
}
async function renderDashboard(){
  $('adminAuth').classList.add('hidden');$('adminDashboard').classList.remove('hidden');
  $('adminWelcome').textContent=`أهلاً ${staffProfile.full_name} — ${staffProfile.role==='super_admin'?'مدير رئيسي':'مدير'}`;
  $('lineManagement').classList.remove('hidden');
  const [{data:bookings,error:be},{data:allLines,error:le}]=await Promise.all([
    db.from('bookings').select('id,booking_code,student_name,student_phone,university,trip_date,go_time,return_time,status,lines(name),pickup_points(name)').order('trip_date',{ascending:false}).order('created_at',{ascending:false}),
    db.from('lines').select('id,name,university,active').order('created_at')
  ]);
  if(be||le){msg((be||le).message,true);return;}
  const today=cairoDate(), active=(bookings||[]).filter(b=>b.status==='booked');
  $('bookingCount').textContent=active.length;$('todayCount').textContent=active.filter(b=>b.trip_date===today).length;$('lineCount').textContent=(allLines||[]).filter(l=>l.active).length;
  const grouped={}; active.forEach(b=>{const key=[b.trip_date,b.lines?.name||'خط غير معروف',(b.go_time||'').slice(0,5)].join('__');grouped[key]=(grouped[key]||0)+1;});
  const summaries=Object.entries(grouped).sort((a,b)=>a[0].localeCompare(b[0]));
  $('dailyLineSummary').innerHTML=summaries.length?summaries.map(([key,count])=>{const [date,lineName,goTime]=key.split('__');return `<div class="booking-item"><b>${safe(date)}</b> · ${safe(lineName)} · ذهاب ${safe(goTime)} <strong style="float:left;color:var(--blue)">${count} طالب</strong></div>`;}).join(''):'لا توجد حجوزات مؤكدة حتى الآن.';
  $('bookingList').innerHTML=bookings?.length?bookings.map(b=>`<article class="booking-item"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${safe(b.student_name)}</b><span class="muted">${safe(b.booking_code)} · ${b.status==='booked'?'حجز مؤكد':'ملغي'}</span></div><p>${safe(b.student_phone)} · <a href="tel:${safe(b.student_phone)}">اتصال</a> · <a target="_blank" href="https://wa.me/2${safe(b.student_phone.replace(/^0/,''))}">واتساب</a></p><p>${safe(b.university)} · ${safe(b.lines?.name)} · ${safe(b.pickup_points?.name)}</p><p>${safe(b.trip_date)} · ذهاب ${safe((b.go_time||'').slice(0,5))} · عودة ${safe((b.return_time||'').slice(0,5))}</p></article>`).join(''):'لا توجد حجوزات حتى الآن.';
  $('adminLines').innerHTML=(allLines||[]).map(l=>`<div class="line-card"><b>${safe(l.name)}</b> · ${safe(l.university)} <span class="muted">${l.active?'مفعّل':'متوقف'}</span></div>`).join('')||'لم تتم إضافة خطوط بعد.';
  const selectedPhotoLine=$('busPhotoLine').value;
  $('busPhotoLine').innerHTML='<option value="">اختار الخط</option>'+(allLines||[]).map(l=>`<option value="${l.id}">${safe(l.name)} — ${safe(l.university)}</option>`).join('');
  if(selectedPhotoLine&&allLines.some(l=>l.id===selectedPhotoLine)) $('busPhotoLine').value=selectedPhotoLine;
  if(!$('busPhotoDate').value) $('busPhotoDate').value=today;
  await loadAdminBusPhotoPreview();
}

async function loadStudentBusPhoto(lineId,date){
  const wrap=$('studentBusPhoto');
  wrap.classList.add('hidden');
  if(!lineId||!date) return;
  const {data,error}=await db.from('daily_bus_photos').select('image_url').eq('line_id',lineId).eq('trip_date',date).maybeSingle();
  if(error){console.warn('Daily bus photo unavailable:',error.message);return;}
  if(data?.image_url){$('studentBusImage').src=data.image_url;$('studentBusPhoto').classList.remove('hidden');}
}
async function loadAdminBusPhotoPreview(){
  const lineId=$('busPhotoLine')?.value, date=$('busPhotoDate')?.value;
  const preview=$('adminBusImage'), wrap=$('adminBusPreview');
  if(!lineId||!date){wrap.classList.add('hidden');return;}
  const {data,error}=await db.from('daily_bus_photos').select('image_url').eq('line_id',lineId).eq('trip_date',date).maybeSingle();
  if(error){msg('تعذر تحميل صورة الباص: '+error.message,true);wrap.classList.add('hidden');return;}
  if(data?.image_url){preview.src=data.image_url;wrap.classList.remove('hidden');}
  else wrap.classList.add('hidden');
}
async function saveDailyBusPhoto(){
  const lineId=$('busPhotoLine').value, date=$('busPhotoDate').value, file=$('busPhotoFile').files[0];
  if(!lineId||!date||!file){msg('اختار الخط والتاريخ وصورة الباص أولاً.',true);return;}
  if(!file.type.startsWith('image/')){msg('الملف المختار لازم يكون صورة.',true);return;}
  if(file.size>5*1024*1024){msg('حجم الصورة لازم يكون 5 ميجابايت أو أقل.',true);return;}
  const button=$('saveBusPhotoBtn');button.disabled=true;button.textContent='جاري رفع الصورة...';
  try{
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const storagePath=`${lineId}/${date}/${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await db.storage.from('bus-photos').upload(storagePath,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
    if(uploadError) throw uploadError;
    const {data:publicData}=db.storage.from('bus-photos').getPublicUrl(storagePath);
    const {error:saveError}=await db.from('daily_bus_photos').upsert({
      line_id:lineId,trip_date:date,image_url:publicData.publicUrl,storage_path:storagePath,updated_by:currentUser.id,updated_at:new Date().toISOString()
    },{onConflict:'line_id,trip_date'});
    if(saveError) throw saveError;
    $('adminBusImage').src=publicData.publicUrl;$('adminBusPreview').classList.remove('hidden');$('busPhotoFile').value='';
    msg('تم تحديث صورة الباص لهذا الخط في التاريخ المحدد.'); 
  }catch(e){msg('تعذر حفظ الصورة: '+(e.message||'تأكد من تنفيذ إعدادات قاعدة البيانات والتخزين.'),true);}
  finally{button.disabled=false;button.textContent='حفظ صورة الباص لهذا اليوم';}
}

async function createLine(){
  const name=$('newLineName').value.trim(), university=$('newLineUniversity').value, supName=$('newSupervisorName').value.trim(), supPhone=$('newSupervisorPhone').value.trim();
  const dayMap={'الأحد':0,'الاحد':0,'الاثنين':1,'الثلاثاء':2,'الأربعاء':3,'الاربعاء':3,'الخميس':4,'الجمعة':5,'السبت':6};
  const daysText=$('newSchedules').value.split('\\n').map(x=>x.trim()).filter(Boolean);
  const days=daysText.map(row=>{const [day,go,back='']=row.split('|').map(x=>x.trim());return {weekday:dayMap[day],go_time:go,return_time:back||null,day};});
  const stops=$('newStops').value.split('\\n').map(x=>x.trim()).filter(Boolean).map((row,i)=>{const [stop,arrival='']=row.split('|').map(x=>x.trim());return {name:stop,arrival_time:arrival||null,sort_order:i};});
  if(!name||!university||!days.length||!stops.length){msg('اكتب اسم الخط والجامعة، ومواعيد يوم واحد على الأقل، ونقاط التجمع.',true);return;}
  if(days.some(d=>d.weekday===undefined||!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(d.go_time)|| (d.return_time&&!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(d.return_time)))){msg('راجع المواعيد: اكتب كل يوم بالشكل: الاثنين|07:00|15:00',true);return;}
  if(stops.some(p=>!p.name|| (p.arrival_time&&!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(p.arrival_time)))){msg('راجع نقاط التجمع. اكتب النقطة ثم | ثم ميعاد المرور مثل: ميدان المحطة|06:30',true);return;}
  const button=$('createLineBtn');button.disabled=true;button.textContent='جاري حفظ الخط...';
  try{
    const {data,error}=await db.rpc('create_line_setup',{p_name:name,p_university:university,p_supervisor_name:supName,p_supervisor_phone:supPhone,p_days:days.map(({weekday,go_time,return_time})=>({weekday,go_time,return_time})),p_stops:stops});
    if(error) throw error;
    $('newLineName').value='';$('newSupervisorName').value='';$('newSupervisorPhone').value='';$('newSchedules').value='';$('newStops').value='';
    msg('تمت إضافة الخط وكل مواعيده ونقاط التجمع بنجاح.');await loadPublicLines();await renderDashboard();
  }catch(e){msg('تعذر حفظ الخط: '+(e.message||'تحقق من تنفيذ ملف إعداد الإدارة في Supabase.'),true);}
  finally{button.disabled=false;button.textContent='حفظ الخط والمواعيد ونقاط التجمع';}
}
async function init(){
  setDateMin();
  $('adminToggle').onclick=async()=>{showAdmin();if(currentUser){await renderDashboard();}else{loginPanel();$('adminAuth').classList.remove('hidden');$('adminDashboard').classList.add('hidden');}};
  $('studentToggle').onclick=showStudent;
  $('university').addEventListener('change',()=>{renderStudentLineOptions();updateTripOptions();});
  $('line').addEventListener('change',updateTripOptions);$('tripDate').addEventListener('change',updateTripOptions);$('goTime').addEventListener('change',updateReturnOptions);
  $('bookBtn').onclick=book;
  $('logoutBtn').onclick=async()=>{await db.auth.signOut();currentUser=null;staffProfile=null;loginPanel();$('adminAuth').classList.remove('hidden');$('adminDashboard').classList.add('hidden');};
  $('createLineBtn').onclick=createLine;
  $('busPhotoLine').addEventListener('change',loadAdminBusPhotoPreview);
  $('busPhotoDate').addEventListener('change',loadAdminBusPhotoPreview);
  $('saveBusPhotoBtn').onclick=saveDailyBusPhoto;
  await loadPublicLines();
  const {data:{session}}=await db.auth.getSession(); if(session?.user){await verifyStaff(session.user);}
  db.auth.onAuthStateChange(async(_event,session)=>{if(!session){currentUser=null;staffProfile=null;}});
}
$('appMessage').textContent='';
init().catch(e=>{msg('تعذر الاتصال بقاعدة البيانات: '+e.message,true);console.error(e);});
