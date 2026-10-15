const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let token = localStorage.getItem("mzuni_token") || "";
let me = null, courses = [], materials = [], adminMaterials = [], rooms = [];
let authMode = "login", currentView = "overview", activeCourse = "";
let call = null;
const icons = ["◌","▣","✧","Aa"];
const toastTimer = { value: null };
function toast(message, error=false) {
  const el=$("#toast"); el.textContent=message; el.className="toast show"+(error?" error":"");
  clearTimeout(toastTimer.value); toastTimer.value=setTimeout(()=>el.className="toast",3500);
}
async function api(url, options={}) {
  const headers = {...(options.headers||{})};
  if (token) headers.Authorization = "Bearer "+token;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"]="application/json";
  const res = await fetch(url, {...options, headers});
  let data={}; try { data=await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function escapeHtml(v="") { return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function formatDate(d) { try{return new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short"}).format(new Date(d));}catch{return "";} }
function bytes(n=0) { return n<1024*1024?Math.round(n/1024)+" KB":(n/1024/1024).toFixed(1)+" MB"; }
function fileType(name="file") { return (name.split(".").pop()||"FILE").slice(0,4).toUpperCase(); }
function courseIcon(i) { return icons[i%icons.length]; }
function courseCards(target, clickable=true) {
  $(target).innerHTML=courses.map((c,i)=>`<button class="${target==="#libraryCourses"?"library-course":"course-card"} ${activeCourse===c?"selected":""}" data-course="${escapeHtml(c)}"><span class="course-symbol">${courseIcon(i)}</span><b>${escapeHtml(c)}</b><small>Course resources & revision</small></button>`).join("");
  $$(target+" [data-course]").forEach(b=>b.addEventListener("click",()=>{activeCourse=activeCourse===b.dataset.course?"":b.dataset.course; $("#courseFilter").value=activeCourse; courseCards("#libraryCourses"); renderMaterials(); showView("library");}));
}
function showAuth(mode="login") {
  authMode=mode; $("#authScreen").classList.remove("hidden"); $("#appScreen").classList.add("hidden");
  $("#loginTab").classList.toggle("active",mode==="login"); $("#registerTab").classList.toggle("active",mode==="register");
  $("#nameWrap").classList.toggle("hidden",mode!=="register");
  $("#authTitle").textContent=mode==="login"?"Welcome back":"Create your account";
  $("#authSubtitle").textContent=mode==="login"?"Sign in to continue learning with your classmates.":"Join your MZUNI Communication Studies learning community.";
  $("#authSubmit").innerHTML=(mode==="login"?"Sign in":"Create account")+" <span>→</span>";
  $("#password").autocomplete=mode==="login"?"current-password":"new-password";
}
function showApp() {
  $("#authScreen").classList.add("hidden"); $("#appScreen").classList.remove("hidden");
  $("#sideName").textContent=me.name; $("#sideRole").textContent=me.role==="admin"?"Administrator":"Student";
  $("#sideAvatar").textContent=me.name.charAt(0).toUpperCase(); $("#topAvatar").textContent=me.name.charAt(0).toUpperCase();
  $("#mobileGreeting").textContent="Hi, "+me.name.split(" ")[0];
  $("#welcomeTitle").textContent="Ready to make progress, "+me.name.split(" ")[0]+"?";
  $("#adminNav").classList.toggle("hidden",me.role!=="admin");
  showView("overview"); loadAll();
}
async function initialize() {
  try {
    const conf=await fetch("/api/config").then(r=>r.json()); courses=conf.courses;
    $("#uploadCourse").innerHTML=courses.map(c=>`<option>${escapeHtml(c)}</option>`).join("");
    $("#newRoomCourse").innerHTML=courses.map(c=>`<option>${escapeHtml(c)}</option>`).join("");
    $("#courseFilter").innerHTML='<option value="">All courses</option>'+courses.map(c=>`<option>${escapeHtml(c)}</option>`).join("");
    courseCards("#overviewCourses"); courseCards("#libraryCourses");
  } catch(e) { toast("Could not load app configuration.",true); }
  if(token) {
    try { me=(await api("/api/auth/me")).user; showApp(); }
    catch { token="";localStorage.removeItem("mzuni_token");showAuth(); }
  } else showAuth();
}
$("#loginTab").onclick=()=>showAuth("login");
$("#registerTab").onclick=()=>showAuth("register");
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const body={email:$("#email").value.trim(),password:$("#password").value};
  if(authMode==="register") body.name=$("#name").value.trim();
  const btn=$("#authSubmit");btn.disabled=true;btn.textContent="Please wait...";
  try {
    const result=await api("/api/auth/"+(authMode==="login"?"login":"register"),{method:"POST",body:JSON.stringify(body)});
    token=result.token;me=result.user;localStorage.setItem("mzuni_token",token);$("#authForm").reset();showApp();toast("Welcome to MZUNI Study Circle.");
  } catch(err){toast(err.message,true);}
  finally{btn.disabled=false;btn.innerHTML=(authMode==="login"?"Sign in":"Create account")+" <span>→</span>";}
});
$("#logoutBtn").onclick=()=>{leaveCall(false);token="";me=null;localStorage.removeItem("mzuni_token");showAuth();};
function showView(view) {
  currentView=view;
  $$(".view").forEach(v=>v.classList.toggle("hidden",v.id!=="view-"+view));
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("#pageCrumb").textContent=({overview:"Overview",rooms:"Study rooms",library:"Course library",admin:"Admin review"})[view]||"Overview";
  $("#sidebar")?.classList.remove("open");
  if(view==="rooms") loadRooms();
  if(view==="library") loadMaterials();
  if(view==="admin"&&me?.role==="admin") loadAdminMaterials();
}
$$("[data-view]").forEach(b=>b.addEventListener("click",()=>{showView(b.dataset.view);$("#sidebar")?.classList.remove("open");$(".sidebar").classList.remove("open");}));
$$("[data-go]").forEach(b=>b.addEventListener("click",()=>{showView(b.dataset.go);if(b.dataset.create==="true")$("#createModal").classList.remove("hidden");}));
$("#mobileMenu").onclick=()=>$(".sidebar").classList.toggle("open");
async function loadAll(){await Promise.allSettled([loadRooms(),loadMaterials()]);}
async function loadRooms() {
  try { rooms=await api("/api/rooms"); renderRooms(); $("#roomCount").textContent=rooms.length; }
  catch(e){ if(currentView==="rooms")toast(e.message,true); }
}
function renderRooms() {
  const q=($("#roomSearch")?.value||"").toLowerCase();
  const filtered=rooms.filter(r=>(r.title+" "+r.course+" "+r.hostName).toLowerCase().includes(q));
  $("#roomsList").innerHTML=filtered.map((r,i)=>`<article class="room-card"><div class="room-card-top"><div class="room-symbol">${courseIcon(i)}</div><span class="soft-pill">● Open</span></div><h3>${escapeHtml(r.title)}</h3><div class="room-course">${escapeHtml(r.course)}</div><div class="room-meta"><span>Hosted by ${escapeHtml(r.hostName)}</span><span>${r.memberCount||0}/4 joined</span></div><div class="room-meta"><span>Room code</span><span class="room-code">${escapeHtml(r.code)}</span></div><button class="btn primary" data-join-room="${escapeHtml(r.id)}" ${r.memberCount>=4?"disabled":""}>Join audio / video →</button></article>`).join("");
  $("#roomsEmpty").classList.toggle("hidden",filtered.length>0);
  $("#roomsList").classList.toggle("hidden",filtered.length===0);
  $$("[data-join-room]").forEach(b=>b.onclick=()=>joinRoom(b.dataset.joinRoom));
}
$("#roomSearch").addEventListener("input",renderRooms);
$("#openCreateRoom").onclick=$("#emptyCreate").onclick=()=>$("#createModal").classList.remove("hidden");
$$("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close).classList.add("hidden"));
$("#createRoomForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try { const room=await api("/api/rooms",{method:"POST",body:JSON.stringify({title:$("#newRoomTitle").value.trim(),course:$("#newRoomCourse").value})});$("#createModal").classList.add("hidden");$("#createRoomForm").reset();await loadRooms();showView("rooms");toast("Room created. Share code "+room.code+" with your group.");await joinRoom(room.id); }
  catch(err){toast(err.message,true);}
});
$("#joinRoomForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{const r=await api("/api/rooms/join",{method:"POST",body:JSON.stringify({code:$("#joinCode").value.trim()})});$("#joinCode").value="";await joinRoom(r.id);}
  catch(err){toast(err.message,true);}
});
async function loadMaterials() {
  try { materials=await api("/api/materials");renderMaterials(); }
  catch(e){if(currentView==="library")toast(e.message,true);}
}
function renderMaterials() {
  const q=($("#materialSearch")?.value||"").toLowerCase(), c=$("#courseFilter")?.value||"";
  const list=materials.filter(m=>(!c||m.course===c)&&(m.title+" "+m.description+" "+m.course+" "+m.originalName).toLowerCase().includes(q));
  $("#materialsList").innerHTML=list.map(m=>`<article class="material-row"><div class="file-icon">${escapeHtml(fileType(m.originalName))}</div><div class="material-info"><b>${escapeHtml(m.title)}</b><p>${escapeHtml(m.course)}${m.description?" · "+escapeHtml(m.description):""}</p><small>${escapeHtml(m.originalName)} · ${bytes(m.size)} · Added ${formatDate(m.createdAt)}</small></div><a class="btn dark" href="${escapeHtml(m.fileUrl||"/uploads/"+encodeURIComponent(m.fileName))}" target="_blank" rel="noopener">Open file ↗</a></article>`).join("");
  $("#materialsEmpty").classList.toggle("hidden",list.length>0);$("#materialsList").classList.toggle("hidden",list.length===0);
}
$("#materialSearch").addEventListener("input",renderMaterials);
$("#courseFilter").addEventListener("change",()=>{activeCourse=$("#courseFilter").value;courseCards("#libraryCourses");renderMaterials();});
async function loadAdminMaterials() {
  try {adminMaterials=await api("/api/admin/materials");renderAdminMaterials();}
  catch(e){toast(e.message,true);}
}
function renderAdminMaterials() {
  const pending=adminMaterials.filter(m=>m.status==="pending").length;$("#pendingBadge").textContent=pending+" pending";
  $("#adminMaterials").innerHTML=adminMaterials.length?adminMaterials.map(m=>`<article class="admin-material"><div class="admin-material-head"><div class="file-icon">${escapeHtml(fileType(m.originalName))}</div><div><b>${escapeHtml(m.title)}</b><small>${escapeHtml(m.course)} · ${escapeHtml(m.originalName)} · ${bytes(m.size)}</small></div><span class="status-pill ${m.status}">${escapeHtml(m.status)}</span></div>${m.description?`<p class="muted" style="font-size:10px;margin:0">${escapeHtml(m.description)}</p>`:""}<div class="admin-actions"><a class="btn small dark" href="${escapeHtml(m.fileUrl||"/uploads/"+encodeURIComponent(m.fileName))}" target="_blank" rel="noopener">Preview file ↗</a>${m.status!=="approved"?`<button class="btn small approve" data-review="${m.id}" data-status="approved">Approve</button>`:""}${m.status!=="rejected"?`<button class="btn small reject" data-review="${m.id}" data-status="rejected">Reject</button>`:""}<button class="btn small" data-delete="${m.id}" style="background:#f0f3f8;color:#53617a">Delete</button></div></article>`).join(""):'<div class="empty-state"><h3>Nothing to review</h3><p>Uploaded materials will appear here.</p></div>';
  $$("[data-review]").forEach(b=>b.onclick=async()=>{try{await api("/api/admin/materials/"+b.dataset.review,{method:"PATCH",body:JSON.stringify({status:b.dataset.status})});toast("Material "+b.dataset.status+".");await loadAdminMaterials();await loadMaterials();}catch(e){toast(e.message,true);}});
  $$("[data-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this material and its uploaded file?"))return;try{await api("/api/admin/materials/"+b.dataset.delete,{method:"DELETE"});toast("Material deleted.");await loadAdminMaterials();await loadMaterials();}catch(e){toast(e.message,true);}});
}
$("#uploadForm").addEventListener("submit",async e=>{
  e.preventDefault();const file=$("#materialFile").files[0];if(!file)return toast("Choose a file first.",true);
  const fd=new FormData();fd.append("title",$("#materialTitle").value.trim());fd.append("course",$("#uploadCourse").value);fd.append("description",$("#materialDescription").value.trim());fd.append("file",file);
  try{const result=await api("/api/admin/materials",{method:"POST",body:fd});toast(result.message);$("#uploadForm").reset();await loadAdminMaterials();}
  catch(err){toast(err.message,true);}
});

