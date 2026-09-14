/* ===== 자동 업데이트 + 릴리스 노트 (EXE 전용) — MDeautify v1.8.1 에서 이식 =====
   원본: MDeautify js/app.js 의 세 블록(GitHub 릴리스 공유 캐시 · 릴리스 노트 모달 · 자동 업데이트).
   MDocify 적응: REPO·EXE명·임시파일 접두어, localStorage 접두어(mdocify_), 설정 버튼(btnDocSettings),
   seenCheck 를 이벤트 대기 없이 즉시 실행(고정 포트라 localStorage 가 유지되므로).
   ⚠️ 릴리스에 exe + exe.sha256 두 자산이 모두 있어야 자동 설치가 동작한다. */
/* 원본은 app.js 스코프의 esc() 헬퍼를 썼다. 별도 파일이라 여기서 정의한다. */
function __updEsc(t){return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
/* ===== GitHub 릴리스 목록 공유 캐시 (자동 업데이트 확인 + 릴리스 노트가 함께 사용) =====
   - /releases 한 번만 호출해 최근 목록을 캐시(TTL 10분) → 시작 시 확인·설정 열기·노트 열기가 겹쳐도 재호출 안 함.
   - ETag 조건부 요청(If-None-Match): 변경 없으면 304 → GitHub rate limit 에 미차감(사실상 공짜). 미인증 60회/시간 소진 방지.
   - 실패 시 캐시가 있으면 캐시로 폴백. force=true 면 TTL 무시하고 재검증(단 ETag 로 304 면 여전히 무료). */
(function(){
  var REPO="felixleee/MDocify",URL="https://api.github.com/repos/"+REPO+"/releases?per_page=100",TTL=600000;
  var cache=null,etag=null,ts=0,inflight=null;
  window.__ghReleases=function(force){
    var now=Date.now();
    if(!force&&cache&&(now-ts)<TTL)return Promise.resolve(cache);
    if(inflight)return inflight;                          /* 동시 호출 합치기 */
    var headers={"Accept":"application/vnd.github+json"};
    if(etag)headers["If-None-Match"]=etag;
    inflight=fetch(URL,{headers:headers}).then(function(r){
      if(r.status===304){ts=Date.now();return cache||[];}  /* 변경 없음 → 캐시 재사용(미차감) */
      if(!r.ok)throw new Error("HTTP "+r.status);
      var et=r.headers.get("etag");if(et)etag=et;
      return r.json().then(function(arr){cache=Array.isArray(arr)?arr:[];ts=Date.now();return cache;});
    }).catch(function(e){if(cache)return cache;throw e;})   /* 실패해도 캐시 있으면 그걸로 */
      .then(function(v){inflight=null;return v;},function(e){inflight=null;throw e;});
    return inflight;
  };
})();
/* ===== 릴리스 노트 모달 (GitHub 릴리스 body 를 marked 로 렌더) =====
   __showReleaseNotes(tag): 수동(즉시 열고 로딩→채움/에러). __showReleaseNotesAuto(tag): 자동(성공 시에만 표시). */
(function(){
  var REPO="felixleee/MDocify";
  var modal=document.getElementById("notesModal"),titleEl=document.getElementById("nmTitle"),bodyEl=document.getElementById("nmBody"),closeBtn=document.getElementById("nmClose");
  if(!modal)return;
  function close(){modal.hidden=true;}
  if(closeBtn)closeBtn.addEventListener("click",close);
  modal.addEventListener("click",function(e){if(e.target===modal)close();});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!modal.hidden)close();});
  var TITLE="MDocify Release Note";
  /* 릴리스 body 선두의 중복 제목(#/## …)을 제거 — 섹션 헤더로 버전을 따로 표기하므로. */
  function stripHead(md){return String(md||"").replace(/^[ \t]*#{1,2}[ \t]+.*(?:\r?\n)+/,"");}
  /* 최근 5개 릴리스를 공유 캐시(window.__ghReleases)에서 가져와 각 버전 섹션으로 렌더 — 자동 업데이트 확인과 호출 공유. */
  function fetchRecent(){
    return window.__ghReleases().then(function(arr){if(!Array.isArray(arr))arr=[];return arr.map(function(j){
        var tag=String(j.tag_name||j.name||"").replace(/^v/i,"");
        return {ver:tag?("v"+tag):(j.name||"릴리스"),
                date:String(j.published_at||j.created_at||"").slice(0,10),
                html:(j.body&&typeof marked!=="undefined")?marked.parse(stripHead(j.body)):__updEsc(j.body||"")};
      });});
  }
  function renderList(items){
    if(titleEl)titleEl.textContent=TITLE;
    var h="";
    for(var i=0;i<items.length;i++){var it=items[i];
      h+="<section class='nm-rel'><div class='nm-rel-head'><span class='nm-ver'>"+__updEsc(it.ver)+"</span>"+
         (it.date?"<span class='nm-date'>"+__updEsc(it.date)+"</span>":"")+"</div>"+
         (it.html||"<p class='nm-empty'>내용이 없습니다.</p>")+"</section>";
    }
    if(bodyEl){bodyEl.innerHTML=h||"<p class='nm-loading'>릴리스 노트가 없습니다.</p>";bodyEl.scrollTop=0;}
    modal.hidden=false;
  }
  window.__showReleaseNotes=function(){
    if(titleEl)titleEl.textContent=TITLE;if(bodyEl)bodyEl.innerHTML="<p class='nm-loading'>불러오는 중…</p>";modal.hidden=false;
    return fetchRecent().then(function(items){if(items.length)renderList(items);else if(bodyEl)bodyEl.innerHTML="<p class='nm-loading'>릴리스 노트가 없습니다.</p>";}).catch(function(){if(bodyEl)bodyEl.innerHTML="<p class='nm-err'>릴리스 노트를 불러오지 못했어요.</p>";});
  };
  window.__showReleaseNotesAuto=function(){
    return fetchRecent().then(function(items){if(items.length)renderList(items);}).catch(function(){});
  };
})();
/* ===== 자동 업데이트 (EXE 전용) =====
   확인: GitHub API(CORS 허용)로 최신 릴리스 tag 를 현재 버전(NL_APPVERSION)과 비교.
   설치: exe+sha256 다운로드 URL·대상 경로를 담은 PowerShell 헬퍼를 temp 에 쓰고 백그라운드 실행 → app.exit().
         헬퍼가 네이티브 다운로드 → SHA256 검증 → Unblock-File → (앱 종료로 exe 잠금 풀릴 때까지 대기) → 백업 후 교체 → 재실행.
   서명 없는 exe 라도 네이티브 다운로드+Unblock-File 로 SmartScreen(MotW)은 대체로 회피(백신 오탐은 서명 전까지 별개 리스크). */
