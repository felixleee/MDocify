/* ===== 폴더 탐색기(왼쪽 접이식 패널) — EXE 전용. MDeautify 이식(D) =====
   등록한 작업 폴더를 트리로 보여주고, .md 클릭=문서 열기(app.js __openMdPath),
   이미지 클릭=현재 커서에 ![](경로) 삽입(app.js __insertImageFromPath).
   - 폴더 목록 localStorage mdocify_folders(JSON), 접힘 상태 mdocify_explorer_open, 너비 mdocify_explorer_w.
   - 트리 지연 로딩(펼칠 때만 readDirectory). 새로고침=창 포커스 시 자동 + 헤더 버튼 수동.
   - 실시간 감시(filesystem.createWatcher): 디바운스 300ms·펼친 폴더만·무거운 디렉터리 무시.
   - 브라우저(NL_PORT 없음)에선 filesystem 차단이라 전체 비활성(패널 숨김 유지). */
(function(){
  var isExe=(typeof window.NL_PORT!=="undefined"&&typeof window.Neutralino!=="undefined");
  var explorer=document.getElementById("explorer");
  var btn=document.getElementById("btnExplorer");
  var treeEl=document.getElementById("exTree");
  var emptyEl=document.getElementById("exEmpty");
  var listEl=document.getElementById("stFolderList");
  var tmFolders=document.getElementById("tmFolders");
  if(!explorer||!treeEl)return;
  if(!isExe)return;   /* 브라우저 모드: 탐색기 비활성 */

  var SEP=(window.NL_OS==="Windows")?"\\":"/";
  var FKEY="mdocify_folders";        /* JSON: 루트 경로 배열 */
  var OKEY="mdocify_explorer_open";  /* "1"/"0" */
  var WKEY="mdocify_explorer_w";     /* 패널 너비(px) */

  var folders=[];
  var expanded={};
  var cache={};
  var selPath=null;
  var loading={};
  var lastW=214;
  var watchers={};
  var wTmr=null;
  var IGNORE_RE=/(^|[\\/])(\.git|node_modules|\.hg|\.svn|\.cache|__pycache__|dist|\.next|\.turbo)([\\/]|$)/i;

  var CHEV="<svg viewBox='0 0 24 24' width='10' height='10' fill='none' stroke='currentColor' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'><path d='M9 6l6 6-6 6'/></svg>";
  var IC={
    folder:"<span class='ex-svg folder'><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/></svg></span>",
    folderOpen:"<span class='ex-svg folder'><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M5 19l2.76-7.35a1 1 0 0 1 .94-.65h12.31a1 1 0 0 1 .98 1.16l-1 5.21a2 2 0 0 1-1.96 1.63H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v2'/></svg></span>",
    md:"<span class='ex-svg md'><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'/><path d='M14 3v5h5'/></svg></span>",
    img:"<span class='ex-svg img'><svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='4' width='18' height='16' rx='2'/><circle cx='8.5' cy='9.5' r='1.5'/><path d='M21 15l-5-5L5 20'/></svg></span>"
  };

  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
  function readJson(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch(e){return null;}}
  function loadFolders(){var a=readJson(FKEY);folders=(a&&a.length)?a.slice():[];if(dedupeFolders())saveFolders();}
  function saveFolders(){try{localStorage.setItem(FKEY,JSON.stringify(folders));}catch(e){}}
  function isUnder(child,parent){var c=norm(child),pa=norm(parent);return c===pa||c.indexOf(pa+"\\")===0;}
  function dedupeFolders(){
    var out=[],changed=false;
    for(var i=0;i<folders.length;i++){var p=folders[i],drop=false;
      for(var j=0;j<folders.length;j++){if(i===j)continue;
        if(isUnder(p,folders[j])&&(norm(p)!==norm(folders[j])||j<i)){drop=true;break;}}
      if(drop)changed=true;else out.push(p);
    }
    if(changed)folders=out;return changed;
  }
  function baseName(p){var q=String(p).replace(/[\\\/]+$/,"");var i=Math.max(q.lastIndexOf("\\"),q.lastIndexOf("/"));return i<0?q:q.slice(i+1);}
  function isMd(n){return /\.(md|markdown|txt)$/i.test(n);}
  function isImg(n){return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n);}
  function under(k,p){return k===p||k.indexOf(p+SEP)===0;}
  function norm(p){return String(p||"").replace(/[\\/]+/g,"\\").replace(/\\+$/,"");}

  function flash(msg){
    if(window.__toast){window.__toast(msg);return;}
    var t=document.getElementById("fbToast");
    if(!t){t=document.createElement("div");t.id="fbToast";document.body.appendChild(t);}
    t.textContent=msg;t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
    clearTimeout(t.__tmr);t.__tmr=setTimeout(function(){t.classList.remove("show");},1600);
  }

  /* ===== 이미지 미리보기 팝오버 ===== */
  var imgPop=null,imgPopReq=0;
  function positionPop(pop,x,y){
    var pw=pop.offsetWidth||280,ph=pop.offsetHeight||220,vw=window.innerWidth,vh=window.innerHeight,m=8;
    var left=x+12;if(left+pw>vw-m)left=Math.max(m,x-pw-12);
    var top=y+12;if(top+ph>vh-m)top=Math.max(m,vh-ph-m);
    pop.style.left=left+"px";pop.style.top=top+"px";
  }
  function hideImgPop(){if(imgPop){imgPop.hidden=true;imgPopReq++;}}
  function buildImgPop(){
    if(imgPop)return imgPop;
    imgPop=document.createElement("div");imgPop.id="imgPop";imgPop.hidden=true;
    imgPop.innerHTML="<div class='ip-thumb'><img alt=''></div><div class='ip-name'></div><div class='ip-btns'><button type='button' class='ip-cancel'>취소</button><button type='button' class='ip-insert'>삽입</button></div>";
    document.body.appendChild(imgPop);
    return imgPop;
  }
  async function showImgPopover(node,ev){
    var pop=buildImgPop();
    var req=++imgPopReq;
    var img=pop.querySelector(".ip-thumb img"),nameEl=pop.querySelector(".ip-name");
    var insBtn=pop.querySelector(".ip-insert"),cancelBtn=pop.querySelector(".ip-cancel");
    nameEl.textContent=node.name;
    try{img.removeAttribute("src");}catch(e){}
    pop.classList.remove("err");pop.classList.add("loading");
    pop.hidden=false;
    positionPop(pop,ev.clientX,ev.clientY);
    insBtn.onclick=function(){
      if(!document.body.classList.contains("loaded")){
        hideImgPop();
        if(window.__appAlert)window.__appAlert("이미지를 삽입하려면 먼저 문서를 열어주세요.","열린 문서가 없어요");
        else flash("먼저 문서를 열어주세요");
        return;
      }
      if(window.__insertImageFromPath)window.__insertImageFromPath(node.path);
      hideImgPop();flash("이미지를 삽입했어요");
    };
    cancelBtn.onclick=hideImgPop;
    img.onload=function(){if(req===imgPopReq)positionPop(pop,ev.clientX,ev.clientY);};
    try{
      var du=window.__imgDataUrl?await window.__imgDataUrl(node.path):null;
      if(req!==imgPopReq)return;
      pop.classList.remove("loading");
      if(du){img.src=du;}else{pop.classList.add("err");}
    }catch(e){if(req===imgPopReq){pop.classList.remove("loading");pop.classList.add("err");}}
  }
  document.addEventListener("mousedown",function(e){if(imgPop&&!imgPop.hidden&&!imgPop.contains(e.target))hideImgPop();});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&imgPop&&!imgPop.hidden){e.preventDefault();hideImgPop();}});
  window.addEventListener("resize",function(){if(imgPop&&!imgPop.hidden)hideImgPop();});

  async function loadDir(path){
    if(loading[path])return;
    loading[path]=true;
    try{
      var es=await Neutralino.filesystem.readDirectory(path);
      var arr=[];
      (es||[]).forEach(function(e){
        var nm=e.entry;if(!nm||nm==="."||nm==="..")return;
        var full=e.path||(String(path).replace(/[\\\/]+$/,"")+SEP+nm);
        if(e.type==="DIRECTORY")arr.push({name:nm,path:full,dir:true});
        else if(isMd(nm))arr.push({name:nm,path:full,md:true});
        else if(isImg(nm))arr.push({name:nm,path:full,img:true});
      });
      arr.sort(function(a,b){if(!!a.dir!==!!b.dir)return a.dir?-1:1;return a.name.localeCompare(b.name,"ko");});
      cache[path]=arr;
    }catch(e){
      cache[path]=[{err:true,name:"폴더를 열 수 없어요"}];
    }
    loading[path]=false;
  }

  function rowEl(node,depth,isRoot){
    var d=document.createElement("div");
    d.className="ex-row"+(isRoot?" root":"")+(node.img?" img":"")+(node.err?" err":"");
    d.style.paddingLeft=(8+depth*13)+"px";
    if(node.err){d.innerHTML="<span class='ex-tw'></span><span class='ex-nm'>"+esc(node.name)+"</span>";return d;}
    var isDir=node.dir,open=isDir&&expanded[node.path];
    var tw=isDir?("<span class='ex-tw"+(open?" open":"")+"'>"+CHEV+"</span>"):"<span class='ex-tw'></span>";
    var ic=isDir?(open?IC.folderOpen:IC.folder):(node.md?IC.md:IC.img);
    d.innerHTML=tw+ic+"<span class='ex-nm' title='"+esc(node.name)+"'>"+esc(node.name)+"</span>";
    if(node.path===selPath)d.classList.add("sel");
    d.addEventListener("click",function(ev){
      ev.stopPropagation();
      if(isDir){toggleDir(node);}
      else if(node.md){
        if(window.__mdPath&&norm(window.__mdPath)===norm(node.path))return;   /* 이미 열려있는 파일 → 무시 */
        if(!window.__openMdPath)return;
        Promise.resolve(window.__openMdPath(node.path)).then(function(ok){
          if(ok){selPath=node.path;renderTree();}
        });
      }
      else if(node.img){showImgPopover(node,ev);}
    });
    return d;
  }

  function walk(node,depth,isRoot){
    treeEl.appendChild(rowEl(node,depth,isRoot));
    if(node.dir&&expanded[node.path]){
      var kids=cache[node.path];
      if(kids)kids.forEach(function(k){walk(k,depth+1,false);});
    }
  }

  function renderTree(){
    treeEl.innerHTML="";
    if(!folders.length){if(emptyEl)emptyEl.hidden=false;treeEl.hidden=true;return;}
    if(emptyEl)emptyEl.hidden=true;treeEl.hidden=false;
    folders.forEach(function(p){walk({name:baseName(p)||p,path:p,dir:true},0,true);});
  }

  function renderList(){
    if(!listEl)return;
    listEl.innerHTML="";
    if(!folders.length){listEl.innerHTML="<div class='st-folder-empty'>추가된 폴더가 없습니다.</div>";return;}
    folders.forEach(function(p){
      var row=document.createElement("div");row.className="st-folder";
      row.innerHTML="<span class='st-folder-ic'>"+IC.folder+"</span><span class='st-folder-nm' title='"+esc(p)+"'>"+esc(p)+"</span><button class='st-folder-x' type='button' title='제거' aria-label='제거'>&times;</button>";
      row.querySelector(".st-folder-x").addEventListener("click",function(){removeFolder(p);});
      listEl.appendChild(row);
    });
  }

  async function toggleDir(node){
    if(expanded[node.path]){delete expanded[node.path];renderTree();return;}
    if(!cache[node.path])await loadDir(node.path);
    expanded[node.path]=true;renderTree();
  }

  var picking=false;
  async function addFolder(){
    if(picking)return;picking=true;
    try{
      var p=await Neutralino.os.showFolderDialog("작업 폴더 선택");
      if(p&&typeof p==="string"){
        p=p.replace(/[\\\/]+$/,"");
        var dupe=false,covered=null;
        for(var fi=0;fi<folders.length;fi++){
          if(norm(folders[fi])===norm(p)){dupe=true;break;}
          if(isUnder(p,folders[fi])){covered=folders[fi];break;}
        }
        if(dupe){
          if(window.__appAlert)window.__appAlert("이미 추가된 폴더예요.","폴더 추가");else flash("이미 추가된 폴더예요");
        }
        else if(covered){
          var msg="상위 폴더 '"+baseName(covered)+"' 가 이미 등록돼 있어요.\n이 폴더는 그 안에서 펼쳐 볼 수 있어요.";
          if(window.__appAlert)window.__appAlert(msg,"이미 포함된 폴더");else flash("상위 폴더가 이미 등록돼 있어요");
        }
        else{
          folders.push(p);dedupeFolders();
          saveFolders();
          if(document.body.classList.contains("explorer-collapsed"))setOpen(true);
          await loadDir(p);expanded[p]=true;
          renderTree();renderList();syncWatchers();
        }
      }
    }catch(e){}
    picking=false;
  }

  function removeFolder(p){
    var i=folders.indexOf(p);if(i<0)return;
    folders.splice(i,1);saveFolders();
    Object.keys(expanded).forEach(function(k){if(under(k,p))delete expanded[k];});
    Object.keys(cache).forEach(function(k){if(under(k,p))delete cache[k];});
    if(selPath&&under(selPath,p))selPath=null;
    renderTree();renderList();syncWatchers();
  }

  var refreshing=false;
  async function refresh(){
    if(refreshing||!folders.length)return;refreshing=true;
    var ri=document.getElementById("exRefresh");if(ri)ri.classList.add("spin");
    try{
      cache={};
      var paths=Object.keys(expanded);
      for(var i=0;i<paths.length;i++)await loadDir(paths[i]);
      renderTree();
    }catch(e){}
    if(ri)ri.classList.remove("spin");
    refreshing=false;
  }

  /* ===== 실시간 감시(파일시스템 워처) ===== */
  async function syncWatchers(){
    var existing=[];
    try{existing=await Neutralino.filesystem.getWatchers();}catch(e){existing=[];}
    var byPath={};existing.forEach(function(w){byPath[norm(w.path)]=w.id;});
    var wanted={};folders.forEach(function(p){wanted[norm(p)]=1;});
    for(var i=0;i<existing.length;i++){var w=existing[i];if(!wanted[norm(w.path)]){try{await Neutralino.filesystem.removeWatcher(w.id);}catch(e){}}}
    watchers={};
    for(var j=0;j<folders.length;j++){var p=folders[j],np=norm(p);
      if(byPath[np]!=null){watchers[p]=byPath[np];}
      else{try{watchers[p]=await Neutralino.filesystem.createWatcher(p);}catch(e){}}
    }
  }
  function scheduleWatchRefresh(){clearTimeout(wTmr);wTmr=setTimeout(function(){refresh();},300);}
  function onWatch(evt){
    var d=(evt&&evt.detail)?evt.detail:evt;if(!d)return;
    var dir=norm(d.dir),fn=String(d.filename||"");
    if(IGNORE_RE.test(dir)||IGNORE_RE.test(fn))return;
    if(!expanded[dir])return;
    scheduleWatchRefresh();
  }

  function setOpen(open){
    document.body.classList.toggle("explorer-collapsed",!open);
    if(btn)btn.classList.toggle("on",open);
    try{localStorage.setItem(OKEY,open?"1":"0");}catch(e){}
    if(window.__relayoutPanes)window.__relayoutPanes();
  }
  function toggleOpen(){setOpen(document.body.classList.contains("explorer-collapsed"));}
  function applyWidth(){
    var w=null;try{w=parseInt(localStorage.getItem(WKEY),10);}catch(e){}
    if(w&&w>=120&&w<=560){lastW=w;explorer.style.flex="0 0 "+w+"px";}
  }
  function applyOpenDefault(){
    var saved=null;try{saved=localStorage.getItem(OKEY);}catch(e){}
    var open=(saved===null)?(folders.length>0):(saved==="1");
    document.body.classList.toggle("explorer-collapsed",!open);
    if(btn)btn.classList.toggle("on",open);
  }

  async function expandRoots(){
    for(var i=0;i<folders.length;i++){if(!cache[folders[i]]){await loadDir(folders[i]);}expanded[folders[i]]=true;}
    renderTree();
  }

  /* --- 이벤트 --- */
  if(btn)btn.addEventListener("click",function(e){e.stopPropagation();toggleOpen();});
  var exAdd=document.getElementById("exAdd");if(exAdd)exAdd.addEventListener("click",function(e){e.stopPropagation();addFolder();});
  var exAddEmpty=document.getElementById("exAddEmpty");if(exAddEmpty)exAddEmpty.addEventListener("click",addFolder);
  var stAdd=document.getElementById("stAddFolder");if(stAdd)stAdd.addEventListener("click",addFolder);
  var exRef=document.getElementById("exRefresh");if(exRef)exRef.addEventListener("click",function(e){e.stopPropagation();refresh();});
  document.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&(e.key==="b"||e.key==="B")){e.preventDefault();toggleOpen();}
  });
  /* 너비 조절: 오른쪽 리사이저 드래그 */
  (function(){
    var rez=document.getElementById("exResizer"),main=document.getElementById("main");
    if(!rez||!main)return;
    var dragging=false;
    rez.addEventListener("mousedown",function(e){dragging=true;rez.classList.add("drag");document.body.style.userSelect="none";document.body.style.cursor="col-resize";e.preventDefault();});
    window.addEventListener("mousemove",function(e){
      if(!dragging)return;
      var r=main.getBoundingClientRect(),w=e.clientX-r.left;
      w=Math.max(120,Math.min(560,w));
      if(w>r.width-260)w=Math.max(120,r.width-260);
      explorer.style.flex="0 0 "+w+"px";lastW=w;if(window.__relayoutPanes)window.__relayoutPanes();
    });
    window.addEventListener("mouseup",function(){
      if(!dragging)return;dragging=false;rez.classList.remove("drag");
      document.body.style.userSelect="";document.body.style.cursor="";
      try{localStorage.setItem(WKEY,String(Math.round(lastW)));}catch(e){}
    });
    rez.addEventListener("dblclick",function(){lastW=214;explorer.style.flex="0 0 214px";if(window.__relayoutPanes)window.__relayoutPanes();try{localStorage.removeItem(WKEY);}catch(e){}});
  })();
  var fTmr=null;
  window.addEventListener("focus",function(){
    if(document.body.classList.contains("explorer-collapsed")||!folders.length)return;
    clearTimeout(fTmr);fTmr=setTimeout(refresh,400);
  });
  document.addEventListener("mdocify:settings-hydrated",function(){
    loadFolders();applyOpenDefault();renderList();expandRoots();syncWatchers();
  });
  try{Neutralino.events.on("watchFile",onWatch);}catch(e){}

  /* --- 부팅 --- */
  explorer.hidden=false;
  if(btn)btn.hidden=false;
  if(tmFolders)tmFolders.hidden=false;
  loadFolders();
  applyWidth();
  applyOpenDefault();
  renderList();
  expandRoots();
  syncWatchers();
})();
