console.log('ALLSET CRM BASIC EMERGENCY MODE');

var $ = function(id){ return document.getElementById(id); };

function openCrm(){
  var nameInput = $('nicknameInput');
  var roleInput = $('roleSelect');
  var name = nameInput && nameInput.value ? nameInput.value : 'Laith';
  var role = roleInput && roleInput.value ? roleInput.value : 'rep';
  try { localStorage.setItem('allset_rep_name', name); localStorage.setItem('allset_rep_role', role); } catch(e) {}
  if($('repName')) $('repName').textContent = name;
  if($('roleName')) $('roleName').textContent = role;
  if($('gate')) $('gate').style.display = 'none';
  if($('app')) $('app').classList.remove('app--locked');
  showPage('dashboard');
}

function showGate(){
  if($('gate')) $('gate').style.display = 'grid';
  if($('app')) $('app').classList.add('app--locked');
}

function showPage(page){
  var pages = document.querySelectorAll('.page');
  for(var i=0;i<pages.length;i++){ pages[i].classList.remove('active'); }
  var target = $('page-' + page);
  if(target) target.classList.add('active');
  var buttons = document.querySelectorAll('.navBtn');
  for(var j=0;j<buttons.length;j++){ buttons[j].classList.toggle('active', buttons[j].getAttribute('data-page') === page); }
  var nav = $('nav');
  if(nav) nav.classList.remove('open');
}

function smallToast(text){
  var t = $('toast');
  if(!t) return;
  t.textContent = text;
  t.classList.remove('hidden');
  setTimeout(function(){ t.classList.add('hidden'); }, 2000);
}

function emergencyNotice(){
  var ids = ['leadsTable','jobsTable','customersTable','teamTable','leaderboardTable','boardTable','paymentsTable','equipmentTable'];
  for(var i=0;i<ids.length;i++){
    var el = $(ids[i]);
    if(el && !el.innerHTML.trim()) el.innerHTML = '<div class="card">Emergency mode: page opens, full live features paused until app.js is restored.</div>';
  }
  if($('podium')) $('podium').innerHTML = '<div class="card">Emergency mode active.</div>';
  if($('goalGauge')) $('goalGauge').innerHTML = '<div class="card">Emergency mode active.</div>';
  if($('log')) $('log').innerHTML = '<div class="logItem">Emergency mode active. Interface is clickable.</div>';
  if($('onlineList')) $('onlineList').innerHTML = '<div class="listItem">Emergency mode</div>';
}

window.addEventListener('DOMContentLoaded', function(){
  var savedName = null;
  var savedRole = null;
  try { savedName = localStorage.getItem('allset_rep_name'); savedRole = localStorage.getItem('allset_rep_role'); } catch(e) {}
  if(savedName && $('nicknameInput')) $('nicknameInput').value = savedName;
  if(savedRole && $('roleSelect')) $('roleSelect').value = savedRole;
  if($('enterBtn')) $('enterBtn').addEventListener('click', openCrm);
  if($('nicknameInput')) $('nicknameInput').addEventListener('keydown', function(e){ if(e.key === 'Enter') openCrm(); });
  if($('changeNameBtn')) $('changeNameBtn').addEventListener('click', showGate);
  if($('mobileNavBtn')) $('mobileNavBtn').addEventListener('click', function(){ if($('nav')) $('nav').classList.toggle('open'); });
  var navButtons = document.querySelectorAll('.navBtn');
  for(var i=0;i<navButtons.length;i++){
    navButtons[i].addEventListener('click', function(){ showPage(this.getAttribute('data-page')); });
  }
  var allButtons = document.querySelectorAll('button');
  for(var j=0;j<allButtons.length;j++){
    if(!allButtons[j].onclick && !allButtons[j].classList.contains('navBtn') && allButtons[j].id !== 'enterBtn' && allButtons[j].id !== 'mobileNavBtn' && allButtons[j].id !== 'changeNameBtn'){
      allButtons[j].addEventListener('click', function(){ smallToast('Emergency mode: this feature is paused'); });
    }
  }
  emergencyNotice();
});