(function(){
  var REPO="felixleee/MDocify",EXE="MDocify.exe";
  var isExe=(typeof window.NL_PORT!=="undefined"&&typeof window.Neutralino!=="undefined");
  var about=document.getElementById("tmAbout"),verEl=document.getElementById("tmVer"),
      btn=document.getElementById("tmUpd"),box=document.getElementById("tmUpdBox"),msg=document.getElementById("tmUpdMsg"),
      act=document.getElementById("tmUpdAct"),link=document.getElementById("tmUpdLink"),go=document.getElementById("tmUpdGo"),
      settingsBtn=document.getElementById("btnDocSettings"),
      updModal=document.getElementById("updModal"),updMsgEl=document.getElementById("updMsg");
  if(!about||!isExe)return;                                  /* 버전/업데이트 정보는 EXE 에서만 */
  function showUpd(t){if(updMsgEl)updMsgEl.textContent=t;if(updModal)updModal.hidden=false;}
  function hideUpd(){if(updModal)updModal.hidden=true;}
  var CUR=window.NL_APPVERSION?String(window.NL_APPVERSION):"";
  about.hidden=false;if(verEl)verEl.textContent=CUR||"—";

  function verGt(a,b){a=String(a).replace(/^v/i,"").split(".");b=String(b).replace(/^v/i,"").split(".");for(var i=0;i<3;i++){var x=parseInt(a[i]||0,10),y=parseInt(b[i]||0,10);if(x>y)return true;if(x<y)return false;}return false;}
  function setMsg(cls,html){if(!box||!msg)return;box.hidden=false;msg.className="tm-upd-msg"+(cls?" "+cls:"");msg.innerHTML=html;}
  function showAct(){if(act)act.hidden=false;}   /* '릴리스 노트'는 새 창 대신 인-앱 모달로(아래 링크 클릭) */
  function hideAct(){if(act)act.hidden=true;}
  if(link)link.addEventListener("click",function(){var t=(latest&&latest.tag)||CUR;if(window.__showReleaseNotes)window.__showReleaseNotes(t);});

  var latest=null;   /* {tag, exeUrl, shaUrl, size, notesUrl} */
  /* 최신 릴리스를 공유 캐시(window.__ghReleases)에서 도출 — /releases 목록의 첫 정식(초안·프리릴리스 제외) 릴리스. force=true 면 ETag 재검증. */
  function fetchLatest(force){
    return window.__ghReleases(force).then(function(arr){
      var j=null;for(var i=0;i<(arr||[]).length;i++){if(!arr[i].draft&&!arr[i].prerelease){j=arr[i];break;}}
      if(!j)return {tag:"",exeUrl:null,shaUrl:null,size:0,notesUrl:""};
      var a=(j.assets||[]),exeUrl=null,shaUrl=null,size=0;for(var k=0;k<a.length;k++){if(a[k].name===EXE){exeUrl=a[k].browser_download_url;size=a[k].size||0;}else if(a[k].name===EXE+".sha256")shaUrl=a[k].browser_download_url;}
      return {tag:(j.tag_name||"").replace(/^v/i,""),exeUrl:exeUrl,shaUrl:shaUrl,size:size,notesUrl:j.html_url};});
  }
  function check(auto,force){
    if(btn)btn.disabled=true;if(!auto)setMsg("","확인 중…");
    return fetchLatest(force).then(function(info){
      latest=info;if(btn)btn.disabled=false;
      if(!info.tag){if(!auto)setMsg("bad","릴리스 정보를 읽지 못했어요.");return false;}
      if(verGt(info.tag,CUR)){
        if(settingsBtn)settingsBtn.classList.add("has-update");
        if(!info.exeUrl){setMsg("warn","새 버전 <b>v"+info.tag+"</b> 이 있지만 자동 설치용 exe가 없어요. 릴리스에서 직접 받아 주세요.");showAct();if(go)go.style.display="none";return true;}
        setMsg("warn","새 버전 <b>v"+info.tag+"</b> 이 있습니다. (현재 v"+CUR+")");showAct();if(go){go.style.display="";go.disabled=false;}return true;   /* 새 버전 → 설치 버튼 활성 */
      }
      if(settingsBtn)settingsBtn.classList.remove("has-update");
      if(!auto){setMsg("ok","최신 버전입니다. (v"+CUR+")");showAct();if(go){go.style.display="";go.disabled=true;}}  /* 같은 버전 → 버튼은 두되 비활성화 */
      else hideAct();
      return false;
    }).catch(function(e){if(btn)btn.disabled=false;if(!auto)setMsg("bad","업데이트 확인 실패: "+((e&&e.message)||e));return false;});
  }

  function psQ(s){return "'"+String(s).replace(/'/g,"''")+"'";}   /* PowerShell single-quote escape */
  function buildHelper(exeUrl,shaUrl,target){
    return [
      "$ErrorActionPreference='SilentlyContinue'",
      "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12",
      "$exe="+psQ(exeUrl),"$sha="+psQ(shaUrl||""),"$target="+psQ(target),
      "function Relaunch(){ try{ if(Test-Path $target){ Start-Process -FilePath $target } }catch{} }",   /* 실패 시 원본(교체 전 온전한 exe) 재실행 → 앱이 닫힌 채 남지 않게 */
      "$tmp=Join-Path $env:TEMP 'mdocify-update'",
      "New-Item -ItemType Directory -Force $tmp | Out-Null",
      "$status=Join-Path $tmp 'status.txt'",
      "Remove-Item $status -Force -ErrorAction SilentlyContinue",   /* 이전 실행의 status 제거(앱이 stale 읽지 않게) */
      "$dl=Join-Path $tmp 'MDocify.new.exe'",
      /* 다운로드/검증 실패는 앱이 아직 살아있으므로 status 만 남기고 종료(Relaunch 불필요) → 앱이 그 자리서 에러 표시 */
      "try{ Invoke-WebRequest -Uri $exe -OutFile $dl -UseBasicParsing }catch{ Set-Content -LiteralPath $status -Value 'fail:download' -Encoding ascii; exit 1 }",
      "$expected=''",
      /* sha 자산은 GitHub 가 octet-stream 으로 줄 수 있어 .Content 가 Byte[] → 파일로 받아 Get-Content -Raw(문자열)로 읽어 파싱 */
      "if($sha){ try{ $sf=Join-Path $tmp 'MDocify.sha'; Invoke-WebRequest -Uri $sha -OutFile $sf -UseBasicParsing; $c=Get-Content $sf -Raw; $expected=(($c -replace '[^0-9A-Fa-f]','')).Substring(0,64).ToLower() }catch{ $expected='' } }",
      "$actual=(Get-FileHash $dl -Algorithm SHA256).Hash.ToLower()",
      "if($expected -and ($actual -ne $expected)){ Remove-Item $dl -Force; Set-Content -LiteralPath $status -Value 'fail:verify' -Encoding ascii; exit 2 }",
      "Unblock-File $dl",
      "Set-Content -LiteralPath $status -Value 'downloaded' -Encoding ascii",   /* 앱이 이걸 보고 '설치 중' 표시 후 종료 → 아래 교체 진행 */
      "$dir=[IO.Path]::GetDirectoryName($target)",
      "$bakName=[IO.Path]::GetFileName($target)+'.bak'",
      "$bak=Join-Path $dir $bakName",
      "$ok=$false",
      "for($i=0;$i -lt 120;$i++){ try{ if(Test-Path $bak){Remove-Item $bak -Force}; Rename-Item -LiteralPath $target -NewName $bakName -ErrorAction Stop; Copy-Item $dl $target -Force; $ok=$true; break }catch{ Start-Sleep -Milliseconds 500 } }",
      "if(-not $ok){ if((Test-Path $bak) -and -not (Test-Path $target)){ Rename-Item -LiteralPath $bak -NewName ([IO.Path]::GetFileName($target)) }; Relaunch; exit 3 }",
      "Remove-Item $bak -Force -ErrorAction SilentlyContinue",
      "Remove-Item $dl -Force -ErrorAction SilentlyContinue",
      "Start-Process -FilePath $target"
    ].join("\r\n");
  }
  /* status.txt 폴링: 다운로드 동안 앱은 열린 채 진행률 표시.
     'downloaded' → '설치 중' 표시 후 앱 종료(잠금 해제) → 헬퍼가 교체+재실행. 'fail:*' → 앱 유지+에러. */
  function poll(statusPath,dlPath,total){
    var tries=0,MAX=600;   /* 600 * 500ms = 5분 */
    var t=setInterval(function(){
      tries++;
      Neutralino.filesystem.readFile(statusPath).then(function(s){
        s=String(s||"").trim();
        if(s.indexOf("downloaded")===0){
          clearInterval(t);showUpd("설치 중… 곧 재시작됩니다");
          setTimeout(function(){try{Neutralino.app.exit();}catch(e){}},600);   /* 종료 → 헬퍼가 교체+재실행 */
        }else if(s.indexOf("fail")===0){
          clearInterval(t);hideUpd();if(go)go.disabled=false;
          var code=(s.split(":")[1]||"").trim();
          var why=code==="download"?"다운로드에 실패했어요.":code==="verify"?"파일 검증(SHA256)에 실패했어요.":"업데이트에 실패했어요.";
          if(window.__appAlert)window.__appAlert(why+" 앱은 그대로 유지됩니다.","업데이트 실패");
        }
      }).catch(function(){
        /* status 없음 = 다운로드 진행 중 → 파일 크기로 대략 % */
        Neutralino.filesystem.getStats(dlPath).then(function(st){
          if(total>0){var pct=Math.min(99,Math.floor((st.size/total)*100));showUpd("업데이트 다운로드 중… "+pct+"%");}
          else showUpd("업데이트 다운로드 중…");
        }).catch(function(){showUpd("업데이트 다운로드 중…");});
      });
      if(tries>=MAX){clearInterval(t);hideUpd();if(go)go.disabled=false;if(window.__appAlert)window.__appAlert("업데이트 시간이 초과되었습니다. 앱은 그대로 유지됩니다.","업데이트 실패");}
    },500);
  }
  function install(){
    if(!latest||!latest.tag){setMsg("bad","릴리스 정보를 확인하지 못했어요.");return;}
    if(!verGt(latest.tag,CUR)){setMsg("ok","이미 최신 버전입니다. (v"+CUR+")");hideAct();if(settingsBtn)settingsBtn.classList.remove("has-update");return;}  /* 최신이면 설치 실행 안 함(안전장치) */
    if(!latest.exeUrl){setMsg("bad","설치할 exe 자산이 없습니다.");return;}
    var base=String(window.NL_PATH||"").replace(/[\\/]+$/,"");
    if(!base){setMsg("bad","앱 경로를 확인하지 못했어요.");return;}
    var target=base+"\\"+EXE,total=latest.size||0;
    if(go)go.disabled=true;
    Neutralino.os.getEnv("TEMP").then(function(tmp){
      var dir=(tmp||base),name="mdocify-update.ps1",updDir=dir+"\\mdocify-update";
      var statusPath=updDir+"\\status.txt",dlPath=updDir+"\\MDocify.new.exe";
      var script=buildHelper(latest.exeUrl,latest.shaUrl,target);
      return Neutralino.filesystem.writeFile(dir+"\\"+name,script).then(function(){
        /* 상대 파일명 + cwd 로 실행(경로 공백/인용부호 회피). 앱은 닫지 않고 다운로드 진행률을 폴링으로 표시. */
        return Neutralino.os.execCommand("powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "+name,{background:true,cwd:dir});
      }).then(function(){
        showUpd("업데이트 다운로드 중…");
        poll(statusPath,dlPath,total);
      });
    }).catch(function(e){hideUpd();if(go)go.disabled=false;if(window.__appAlert)window.__appAlert("설치 시작 실패: "+((e&&e.message)||e),"오류");});
  }

  if(btn)btn.addEventListener("click",function(){check(false,true);});   /* 명시적 '업데이트 확인' 버튼 → force 재검증(ETag 라 변경 없으면 304=무료) */
  if(go)go.addEventListener("click",install);
  window.__updateCheck=function(){return check(false,false);};   /* 톱니 열 때 자동 호출 → 캐시(TTL 10분) 재사용, 재호출 안 함 */
  setTimeout(function(){check(true,false);},2500);   /* 시작 후 조용히 1회 확인 → 캐시 채움. 새 버전이면 설정 버튼에 점 표시 */

  /* 업데이트 후 첫 실행이면 릴리스 노트 모달 자동 표시.
     seen 버전은 localStorage 의 mdocify_seen_version 이다. MDocify 는 config port 가 고정(52103)이라
     origin 이 매 실행 같아 localStorage 가 그대로 유지된다(exe 교체에도 유지) → 즉시 판정한다.
     (원본 MDeautify 는 port:0 이라 매 실행 localStorage 가 비어 설정 파일 하이드레이션을 기다려야 했다.)
     '업그레이드'만 표시(첫 설치 제외): seen 이 현재와 다르거나(seen 존재), seen 은 없지만 기존 설정키가 있으면(=이전 사용자) 표시. */
  function seenCheck(){
    if(!CUR)return;
    var seen=null;try{seen=localStorage.getItem("mdocify_seen_version");}catch(e){}
    var hadSettings=false;try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf("mdocify_")===0&&k!=="mdocify_seen_version"){hadSettings=true;break;}}}catch(e){}
    var upgraded=(seen&&seen!==CUR)||(!seen&&hadSettings);
    if(upgraded&&window.__showReleaseNotesAuto)window.__showReleaseNotesAuto(CUR);
    if(seen!==CUR){try{localStorage.setItem("mdocify_seen_version",CUR);}catch(e){}}
  }
  seenCheck();   /* MDocify 는 고정 포트(52103)라 localStorage 가 실행 간 유지됨 → 설정 파일 하이드레이션을 기다릴 필요 없이 즉시 판정 */
})();