/* WebRTC: browser-to-browser media; server relays only signalling messages. */
async function joinRoom(roomId) {
  if(call) leaveCall(false);
  let room=rooms.find(r=>r.id===roomId);
  if(!room){await loadRooms();room=rooms.find(r=>r.id===roomId);}
  if(!room){try{room=await api("/api/rooms").then(list=>list.find(r=>r.id===roomId));}catch{}}
  if(!room)return toast("Room not found. Refresh the room list.",true);
  $("#callTitle").textContent=room.title;$("#callCode").textContent=room.code;$("#callSub").textContent="Connecting to room...";
  $("#callModal").classList.remove("hidden");$("#callStage").innerHTML="";
  call={roomId,room,ws:null,localStream:null,pcs:new Map(),remoteStreams:new Map(),muted:false,cameraOn:false,config:{iceServers:[{urls:"stun:stun.l.google.com:19302"}]}};
  try {
    const conf=await fetch("/api/config").then(r=>r.json());call.config={iceServers:conf.iceServers};
    // Ask for both media types; if camera is unavailable, fall back to microphone.
    try {call.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});call.cameraOn=true;}
    catch {try {call.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});call.cameraOn=false;}catch(e){throw new Error("Microphone access is needed to join. Check browser permissions and try again.");}}
    addVideoTile(me.id,me.name,call.localStream,true);
    $("#cameraToggle").classList.toggle("off",!call.cameraOn);$("#cameraToggle small").textContent=call.cameraOn?"Camera on":"Camera off";
    $("#micToggle").classList.remove("off");$("#micToggle small").textContent="Mute";
    const proto=location.protocol==="https:"?"wss:":"ws:";
    call.ws=new WebSocket(`${proto}//${location.host}/signal?token=${encodeURIComponent(token)}`);
    call.ws.onopen=()=>call.ws.send(JSON.stringify({type:"join",roomId}));
    call.ws.onmessage=async ev=>{let msg;try{msg=JSON.parse(ev.data);}catch{return;}await handleSignal(msg);};
    call.ws.onerror=()=>toast("Connection problem. Check your internet and try again.",true);
    call.ws.onclose=ev=>{if(call&&call.roomId===roomId&&ev.code===4401)toast("Your session expired. Sign in again.",true);};
    $("#callSub").textContent="Waiting for classmates · "+room.course;
  } catch(e) { toast(e.message||"Could not start the call.",true); leaveCall(false); }
}
function addVideoTile(id,name,stream,isSelf=false) {
  const stage=$("#callStage");const placeholder=stage.querySelector(".call-placeholder");if(placeholder)placeholder.remove();
  let tile=document.getElementById("tile-"+id);
  if(!tile){tile=document.createElement("div");tile.className="video-tile";tile.id="tile-"+id;stage.appendChild(tile);}
  tile.innerHTML=`<div class="tile-avatar">${escapeHtml((name||"S").charAt(0).toUpperCase())}</div><span class="tile-name">${escapeHtml(name)}${isSelf?" (you)":""}</span>`;
  if(stream){const video=document.createElement("video");video.autoplay=true;video.playsInline=true;video.muted=isSelf;video.srcObject=stream;tile.appendChild(video);video.play().catch(()=>{});}
}
async function handleSignal(msg) {
  if(!call)return;
  if(msg.type==="error"){toast(msg.message,true);return;}
  if(msg.type==="joined"){
    $("#callSub").textContent=`${msg.peers.length+1}/4 participants · ${call.room.course}`;
    for(const peer of msg.peers) await makeOffer(peer.id);
  } else if(msg.type==="peer-joined") {
    $("#callSub").textContent="Classmate joined · "+call.room.course;
  } else if(msg.type==="offer") {
    const pc=makePC(msg.from,msg.fromName);await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);sendSignal({type:"answer",to:msg.from,answer:pc.localDescription});
  } else if(msg.type==="answer") {
    const pc=call.pcs.get(msg.from);if(pc)await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
  } else if(msg.type==="ice-candidate") {
    const pc=call.pcs.get(msg.from);if(pc&&msg.candidate)try{await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));}catch(e){}
  } else if(msg.type==="peer-left") {
    call.pcs.get(msg.peerId)?.close();call.pcs.delete(msg.peerId);call.remoteStreams.delete(msg.peerId);document.getElementById("tile-"+msg.peerId)?.remove();updateCallCount();
  } else if(msg.type==="room-closed") {toast("The room host has closed this room.");leaveCall(false);}
}
function sendSignal(msg){if(call?.ws?.readyState===WebSocket.OPEN)call.ws.send(JSON.stringify(msg));}
function makePC(peerId,peerName="Classmate") {
  if(call.pcs.has(peerId))return call.pcs.get(peerId);
  const pc=new RTCPeerConnection(call.config);call.pcs.set(peerId,pc);
  call.localStream?.getTracks().forEach(track=>pc.addTrack(track,call.localStream));
  pc.onicecandidate=e=>{if(e.candidate)sendSignal({type:"ice-candidate",to:peerId,candidate:e.candidate});};
  pc.ontrack=e=>{const stream=e.streams[0];call.remoteStreams.set(peerId,stream);addVideoTile(peerId,peerName,stream);updateCallCount();};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==="failed")toast("Connection failed. A TURN relay may be needed on this network.",true);};
  return pc;
}
async function makeOffer(peerId) {
  try{const pc=makePC(peerId);const offer=await pc.createOffer();await pc.setLocalDescription(offer);sendSignal({type:"offer",to:peerId,offer:pc.localDescription});}
  catch(e){console.error(e);toast("Could not connect to a classmate.",true);}
}
function updateCallCount(){if(call)$("#callSub").textContent=`${call.pcs.size+1}/4 participants · ${call.room.course}`;}
function leaveCall(notify=true) {
  if(!call){$("#callModal").classList.add("hidden");return;}
  const old=call;call=null;
  try{old.ws?.close();}catch{}
  old.pcs.forEach(pc=>pc.close());old.localStream?.getTracks().forEach(t=>t.stop());
  $("#callModal").classList.add("hidden");
  if(notify)toast("You left the study room.");
  loadRooms();
}
$("#leaveCall").onclick=$("#leaveCallTop").onclick=()=>leaveCall(true);
$("#callModal").addEventListener("click",e=>{if(e.target.id==="callModal"){}});
$("#micToggle").onclick=()=>{
  if(!call?.localStream)return;
  const tracks=call.localStream.getAudioTracks();if(!tracks.length)return toast("No microphone track available.",true);
  call.muted=!call.muted;tracks.forEach(t=>t.enabled=!call.muted);
  $("#micToggle").classList.toggle("off",call.muted);$("#micToggle small").textContent=call.muted?"Unmute":"Mute";
};
$("#cameraToggle").onclick=async()=>{
  if(!call)return;
  try {
    if(call.localStream.getVideoTracks().length){call.cameraOn=!call.cameraOn;call.localStream.getVideoTracks().forEach(t=>t.enabled=call.cameraOn);}
    else {const stream=await navigator.mediaDevices.getUserMedia({video:true});const track=stream.getVideoTracks()[0];call.localStream.addTrack(track);call.cameraOn=true;for(const pc of call.pcs.values())pc.addTrack(track,call.localStream);const video=document.querySelector("#tile-"+me.id+" video");if(video){video.srcObject=call.localStream;video.play().catch(()=>{});}}
    $("#cameraToggle").classList.toggle("off",!call.cameraOn);$("#cameraToggle small").textContent=call.cameraOn?"Camera on":"Camera off";
  } catch(e){toast("Camera permission was not granted or no camera is available.",true);}
};
window.addEventListener("beforeunload",()=>{if(call){call.localStream?.getTracks().forEach(t=>t.stop());call.ws?.close();}});
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
initialize();
