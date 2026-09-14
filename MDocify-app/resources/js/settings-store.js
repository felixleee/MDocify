/* ===== 부팅 스플래시 + 창 상태 기억 (EXE 전용) =====
   단일 창 방식: 처음엔 작고 테두리 없는 스플래시 창(config)으로 떠서 스플래시 오버레이를 보여주고,
   준비되면(최소 BOOT_MIN 경과) 같은 창을 앱 크기 + 정상 테두리 + 최대화로 '변신'시킨 뒤 오버레이를 걷어낸다.
   프로세스가 하나라 멀티창 생명주기 레이스가 없다.
   포트가 고정(config port)이라 창 상태(mdocify_winstate)는 localStorage 에 저장/복원한다(파일 불필요).
   브라우저(NL_PORT 없음)에선 스플래시만 최소시간 후 제거. (원본: MDeautify settings-store.js) */
(function(){
  var BOOT_MIN=2000, t0=Date.now(), APP_W=1280, APP_H=840;
  var MINW=800, MINH=500;   /* 본 화면 최소 폭/높이(런타임 제약). config min 은 스플래시(330×450) 때문에 작게 둠 */
  var isExe=!(typeof window.NL_PORT==="undefined"||typeof window.Neutralino==="undefined");

  /* 스플래시가 테마 확정 전 라이트로 깜빡이지 않도록, 저장된 다크 모드를 즉시 적용 */
  try{if(localStorage.getItem("mdocify_ui_mode")==="dark")document.body.classList.add("dark");}catch(e){}

  function markBooted(){try{document.body.classList.add("booted");}catch(e){}}
  function reveal(){
    var wait=Math.max(0,BOOT_MIN-(Date.now()-t0));
    setTimeout(async function(){ if(isExe){await morphToApp();} markBooted(); }, wait);
  }

  /* 브라우저 모드: 스플래시만 최소시간 후 제거(창 제어 없음) */
  if(!isExe){reveal();return;}

  try{Neutralino.init();}catch(e){}   /* 멱등: app.js 에서도 호출됨 */

  /* 스플래시(작은 창) → 앱 창 변신. 창 크기·위치·최대화(그 모니터까지)를 mdocify_winstate 에 저장/복원.
     스플래시는 config center 로 주 모니터 중앙에 뜬다(멀티모니터 추종은 보류). */
  var WKEY="mdocify_winstate";
  function readWin(){try{return JSON.parse(localStorage.getItem(WKEY)||"null");}catch(e){return null;}}
  var morphed=false;
  async function morphToApp(){
    if(morphed)return;morphed=true;
    var st=readWin();
    try{await Neutralino.window.setBorderless(false);}catch(e){}   /* 정상 테두리(최소화/최대화/닫기) 복원 */
    if(st&&!st.max&&st.w>300&&st.h>200){                            /* 이전에 창모드로 줄였으면 그 크기·위치 복원 */
      try{await Neutralino.window.setSize({width:Math.max(st.w,MINW),height:Math.max(st.h,MINH),minWidth:MINW,minHeight:MINH});}catch(e){}
      try{
        if(typeof st.x==="number"&&typeof st.y==="number")await Neutralino.window.move(st.x,st.y);
        else await Neutralino.window.center();
      }catch(e){}
    }else{
      if(st&&st.max&&typeof st.mx==="number"&&typeof st.my==="number"){
        try{await Neutralino.window.move(st.mx,st.my);}catch(e){}   /* 이전에 최대화했던 그 모니터로 먼저 이동 */
      }
      try{await Neutralino.window.setSize({width:APP_W,height:APP_H,minWidth:MINW,minHeight:MINH});}catch(e){}  /* 최소 제약 */
      try{await Neutralino.window.maximize();}catch(e){}            /* 그 모니터에서 최대화(기본·이전 최대화) */
    }
    try{await Neutralino.window.focus();}catch(e){}
    startWinTracking();
  }

  /* 변신 후: 창 크기/위치/최대화 변화를 저장(디바운스). 스플래시(작은 창)는 저장 안 함(변신 후에만 추적). */
  var winTimer=null,tracking=false;
  async function saveWin(){
    try{
      var mx=false;try{mx=await Neutralino.window.isMaximized();}catch(e){}
      var s=null,p=null;
      try{s=await Neutralino.window.getSize();}catch(e){}
      try{p=await Neutralino.window.getPosition();}catch(e){}
      var o={max:!!mx};
      if(!mx){
        if(s){o.w=s.width;o.h=s.height;}
        if(p){o.x=p.x;o.y=p.y;}
      }else{
        var prev=readWin();if(prev){o.w=prev.w;o.h=prev.h;o.x=prev.x;o.y=prev.y;}   /* 최대화 해제 시 되돌릴 창모드 크기 보존 */
        if(p){o.mx=p.x;o.my=p.y;}                                                     /* 최대화된 창 위치 = 그 모니터 기준점 */
      }
      if(o.max||(o.w>300&&o.h>200))localStorage.setItem(WKEY,JSON.stringify(o));
    }catch(e){}
  }
  function scheduleWinSave(){clearTimeout(winTimer);winTimer=setTimeout(saveWin,400);}
  function startWinTracking(){
    if(tracking)return;tracking=true;
    try{window.addEventListener("resize",scheduleWinSave);}catch(e){}
    try{window.addEventListener("blur",saveWin);}catch(e){}
    setInterval(saveWin,4000);   /* 이동(move)은 웹뷰 이벤트가 없어 주기 저장으로 보완 */
  }

  /* 닫힐 때(X·Alt+F4) 창 상태를 마지막으로 저장하고 종료 (config exitProcessOnClose:false 라 직접 종료).
     이동은 실시간 이벤트가 없어 이 시점 저장으로 '옮기고 바로 닫기'까지 반영. 무엇이 막혀도 800ms 내 강제 종료. */
  try{
    Neutralino.events.on("windowClose",async function(){
      var killer=setTimeout(function(){try{Neutralino.app.exit();}catch(e){}},800);
      try{ if(morphed) await saveWin(); }catch(e){}   /* 변신 후에만 저장(스플래시 크기는 저장 안 함) */
      clearTimeout(killer);
      try{await Neutralino.app.exit();}catch(e){}
    });
  }catch(e){}

  reveal();
})();
