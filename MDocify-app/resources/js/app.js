/* MDocify 본체: 편집기 + A4 페이지네이션 미리보기(Paged.js) + .docx 저장
 * 미리보기 렌더 파이프라인은 MDeautify와 동일(buildSource → runPaged). */
(function () {
  'use strict';

  var TEMPLATES = { clean: window.TPL_CLEAN };
  var curTemplate = 'clean';
  var curName = 'document';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 공통 유틸 ---------- */
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}

  /* ---------- 편집기 구문 강조 미러(MDeautify 이식) ---------- */
  function hlMd(t){var e=esc(t);
  /* 각 줄을 .ln[data-ln] 로 감싸 스크롤 동기화(방식 B)에서 줄별 Y좌표를 측정 가능하게 함.
     인라인 span이라 오버레이(투명 textarea) 정합에는 영향 없음. */
  return e.split("\n").map(function(line,i){var l=line;
  if(/^\s{0,3}#{1,6}\s/.test(line))l='<span class="mh">'+l+'</span>';
  else if(/^\s{0,3}&gt;/.test(l))l='<span class="mq">'+l+'</span>';
  else{
  l=l.replace(/^(\s*)([-*+]|\d+\.)(\s)/,'$1<span class="ml">$2</span>$3');
  l=l.replace(/(`[^`]+`)/g,'<span class="mc">$1</span>');
  l=l.replace(/(\*\*[^*]+\*\*)/g,'<span class="mb">$1</span>');
  l=l.replace(/(\[[^\]]+\]\([^)]+\))/g,'<span class="mlk">$1</span>');
  }
  return '<span class="ln" data-ln="'+i+'">'+(l||'​')+'</span>';}).join("\n");}
  /* 미러 동기화: textarea 값이 바뀌는 모든 지점에서 호출(직접 .value= 는 input 이벤트를 안 쏘므로 필수). 전역 노출로 이식된 IIFE도 사용. */
  function syncMirror(){var r=$('raw'),ta=$('editor');if(r&&ta){r.innerHTML=hlMd(ta.value);}}
  window.__syncMirror=syncMirror;

  function fixLooseLists(t){
    var lines=t.split("\n"),out=[];var isItem=function(s){return /^\s*([-*+]|\d+\.)\s+/.test(s);};
    for(var i=0;i<lines.length;i++){if(isItem(lines[i])){var p=out.length?out[out.length-1]:"";if(p.trim()&&!isItem(p))out.push("");}out.push(lines[i]);}
    return out.join("\n");
  }
  function parseFrontmatter(t){
    var m=t.match(/^---\s*\n([\s\S]*?)\n---\s*\n/),meta={};if(!m)return{meta:meta,body:t};
    m[1].split("\n").forEach(function(line){var i=line.indexOf(":");if(i>0)meta[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,"");});
    return{meta:meta,body:t.slice(m[0].length)};
  }
  function buildCover(meta){
    var title=meta.title||meta["제목"]||"",subtitle=meta.subtitle||meta["부제"]||"",kicker=meta["사업명"]||meta.kicker||"";
    var special={"title":1,"subtitle":1,"제목":1,"부제":1,"사업명":1,"kicker":1};var rows="";
    Object.keys(meta).forEach(function(k){if(special[k])return;rows+="<tr><td class='k'>"+esc(k)+"</td><td>"+esc(meta[k])+"</td></tr>";});
    if(!title&&!subtitle&&!rows)return"";
    return "<div class='cover'>"+(kicker?"<div class='kicker'>"+esc(kicker)+"</div>":"")+"<h1>"+esc(title)+"</h1><div class='st'>"+esc(subtitle)+"</div><div class='bar'></div>"+(rows?"<table>"+rows+"</table>":"")+"</div>";
  }

  var PAGED_CSS="@page{size:A4;margin:18mm 15mm;@top-center{content:' ';font-family:'Noto Sans KR','Malgun Gothic',sans-serif;font-size:9pt;color:#94a3b8;}@bottom-center{content:counter(page);font-family:'Noto Sans KR','Malgun Gothic',sans-serif;font-size:9pt;color:#94a3b8;}}.content h1,.content h2,.content h3,.content h4{break-after:avoid-page;-webkit-column-break-after:avoid;}.content tr,.content img,.content svg,.content figure,.content pre,.content blockquote{break-inside:avoid;}.content table,.content ul,.content ol{break-inside:auto;}.content thead{break-after:avoid;}.pb-before{break-before:page;}.cover{break-after:page;}.content p,.content li{orphans:2;widows:2;}";

  /* ---------- 경량 코드 구문 강조 (VSCode Dark 계열, MDeautify와 동일) ---------- */
  function hlCode(src, lang){
    function E(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
    function W(cls,txt){return '<span class="thl-'+cls+'">'+E(txt)+'</span>';}
    function scan(str,RE,map){var out="",last=0,m;while((m=RE.exec(str))!==null){if(m.index===RE.lastIndex){RE.lastIndex++;continue;}out+=E(str.slice(last,m.index))+W(map(m),m[0]);last=RE.lastIndex;}return out+E(str.slice(last));}
    lang=(lang||"").toLowerCase().trim();
    var AL={javascript:"js",jsx:"js",mjs:"js",node:"js",typescript:"ts",tsx:"ts","c++":"cpp",cxx:"cpp",cc:"cpp",hpp:"cpp","c#":"cs",csharp:"cs",py:"python",python3:"python",sh:"bash",shell:"bash",zsh:"bash",ps:"powershell",ps1:"powershell",pwsh:"powershell",xml:"html",htm:"html",markdown:"md",mkd:"md"};
    var L=AL[lang]||lang;
    if(L==="html"){return scan(src,/(<!--[\s\S]*?-->)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(<\/?[a-zA-Z][\w:-]*|\/?>)|([a-zA-Z_:][\w:.-]*)(?=\s*=)/g,function(m){return m[1]!==undefined?"com":m[2]!==undefined?"str":m[3]!==undefined?"kw":"fn";});}
    if(L==="css"||L==="scss"){var cRE=L==="scss"?"\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*":"\\/\\*[\\s\\S]*?\\*\\/";var RE=new RegExp("("+cRE+")|(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')|(#[0-9a-fA-F]{3,8}\\b|\\b\\d[\\d.]*(?:px|em|rem|%|vh|vw|vmin|vmax|pt|s|ms|deg|fr|ch|ex)?\\b)|(@[\\w-]+|\\$[\\w-]+|--[\\w-]+|![a-z]+)|([a-zA-Z-][\\w-]*)(?=\\s*:)","g");return scan(src,RE,function(m){return m[1]!==undefined?"com":m[2]!==undefined?"str":m[3]!==undefined?"num":m[4]!==undefined?"kw":"fn";});}
    if(L==="md"){var lines=src.split("\n"),o=[];var inl=function(t){return scan(t,/(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]]+\]\([^)]+\))/g,function(m){return m[1]!==undefined?"str":m[2]!==undefined?"kw":m[3]!==undefined?"lit":"fn";});};for(var i=0;i<lines.length;i++){var ln=lines[i];if(/^\s{0,3}#{1,6}\s/.test(ln)){o.push(W("kw",ln));}else if(/^\s{0,3}>/.test(ln)){o.push(W("com",ln));}else if(/^\s{0,3}(```|~~~)/.test(ln)){o.push(W("kw",ln));}else{var mm=ln.match(/^(\s{0,3})([-*+]|\d+\.)(\s.*)$/);if(mm){o.push(E(mm[1])+W("kw",mm[2])+inl(mm[3]));}else{o.push(inl(ln));}}}return o.join("\n");}
    var K={js:"abstract async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch this throw try typeof var void while with yield",ts:"abstract as async await break case catch class const continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface keyof let namespace new of private protected public readonly return set static super switch this throw try type typeof var void while yield",c:"auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while include define ifdef ifndef endif pragma undef",cpp:"auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern float for friend goto if inline int long namespace new nullptr operator override private protected public register return short signed sizeof static struct switch template this throw try typedef typename union unsigned using virtual void volatile while include define",cs:"abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach get goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sbyte sealed set short sizeof static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await yield",php:"abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty endif extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield",python:"and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case",bash:"if then else elif fi case esac for while until do done in function select time echo cd export local return read source alias unset shift eval exec set",powershell:"if elseif else switch foreach for while do until break continue function return param begin process end try catch finally throw class enum filter in trap exit",sql:"select from where insert into values update set delete create table drop alter add column index view join inner left right outer full on group by order having limit offset union all as distinct and or not null is in like between exists case when then else end primary key foreign references default constraint unique",json:""};
    var LN={js:["//"],ts:["//"],c:["//"],cpp:["//"],cs:["//"],php:["//","#"],python:["#"],bash:["#"],powershell:["#"],sql:["--"],json:[]};
    var BL={js:1,ts:1,c:1,cpp:1,cs:1,php:1,sql:1},TPL={js:1,ts:1},TRIPLE={python:1};
    if(!(L in K))L="js";
    function q(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
    var g=[],com=[];if(BL[L])com.push("\\/\\*[\\s\\S]*?\\*\\/");if(L==="powershell")com.push("<#[\\s\\S]*?#>");(LN[L]||[]).forEach(function(x){com.push(q(x)+"[^\\n]*");});g.push(com.length?com.join("|"):"(?!)");
    var st=[];if(TRIPLE[L]){st.push('"""[\\s\\S]*?"""',"'''[\\s\\S]*?'''");}st.push('"(?:\\\\.|[^"\\\\])*"',"'(?:\\\\.|[^'\\\\])*'");if(TPL[L])st.push("`(?:\\\\.|[^`\\\\])*`");g.push(st.join("|"));
    g.push("0[xX][\\da-fA-F]+|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b");
    var kw=(K[L]||"").trim();g.push(kw?"\\b(?:"+kw.split(/\s+/).map(q).join("|")+")\\b":"(?!)");
    g.push("\\b(?:true|false|null|undefined|None|True|False|nil|NaN|NULL)\\b");
    g.push("[A-Za-z_$][\\w$]*(?=\\s*\\()");
    var RE2=new RegExp(g.map(function(x){return "("+x+")";}).join("|"),"g"+(L==="sql"?"i":""));
    return scan(src,RE2,function(m){return m[1]!==undefined?"com":m[2]!==undefined?"str":m[3]!==undefined?"num":m[4]!==undefined?"kw":m[5]!==undefined?"lit":"fn";});
  }

  /* ---------- 소스(.content) 빌드 ---------- */
  function buildSource(text){
    var fm=parseFrontmatter(text),meta=fm.meta;
    var srcmd=fixLooseLists(fm.body);
    var title=meta.title||meta["제목"]||"";
    if(title)srcmd=srcmd.replace(/^\s*#\s+(.*)\r?\n/,function(m,h){return h.trim()===title.trim()?"":m;});
    window.marked.setOptions({gfm:true,breaks:false});
    if(!window.marked.__delFix){window.marked.__delFix=1;window.marked.use({tokenizer:{del(src){var m=/^~~(?=\S)([\s\S]*?\S)~~/.exec(src);if(m){return {type:"del",raw:m[0],text:m[1],tokens:this.lexer.inlineTokens(m[1])};}if(src.charCodeAt(0)===126){return {type:"text",raw:"~",text:"~"};}return false;}}});}
    /* 이미지 크기 단축 문법(=300x200·=300x·=x200·=50%·=300)→<img> + 공백 경로 <>감싸기.
       코드블록(```/~~~, 백틱 개수 무관)·인라인 코드 밖에서만(문법 예시 보호). 줄 수 유지. */
    function outsideCode(text,fn){
      var lines=text.split("\n"),out=[],fence=null;
      for(var li=0;li<lines.length;li++){var ln=lines[li],fm2=ln.match(/^\s*(`{3,}|~{3,})/);
        if(fence){out.push(ln);if(fm2&&fm2[1].charAt(0)===fence.ch&&fm2[1].length>=fence.len&&/^\s*(`{3,}|~{3,})\s*$/.test(ln))fence=null;continue;}
        if(fm2){fence={ch:fm2[1].charAt(0),len:fm2[1].length};out.push(ln);continue;}
        out.push(ln.split(/(`+[^`]*`+)/g).map(function(seg,i){return i%2?seg:fn(seg);}).join(""));
      }
      return out.join("\n");
    }
    srcmd=outsideCode(srcmd,function(s){
      s=s.replace(/!\[([^\]]*)\]\(\s*([^()]*(?:\([^)]*\)[^()]*)*?)\s+=\s*(\d+x\d+|\d+x|x\d+|\d+%|\d+)\s*\)/g,function(m,alt,dest,sz){
        var d=dest.replace(/^<|>$/g,"").trim();if(!d||/["']/.test(d))return m;
        var a;
        if(/^\d+x\d+$/.test(sz)){var p=sz.split("x");a=' width="'+p[0]+'" height="'+p[1]+'"';}
        else if(/^\d+x$/.test(sz))a=' width="'+sz.slice(0,-1)+'"';
        else if(/^x\d+$/.test(sz))a=' height="'+sz.slice(1)+'"';
        else if(/^\d+%$/.test(sz))a=' style="width:'+sz.slice(0,-1)+'%"';
        else a=' width="'+sz+'"';
        function ea(x){return String(x).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
        return '<img src="'+ea(d)+'" alt="'+ea(alt)+'"'+a+'>';
      });
      s=s.replace(/!\[([^\]]*)\]\(\s*([^()]*(?:\([^)]*\)[^()]*)*)\s*\)/g,function(m,alt,dest){if(!dest||dest.charAt(0)==="<")return m;if(/["']/.test(dest))return m;if(!/\s/.test(dest))return m;return "!["+alt+"](<"+dest.trim()+">)";});
      return s;
    });
    var src=$('src');
    src.innerHTML=buildCover(meta)+"<div class='content'>"+window.marked.parse(srcmd)+"</div>";
    src.querySelectorAll(".content a[href]").forEach(function(a){a.setAttribute("target","_blank");a.setAttribute("rel","noopener noreferrer");});
    src.querySelectorAll(".content h1, .content h2, .content h3").forEach(function(h){var m=h.innerHTML.match(/^([A-Z])[.)·]?\s+([\s\S]*)$/);if(m)h.innerHTML="<span class='sn'>"+m[1]+"</span>"+m[2];});
    src.querySelectorAll("code.language-mermaid").forEach(function(c){var pre=c.closest("pre")||c;var kind=window.DIAG?window.DIAG.detectKind(c.textContent):null;var fig=document.createElement("figure");if(kind){fig.innerHTML=window.DIAG.render(kind,c.textContent);}else{var box=document.createElement("div");box.className="diag-unsupported";var ti=document.createElement("div");ti.className="du-title";ti.textContent="지원하지 않는 다이어그램 (지원: flowchart · sequence · erDiagram · pie · state · class · gantt · journey · mindmap · timeline)";box.appendChild(ti);fig.appendChild(box);}pre.replaceWith(fig);});
    src.querySelectorAll("pre code[class*='language-']").forEach(function(c){var mm=(c.className||"").match(/language-([\w#+.-]+)/);c.innerHTML=hlCode(c.textContent,mm?mm[1]:"");});
    return src;
  }

  /* ---------- 페이지네이션 (Paged.js) ---------- */
  function setHead(txt){var h=$('pvHead');if(h)h.textContent=txt;}
  function fallbackRender(src){var pages=$('pages');pages.innerHTML="";var d=document.createElement("div");d.className="fallback-doc";d.innerHTML=src.innerHTML;pages.appendChild(d);setHead("연속 보기 (페이지 분할 미리보기를 사용할 수 없습니다)");}
  function repeatTableHeaders(container){
    var last=null;
    container.querySelectorAll(".pagedjs_page table").forEach(function(t){
      var thead=t.querySelector(":scope > thead");var colg=t.querySelector(":scope > colgroup");
      if(thead){last={thead:thead,colg:colg};return;}
      if(last){if(last.colg&&!colg){t.insertBefore(last.colg.cloneNode(true),t.firstChild);}var tb=t.querySelector(":scope > tbody");var h=last.thead.cloneNode(true);if(tb){t.insertBefore(h,tb);}else{t.appendChild(h);}}
    });
  }
  function runPaged(src,keepScroll){
    var pages=$('pages'),viewer=pages;
    var vMax=viewer.scrollHeight-viewer.clientHeight;
    var ratio=(keepScroll&&vMax>0)?viewer.scrollTop/vMax:0;
    function restore(){var m=viewer.scrollHeight-viewer.clientHeight;viewer.scrollTop=keepScroll?ratio*m:0;}
    pages.innerHTML="";
    if(!window.PagedModule||!window.PagedModule.Previewer){fallbackRender(src);restore();return;}
    var blobUrl=null;try{blobUrl=URL.createObjectURL(new Blob([PAGED_CSS],{type:"text/css"}));}catch(e){}
    try{
      var prev=new window.PagedModule.Previewer();
      prev.preview("<style>"+PAGED_CSS+"</style>"+src.innerHTML, blobUrl?[blobUrl]:[], pages).then(function(flow){
        if(blobUrl){try{URL.revokeObjectURL(blobUrl);}catch(e){}}
        repeatTableHeaders(pages);
        if(typeof window.applyFooter==="function")window.applyFooter();
        if(typeof window.applyHeader==="function")window.applyHeader();
        var n=pages.querySelectorAll(".pagedjs_page").length||((flow&&flow.total)||0);
        setHead("Total "+n+" page"+(n>1?"s":""));
        restore();
      }).catch(function(err){console.error(err);if(blobUrl){try{URL.revokeObjectURL(blobUrl);}catch(e){}}fallbackRender(src);restore();});
    }catch(e){console.error(e);fallbackRender(src);restore();}
  }

  var debounceTimer=null;
  async function renderPreview(text, keepScroll){
    var src=buildSource(text);
    if(typeof window.__resolveLocalImages==="function"){try{await window.__resolveLocalImages(src);}catch(e){}}
    document.body.classList.add('loaded');
    setHead("페이지 분할 중...");
    runPaged(src, keepScroll);
  }
  function onEdit(){syncMirror();clearTimeout(debounceTimer);debounceTimer=setTimeout(function(){renderPreview($('editor').value,true);},350);}

  /* 이식된(별도 IIFE) 뱃지/드롭/ZIP 코드가 호출하는 브리지: 미리보기 재생성 + 편집기 텍스트 교체 */
  window.__render=function(text, keepScroll){ renderPreview(text, keepScroll); };
  window.__setEditorText=function(text){ $('editor').value=text; if(window.__fname)curName=window.__fname; document.body.classList.add('loaded'); $('editor').scrollTop=0; syncMirror(); renderPreview(text,false); };

  /* ---------- 파일 로드 / 빈 문서 ---------- */
  function loadFile(file){
    if(!file)return;
    var r=new FileReader();
    r.onload=function(e){
      $('editor').value=e.target.result;
      curName=(file.name||'document').replace(/\.(md|markdown|txt)$/i,'');
      window.__mdName=file.name;window.__fname=curName;
      document.body.classList.add('loaded');
      $('editor').scrollTop=0;
      syncMirror();
      renderPreview(e.target.result,false);
    };
    r.readAsText(file,'utf-8');
  }
  function startBlank(){
    $('editor').value='';curName='document';
    window.__mdName=null;window.__fname='document';
    document.body.classList.add('loaded');
    syncMirror();
    renderPreview('',false);
    $('editor').focus();
  }

  /* ---------- .docx 저장 ---------- */
  function saveDocx(){
    var md=$('editor').value||'';
    if(!md.trim()){alert('내용이 없습니다. 먼저 MD를 입력하거나 파일을 여세요.');return;}
    var tpl=TEMPLATES[curTemplate]||window.TPL_CLEAN;
    setBusy(true);
    window.MD2DOCX.convert(md,tpl,window.__docSettings).then(function(blob){
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');a.href=url;a.download=curName+'.docx';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},1000);
    }).catch(function(err){console.error(err);alert('변환 실패: '+(err&&err.message?err.message:err));}).finally(function(){setBusy(false);});
  }
  function setBusy(b){var el=$('btnSave');if(el)el.disabled=b;document.body.classList.toggle('busy',b);}

  /* ---------- 리사이즈 + 접기 ---------- */
  function initSplitter(){
    var main=$('main'),pane=$('editorPane'),sp=$('splitter'),fb=$('foldBtn');
    if(!main||!pane||!sp||!fb)return;
    var ico=fb.querySelector('.fold-ico'),lastBasis='46%',dragging=false;
    function setIco(){ico.textContent=document.body.classList.contains('editor-collapsed')?'›':'‹';}
    fb.addEventListener('mousedown',function(e){e.stopPropagation();});
    fb.addEventListener('click',function(e){e.stopPropagation();var c=document.body.classList.toggle('editor-collapsed');if(!c)pane.style.flex='0 0 '+lastBasis;setIco();});
    sp.addEventListener('mousedown',function(e){if(e.target===fb||fb.contains(e.target))return;dragging=true;document.body.style.userSelect='none';document.body.style.cursor='col-resize';if(document.body.classList.contains('editor-collapsed')){document.body.classList.remove('editor-collapsed');setIco();}e.preventDefault();});
    window.addEventListener('mousemove',function(e){if(!dragging)return;var r=main.getBoundingClientRect();var w=e.clientX-r.left;w=Math.max(220,Math.min(r.width-260,w));pane.style.flex='0 0 '+w+'px';lastBasis=w+'px';});
    window.addEventListener('mouseup',function(){if(dragging){dragging=false;document.body.style.userSelect='';document.body.style.cursor='';}});
    setIco();
  }

  /* ---------- 초기화 ---------- */
  function init(){
    $('editor').addEventListener('input',onEdit);
    $('editor').addEventListener('scroll',function(){var r=$('raw');if(r){r.scrollTop=$('editor').scrollTop;r.scrollLeft=$('editor').scrollLeft;}});
    $('fileInput').addEventListener('change',function(e){if(e.target.files[0])loadFile(e.target.files[0]);e.target.value='';});
    var top=$('btnOpenTop');if(top)top.addEventListener('click',function(){$('fileInput').click();});
    var open=$('btnOpen');if(open)open.addEventListener('click',function(){$('fileInput').click();});
    var blank=$('btnBlank');if(blank)blank.addEventListener('click',startBlank);
    $('btnSave').addEventListener('click',saveDocx);
    var sel=$('tplSelect');if(sel)sel.addEventListener('change',function(){curTemplate=sel.value;});
    /* 라이트/다크 셸 테마: 선택 상태를 localStorage에 저장하고 시작 시 복원.
       다크는 '설정 기억' 체크와 무관하게 항상 독립 저장(MDeautify와 동일). 기본=라이트. */
    var dark=$('darkToggle');
    (function(){var KEY="mdocify_ui_mode",saved=null;try{saved=localStorage.getItem(KEY);}catch(e){}
      var isDark=saved==="dark";document.body.classList.toggle('dark',isDark);if(dark)dark.checked=isDark;
      if(dark)dark.addEventListener('change',function(){var mode=dark.checked?"dark":"light";document.body.classList.toggle('dark',dark.checked);try{localStorage.setItem(KEY,mode);}catch(e){}});
    })();
    /* 드롭 처리(.md + 이미지 + 커서 삽입)는 아래 이식된 IIFE가 담당. 여기서는 문서 단독 드롭 핸들러를 두지 않음(중복 방지). */
    initSplitter();
    syncMirror();  /* 초기 내용(있으면)에 미러 맞춤 */
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();

/* ===== 이하 MDeautify에서 이식: 이미지 붙여넣기/드롭 임베드 + 로컬 이미지 해석기 + ZIP + 파일 뱃지 ===== */

/* 이미지 붙여넣기 → data URI 로 임베드. 큰 이미지는 긴 변 기준 자동 다운스케일(WebP).
   100% 오프라인·경로 불필요·편집기 커서 위치에 ![alt](data:...) 삽입. */
(function(){
  var ta=document.getElementById("editor");if(!ta)return;
  var MAXDIM=1280,QUAL=0.85;  /* 긴 변 최대 px(초과 시 축소) + WebP 품질 */
  function altOf(f){var n=(f.name||"image").replace(/\.[a-z0-9]+$/i,"");return n||"image";}
  function insertText(txt){ta.focus();var ok=false;try{ok=document.execCommand("insertText",false,txt);}catch(e){}
    if(!ok){var s=ta.selectionStart,e=ta.selectionEnd,v=ta.value;ta.value=v.slice(0,s)+txt+v.slice(e);ta.selectionStart=ta.selectionEnd=s+txt.length;ta.dispatchEvent(new Event("input",{bubbles:true}));}}
  /* dataUrl → 다운스케일+WebP 재인코딩(투명도 지원). SVG는 벡터 유지. Promise<dataUrl>. */
  function encode(dataUrl,mime){return new Promise(function(res){
    if(/^image\/svg/i.test(mime||"")){res(dataUrl);return;}
    var img=new Image();
    img.onload=function(){
      var w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,scale=Math.min(1,MAXDIM/w,MAXDIM/h);
      var cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale));
      var c=document.createElement("canvas");c.width=cw;c.height=ch;c.getContext("2d").drawImage(img,0,0,cw,ch);
      var out;try{out=c.toDataURL("image/webp",QUAL);if(out.indexOf("data:image/webp")!==0)out=null;}catch(e){out=null;}
      if(!out)out=c.toDataURL("image/jpeg",QUAL);  /* WebP 미지원 폴백 */
      if(scale===1&&out.length>=dataUrl.length)out=dataUrl;  /* 축소 안 했고 재인코딩이 더 크면 원본 유지 */
      res(out);};
    img.onerror=function(){res(dataUrl);};  /* 디코드 실패 시 원본 유지 */
    img.src=dataUrl;});}
  function embed(file){var reader=new FileReader();reader.onload=function(){encode(reader.result,file.type).then(function(out){insertText("!["+altOf(file)+"]("+out+")");});};reader.readAsDataURL(file);}
  window.__img={encode:encode,insert:insertText};  /* 드롭/뱃지 경로에서 재사용 */
  ta.addEventListener("paste",function(e){var items=(e.clipboardData&&e.clipboardData.items)||[];
    for(var i=0;i<items.length;i++){if(items[i].type&&items[i].type.indexOf("image/")===0){var f=items[i].getAsFile();if(f){e.preventDefault();embed(f);return;}}}});
})();

/* ===== 통합 로컬 이미지 해석기 (드롭 풀 window.__drop 기준) =====
   각 <img> 로컬 경로를 드롭된 파일 맵(window.__drop)에서 찾아 data URI 로 치환. */
window.__resolveLocalImages=async function(src){
  var imgs=src.querySelectorAll("img"),list=[],seen={},ref={};
  for(var i=0;i<imgs.length;i++){var el=imgs[i],raw0=el.getAttribute("src")||"";
    if(/^(https?:|data:|blob:)/i.test(raw0))continue;
    var s=raw0;try{s=decodeURIComponent(raw0);}catch(e){}   /* marked가 공백·한글을 %인코딩하므로 복원해 파일명과 매칭 */
    var base=s.split(/[\\/]/).pop(),norm=s.replace(/^\.\//,"").replace(/\\/g,"/"),d=null;
    if(window.__drop)d=window.__drop[norm]||window.__drop[base]||null;
    if(!d&&typeof window.__nativeResolve==="function"){try{d=await window.__nativeResolve(s);}catch(e){}}
    if(d){window.__drop=window.__drop||{};if(!window.__drop[base])window.__drop[base]=d;}   /* 해석된 이미지를 풀에 보관 → 목록에 삭제 버튼 표시 + 문서 전환에도 유지 */
    if(d)el.setAttribute("src",d);
    ref[base]=1;ref[norm]=1;
    if(!seen[base]){seen[base]=1;list.push({name:base,status:d?"ok":"missing"});}
  }
  /* 드롭했지만 문서에서 참조하지 않은 이미지 표시 */
  if(window.__drop){for(var k in window.__drop){if(window.__drop.hasOwnProperty(k)&&!ref[k]&&!seen[k]){seen[k]=1;list.push({name:k,status:"unused"});}}}
  window.__imgFiles=list;
  if(typeof window.__renderFileBadge==="function")window.__renderFileBadge();
};

/* ===== 드롭: .md(+이미지들) 또는 폴더째 =====
   드롭 payload의 이미지 바이트로 ![](name.png) 해석(경로 불필요).
   .md만 드롭 → 문서만 로드. 이미지만 드롭(문서 열린 상태) → 커서에 임베드. */
(function(){
  function readText(f){return new Promise(function(r){var fr=new FileReader();fr.onload=function(){r(fr.result);};fr.readAsText(f,"utf-8");});}
  function readDataUrl(f){return new Promise(function(r){var fr=new FileReader();fr.onload=function(){r(fr.result);};fr.readAsDataURL(f);});}
  function mimeByName(n){var e=(n.split(".").pop()||"").toLowerCase();return ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",bmp:"image/bmp",svg:"image/svg+xml"})[e]||"";}
  function isImgName(n){return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n);}
  function isMdName(n){return /\.(md|markdown|txt)$/i.test(n);}
  function walk(entry,out){return new Promise(function(res){
    if(entry.isFile){entry.file(function(f){out.push(f);res();},function(){res();});}
    else if(entry.isDirectory){var rd=entry.createReader(),acc=[];(function rd2(){rd.readEntries(function(es){if(!es.length){(async function(){for(var c=0;c<acc.length;c++)await walk(acc[c],out);res();})();}else{acc=acc.concat(es);rd2();}},function(){res();});})();}
    else res();
  });}
  async function handle(entries,flat,insAt){
    var files=[];
    if(entries&&entries.length){for(var i=0;i<entries.length;i++)await walk(entries[i],files);}
    else files=flat||[];
    var md=null,imgs=[];
    for(var j=0;j<files.length;j++){var f=files[j];if(!md&&isMdName(f.name))md=f;else if(isImgName(f.name))imgs.push(f);}
    if(md){
      if(window.__confirmReplaceDoc&&!(await window.__confirmReplaceDoc()))return;   /* 다른 MD 교체 전 확인 */
      /* 함께 온 이미지는 기존 풀에 '병합'(문서 전환에도 이전 이미지 목록 유지) */
      window.__drop=window.__drop||{};
      for(var k=0;k<imgs.length;k++){var im=imgs[k];try{var du=await readDataUrl(im);window.__drop[im.name]=await window.__img.encode(du,im.type||mimeByName(im.name));}catch(e){}}
      window.__mdDir=null;
      var text=await readText(md);
      window.__mdName=md.name;window.__fname=md.name.replace(/\.(md|markdown|txt)$/i,"");
      window.__setEditorText(text);
    }else if(imgs.length&&document.body.classList.contains("loaded")){
      /* 이미지만 드롭 → 파일 풀(window.__drop)에 추가.
         에디터(textarea) 위에 드롭했으면(insAt!=null) 그 위치에 ![](이름) 참조까지 삽입,
         그 밖의 위치면 풀에만 추가(팝오버에서 삽입 가능). */
      window.__drop=window.__drop||{};
      var added=[];
      for(var m=0;m<imgs.length;m++){var ig=imgs[m];try{var du2=await readDataUrl(ig);window.__drop[ig.name]=await window.__img.encode(du2,ig.type||mimeByName(ig.name));added.push(ig.name);}catch(e){}}
      var ta=document.getElementById("editor");
      if(insAt!=null&&ta&&added.length){
        var refs=added.map(function(n){var alt=n.replace(/\.[a-z0-9]+$/i,"");var dest=/\s/.test(n)?"<"+n+">":n;return "!["+alt+"]("+dest+")";}).join("\n");
        var pos=Math.min(Math.max(0,insAt|0),ta.value.length),before=ta.value.slice(0,pos),after=ta.value.slice(pos);
        var block=(before&&!/\n$/.test(before)?"\n":"")+refs+(after&&!/^\n/.test(after)?"\n":"");
        var nt=before+block+after;ta.value=nt;
        try{ta.selectionStart=ta.selectionEnd=(before+block).length;}catch(e){}
        if(window.__syncMirror)window.__syncMirror();
        window.__render(nt,true);
      }else{
        window.__render(ta?ta.value:(window.__lastText||""),true);
      }
      if(added.length&&window.__flashBadge)window.__flashBadge(added.length);
    }
  }
  /* 파일 선택창에서 고른 File 목록도 드롭과 동일 처리(.md=문서 열기 / 이미지=풀에 추가) */
  window.__ingestFiles=function(fileList){handle(null,Array.prototype.slice.call(fileList||[]));};
  function hasFiles(dt){return dt&&dt.types&&Array.prototype.indexOf.call(dt.types,"Files")>=0;}
  document.addEventListener("dragover",function(e){e.preventDefault();if(hasFiles(e.dataTransfer))document.body.classList.add("drag");});
  document.addEventListener("dragleave",function(e){if(e.relatedTarget===null||(e.clientX<=0&&e.clientY<=0))document.body.classList.remove("drag");});
  /* 에디터(textarea) 위에 드롭했으면 그 지점의 글자 위치(offset)를 구함 → 이미지 참조를 그 자리에 삽입 */
  function dropCaret(x,y){var ta=document.getElementById("editor");if(!ta||!document.body.classList.contains("loaded"))return null;
    try{var cp=document.caretPositionFromPoint&&document.caretPositionFromPoint(x,y);if(cp&&cp.offsetNode===ta)return cp.offset;}catch(e){}
    try{var r=ta.getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return ta.value.length;}catch(e){}  /* 정확한 위치 못 구하면 에디터 영역 안일 때 끝에 삽입 */
    return null;}
  document.addEventListener("drop",function(e){e.preventDefault();document.body.classList.remove("drag");var dt=e.dataTransfer;if(!dt)return;
    var insAt=dropCaret(e.clientX,e.clientY);
    var entries=[],items=dt.items;
    if(items&&items.length&&items[0].webkitGetAsEntry){for(var i=0;i<items.length;i++){var en=items[i].webkitGetAsEntry&&items[i].webkitGetAsEntry();if(en)entries.push(en);}}
    var flat=[];if(dt.files){for(var k=0;k<dt.files.length;k++)flat.push(dt.files[k]);}
    handle(entries,flat,insAt);
  });
})();

/* ===== ZIP 저장: 현재 MD + 풀(window.__drop)의 이미지들을 무압축(store) zip으로 묶어 저장 ===== */
(function(){
  var crcTable=null;
  function crc32(buf){if(!crcTable){crcTable=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}}var crc=0xFFFFFFFF;for(var i=0;i<buf.length;i++)crc=(crcTable[(crc^buf[i])&0xFF]^(crc>>>8))>>>0;return (crc^0xFFFFFFFF)>>>0;}
  function u16(v){return [v&0xFF,(v>>>8)&0xFF];}
  function u32(v){return [v&0xFF,(v>>>8)&0xFF,(v>>>16)&0xFF,(v>>>24)&0xFF];}
  function zipStore(files){
    var enc=new TextEncoder(),local=[],central=[],offset=0;
    for(var i=0;i<files.length;i++){
      var nameB=enc.encode(files[i].name),data=files[i].data,crc=crc32(data),sz=data.length;
      var lh=[].concat(u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(sz),u32(sz),u16(nameB.length),u16(0));
      local.push(new Uint8Array(lh),nameB,data);
      var ch=[].concat(u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(sz),u32(sz),u16(nameB.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset));
      central.push(new Uint8Array(ch),nameB);
      offset+=lh.length+nameB.length+data.length;
    }
    var cSize=0;for(var c1=0;c1<central.length;c1++)cSize+=central[c1].length;
    var eocd=new Uint8Array([].concat(u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cSize),u32(offset),u16(0)));
    var parts=local.concat(central).concat([eocd]),total=0,p;
    for(p=0;p<parts.length;p++)total+=parts[p].length;
    var out=new Uint8Array(total),pos=0;for(p=0;p<parts.length;p++){out.set(parts[p],pos);pos+=parts[p].length;}
    return out;
  }
  function dataUriToBytes(du){var i=String(du).indexOf(",");if(i<0)return null;try{var bin=atob(du.slice(i+1)),u=new Uint8Array(bin.length),k;for(k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);return u;}catch(e){return null;}}
  window.__exportZip=async function(){
    try{
      var ta=document.getElementById("editor");
      var mdText=(ta?ta.value:window.__lastText)||"";
      var mdName=window.__mdName||((window.__fname||"document")+".md");
      var baseName=(window.__fname||mdName.replace(/\.(md|markdown|txt)$/i,"")||"document");
      var files=[{name:mdName,data:new TextEncoder().encode(mdText)}];
      if(window.__drop){for(var k in window.__drop){if(Object.prototype.hasOwnProperty.call(window.__drop,k)){var b=dataUriToBytes(window.__drop[k]);if(b)files.push({name:k,data:b});}}}
      var zip=zipStore(files),zipName=baseName+".zip";
      if(typeof window.NL_PORT!=="undefined"&&window.Neutralino){   /* EXE: 네이티브 저장 다이얼로그 */
        var path=await Neutralino.os.showSaveDialog("ZIP 저장",{defaultPath:zipName,filters:[{name:"ZIP",extensions:["zip"]}]});
        if(!path)return;if(!/\.zip$/i.test(path))path+=".zip";
        await Neutralino.filesystem.writeBinaryFile(path,zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength));
      }else{                                                        /* 브라우저/웹뷰: 앵커 다운로드 */
        var blob=new Blob([zip],{type:"application/zip"}),a=document.createElement("a");
        a.href=URL.createObjectURL(blob);a.download=zipName;document.body.appendChild(a);a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
      }
    }catch(e){try{Neutralino.debug.log("[zip] "+e);}catch(_){}alert("ZIP 저장 중 문제가 발생했습니다.");}
  };
})();

/* ===== 불러온 파일 뱃지 + 팝오버 (문서 + 참조 이미지 상태 + 미참조 드롭 이미지) ===== */
(function(){
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  /* '식별안됨' 이미지 = MD에 ![](이름) 참조가 있으나 못 찾음 → 그 참조를 본문에서 삭제(파일명/경로 basename 일치). */
  function removeRefFromMd(name){
    var ta=document.getElementById("editor");if(!ta)return;
    var re=/!\[[^\]]*\]\(\s*(<[^>]*>|[^()]*(?:\([^)]*\)[^()]*)*)\s*\)/g,changed=false;
    var out=ta.value.replace(re,function(m,dest){
      var d=dest.replace(/^<|>$/g,"").replace(/\s+["'][^"']*["']\s*$/,"").trim();  /* <> 벗기고 제목 제거 */
      try{d=decodeURIComponent(d);}catch(e){}
      var base=d.split(/[\\/]/).pop();
      if(d===name||base===name){changed=true;return "";}
      return m;
    });
    if(!changed)return;
    out=out.replace(/\n{3,}/g,"\n\n");  /* 참조만 있던 줄이 비면서 생긴 과한 빈 줄 정리 */
    ta.value=out;
    if(window.__syncMirror)window.__syncMirror();
    if(typeof window.__render==="function")window.__render(out,true);
  }
  var badge=document.getElementById("fileBadge"),num=document.getElementById("fileBadgeN"),pop=document.getElementById("filePop");
  function build(){
    var md=window.__mdName||(window.__fname?window.__fname+".md":null),imgs=window.__imgFiles||[];
    if(num)num.textContent=String((md?1:0)+imgs.length);
    var anyMissing=false;for(var mi=0;mi<imgs.length;mi++){if(imgs[mi].status==="missing"){anyMissing=true;break;}}
    if(badge)badge.classList.toggle("has-missing",anyMissing);
    if(!pop)return;
    var h="<button type='button' class='fp-close' title='닫기' aria-label='닫기'>✕</button><div class='fp-h fp-h-top'><span>불러온 파일</span><button type='button' class='fp-zip-btn' title='MD와 이미지를 ZIP으로 묶어 저장'>ZIP 저장</button></div>";
    if(md)h+="<div class='fp-row'><span class='fp-ico'>📄</span><span class='fp-name' title='"+esc(md)+"'>"+esc(md)+"</span></div>";
    if(imgs.length){
      h+="<div class='fp-sec'><div class='fp-h'>이미지 ("+imgs.length+")</div>";
      for(var i=0;i<imgs.length;i++){var f=imgs[i],
        st=f.status==="ok"?["st-ok","✓ 사용중"]:f.status==="missing"?["st-bad","✗ 식별안됨"]:["st-ok","● 사용가능"],
        inPool=window.__drop&&Object.prototype.hasOwnProperty.call(window.__drop,f.name),
        act=f.status==="missing"?"<button class='fp-rm-btn' type='button' data-rm='"+esc(f.name)+"' title='MD에서 이 이미지 참조를 삭제: "+esc(f.name)+"'>참조 삭제</button>":"<button class='fp-ins-btn' type='button' data-ins='"+esc(f.name)+"' title='커서 위치에 삽입: "+esc(f.name)+"'>삽입</button>";
        h+="<div class='fp-row' title='"+esc(f.name)+"'><span class='fp-ico'>🖼️</span><span class='fp-name'>"+esc(f.name)+"</span><span class='fp-st "+st[0]+"'>"+st[1]+"</span>"+act+(inPool?"<button class='fp-del-btn' type='button' data-del='"+esc(f.name)+"' title='목록에서 제거: "+esc(f.name)+"' aria-label='삭제'>✕</button>":"<span class='fp-del-ph'></span>")+"</div>";}
      h+="</div>";
    }else h+="<div class='fp-sec'><div class='fp-empty'>참조된 이미지 없음</div></div>";
    if(anyMissing)h+="<div class='fp-hint'>식별 안 된 이미지가 있어요. <b>‘MD 파일 열기’</b>로 이미지를 넣거나, <b>이미지</b>(또는 폴더째) 끌어다 놓으면 표시됩니다.</div>";
    pop.innerHTML=h;
  }
  window.__renderFileBadge=build;
  function close(){if(pop)pop.hidden=true;if(badge)badge.classList.remove("on");}
  /* 배지 클릭 = 토글(열려 있으면 닫기, 닫혀 있으면 내용 갱신 후 열기). */
  if(badge)badge.addEventListener("click",function(e){e.stopPropagation();if(pop.hidden){build();pop.hidden=false;badge.classList.add("on");}else{close();}});
  /* 이미지 추가 알림: 배지 초록 깜빡 + 옆에 잠깐 뜨는 툴팁 */
  window.__flashBadge=function(n){
    if(!badge)return;
    badge.classList.remove("flash-added");void badge.offsetWidth;badge.classList.add("flash-added");
    setTimeout(function(){badge.classList.remove("flash-added");},3600);
    var editor=document.getElementById("editorPane");if(!editor)return;
    var t=document.getElementById("fbToast");
    if(!t){t=document.createElement("div");t.id="fbToast";editor.appendChild(t);}
    t.textContent=(n>1?("이미지 "+n+"개가 추가되었습니다"):"이미지가 추가되었습니다");
    t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
    clearTimeout(t.__tmr);t.__tmr=setTimeout(function(){t.classList.remove("show");},1900);
  };
  /* 팝오버 클릭: X = 닫기 / '삽입' = 참조 삽입(닫지 않음 → 여러 번 연속 삽입 가능) */
  if(pop)pop.addEventListener("click",function(e){
    if(e.target.closest&&e.target.closest(".fp-close")){close();return;}
    if(e.target.closest&&e.target.closest(".fp-zip-btn")){if(window.__exportZip)window.__exportZip();return;}
    var del=e.target.closest&&e.target.closest(".fp-del-btn");
    if(del){var dn=del.getAttribute("data-del");if(dn&&window.__drop)delete window.__drop[dn];  /* 풀에서 제거 → 재렌더로 목록/상태 갱신(팝오버는 열린 채) */
      var cur=document.getElementById("editor");if(typeof window.__render==="function")window.__render(cur?cur.value:(window.__lastText||""),true);else if(window.__renderFileBadge)window.__renderFileBadge();return;}
    var rm=e.target.closest&&e.target.closest(".fp-rm-btn");
    if(rm){var rn=rm.getAttribute("data-rm");if(rn)removeRefFromMd(rn);return;}
    var btn=e.target.closest&&e.target.closest(".fp-ins-btn");if(!btn)return;var name=btn.getAttribute("data-ins");if(!name)return;
    var alt=name.replace(/\.[a-z0-9]+$/i,"");var dest=/\s/.test(name)?"<"+name+">":name;  /* 공백 포함 파일명은 <>로 감싸야 마크다운이 인식 */
    if(window.__img&&window.__img.insert)window.__img.insert("!["+alt+"]("+dest+")");});
})();
/* ===== 문서 설정: 테마 색(프리셋/커스텀)·본문 폰트·기준 크기·기억 (미리보기 + .docx 공통) ===== */
(function(){
  var THEMES=[
    {n:"로열 퍼플",b:"#4c1d95",a:"#7c3aed"},{n:"오션 틸",b:"#0f4c5c",a:"#0891b2"},
    {n:"포레스트",b:"#14532d",a:"#16a34a"},{n:"버건디",b:"#7f1d1d",a:"#dc2626"},
    {n:"네이비",b:"#1e3a5f",a:"#2563eb"},{n:"차콜 오렌지",b:"#1f2937",a:"#ea580c"},
    {n:"인디고 로즈",b:"#312e81",a:"#e11d48"},{n:"브론즈 골드",b:"#713f12",a:"#d97706"}
  ];
  var FONTS={
    malgun:{css:'"Malgun Gothic","맑은 고딕","Segoe UI",sans-serif',docx:"맑은 고딕"},
    noto:{css:'"Noto Sans KR","Malgun Gothic",sans-serif',docx:"Noto Sans KR"},
    nanum:{css:'"NanumGothic","나눔고딕","Malgun Gothic",sans-serif',docx:"나눔고딕"},
    batang:{css:'"Batang","바탕",serif',docx:"바탕"}
  };
  var DEF={brand:"#1d4ed8",accent:"#2563eb"};   /* 저장값 없을 때 = 현재 기본 파랑 */
  var $=function(id){return document.getElementById(id);};
  var trigger=$("btnDocSettings"),modal=$("themeModal"),grid=$("tm-grid");
  if(!trigger||!modal||!grid)return;
  var colorInput=$("tmColor"),hexOut=$("tmHex"),applyBtn=$("tmApply"),swEl=$("tmSw"),customRow=$("tmCustom"),
      fontSel=$("tmFont"),sizeInp=$("tmSize"),sizeVal=$("tmSizeVal"),rememberInp=$("tmRemember"),closeBtn=$("tmClose");
  var R=document.documentElement.style;
  var state={mode:"default",i:4,hex:null,sizePx:14,font:"noto"},remember=true,pendingHex=null;
  function hexToRgb(h){h=(h||"").replace("#","");if(h.length===3)h=h.split("").map(function(c){return c+c;}).join("");return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
  function toHex(r,g,b){return "#"+[r,g,b].map(function(x){return ("0"+Math.max(0,Math.min(255,Math.round(x))).toString(16)).slice(-2);}).join("");}
  function darkOf(hex){var c=hexToRgb(hex);return toHex(c[0]*0.55,c[1]*0.55,c[2]*0.55);}   /* 강조색 → 진한 브랜드색 파생 */
  function curColors(){
    if(state.mode==="custom"&&/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(state.hex||""))return {brand:darkOf(state.hex),accent:state.hex};
    if(state.mode==="preset"){var t=THEMES[state.i]||THEMES[4];return {brand:t.b,accent:t.a};}
    return {brand:DEF.brand,accent:DEF.accent};
  }
  function apply(){   /* CSS 변수 반영 + __docSettings 갱신(.docx 브리지용) */
    var c=curColors();
    R.setProperty("--brand",c.brand);R.setProperty("--accent",c.accent);
    R.setProperty("--doc-size",state.sizePx+"px");R.setProperty("--doc-font",FONTS[state.font].css);
    window.__docSettings=Object.assign(window.__docSettings||{},{brand:c.brand,accent:c.accent,sizePx:state.sizePx,font:{css:FONTS[state.font].css,docx:FONTS[state.font].docx}});
  }
  function rerender(){if(typeof window.__render==="function"){var ta=$("editor");window.__render(ta?ta.value:"",true);}}
  function persist(){if(!remember)return;try{
    localStorage.setItem("mdocify_theme",state.mode);
    if(state.mode==="custom")localStorage.setItem("mdocify_custom",state.hex||"");else localStorage.removeItem("mdocify_custom");
    localStorage.setItem("mdocify_preset",String(state.i));
    localStorage.setItem("mdocify_size",String(state.sizePx));
    localStorage.setItem("mdocify_font",state.font);
  }catch(e){}}
  function mark(){
    Array.prototype.forEach.call(grid.children,function(c,j){c.classList.toggle("active",state.mode==="preset"&&j===state.i);});
    if(customRow)customRow.classList.toggle("active",state.mode==="custom");
  }
  function commit(){apply();mark();persist();rerender();}
  THEMES.forEach(function(t,i){var b=document.createElement("button");b.type="button";
    b.innerHTML="<span class='sw' style=\"background:linear-gradient(135deg,"+t.b+" 0 50%,"+t.a+" 50%)\"></span><span>"+t.n+"</span>";
    b.addEventListener("click",function(){state.mode="preset";state.i=i;state.hex=null;commit();});grid.appendChild(b);});
  function updateSw(){if(swEl&&colorInput){var a=colorInput.value;swEl.style.background="linear-gradient(135deg,"+darkOf(a)+" 0 50%,"+a+" 50%)";}}
  if(colorInput){var onPick=function(){pendingHex=colorInput.value;if(hexOut)hexOut.textContent=colorInput.value.toUpperCase();updateSw();};colorInput.addEventListener("input",onPick);colorInput.addEventListener("change",onPick);}
  if(applyBtn)applyBtn.addEventListener("click",function(){var hex=pendingHex||(colorInput?colorInput.value:null);if(!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex||""))return;state.mode="custom";state.hex=hex;commit();});
  if(fontSel)fontSel.addEventListener("change",function(){if(FONTS[fontSel.value]){state.font=fontSel.value;commit();}});
  if(sizeInp){sizeInp.addEventListener("input",function(){state.sizePx=+sizeInp.value;if(sizeVal)sizeVal.textContent=state.sizePx+"px";apply();});sizeInp.addEventListener("change",function(){persist();rerender();});}
  if(rememberInp)rememberInp.addEventListener("change",function(){remember=rememberInp.checked;try{localStorage.setItem("mdocify_remember",remember?"1":"0");}catch(e){}if(remember)persist();else try{["mdocify_theme","mdocify_custom","mdocify_preset","mdocify_size","mdocify_font"].forEach(function(k){localStorage.removeItem(k);});}catch(e){}});
  function syncControls(){var c=curColors();
    if(colorInput)colorInput.value=(state.mode==="custom"&&state.hex)?state.hex:c.accent;
    if(hexOut)hexOut.textContent=(colorInput?colorInput.value:c.accent).toUpperCase();
    pendingHex=state.mode==="custom"?state.hex:null;updateSw();
    if(fontSel)fontSel.value=state.font;
    if(sizeInp)sizeInp.value=state.sizePx;if(sizeVal)sizeVal.textContent=state.sizePx+"px";
    if(rememberInp)rememberInp.checked=remember;mark();}
  function openModal(){syncControls();modal.hidden=false;var r=trigger.getBoundingClientRect();var card=modal.firstElementChild,w=card?card.offsetWidth:320;var left=Math.max(8,Math.min(r.left,window.innerWidth-w-8));var top=r.bottom+6;modal.style.top=top+"px";modal.style.left=left+"px";if(card){card.style.maxHeight=(window.innerHeight-top-12)+"px";}}
  function closeModal(){modal.hidden=true;}
  trigger.addEventListener("click",function(e){e.stopPropagation();modal.hidden?openModal():closeModal();});
  document.addEventListener("click",function(e){if(!modal.hidden&&!modal.contains(e.target)&&e.target!==trigger&&!trigger.contains(e.target))closeModal();});
  if(closeBtn)closeBtn.addEventListener("click",closeModal);
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!modal.hidden)closeModal();});
  (function load(){var rm=null;try{rm=localStorage.getItem("mdocify_remember");}catch(e){}remember=rm===null?true:rm==="1";
    if(remember)try{
      var th=localStorage.getItem("mdocify_theme"),cu=localStorage.getItem("mdocify_custom"),pi=localStorage.getItem("mdocify_preset"),sz=localStorage.getItem("mdocify_size"),ft=localStorage.getItem("mdocify_font");
      if(th==="custom"&&cu){state.mode="custom";state.hex=cu;}else if(th==="preset"&&pi!==null&&THEMES[+pi]){state.mode="preset";state.i=+pi;}
      if(sz&&+sz>=11&&+sz<=18)state.sizePx=+sz;if(ft&&FONTS[ft])state.font=ft;
    }catch(e){}
    apply();   /* 초기 반영(재렌더는 문서 로드 시 자연 발생) */
  })();
})();

/* ===== 쪽 바닥글(Footer): 미리보기(Paged.js @bottom-center) + .docx 공통 =====
   설정 기억('mdocify_remember')이 켜져 있을 때만 저장. 컨트롤 변경 시 상태갱신→저장(게이트)→재주입(applyFooter)→docx 설정 반영. */
(function(){
  function remember(){try{var r=localStorage.getItem("mdocify_remember");return r===null?true:r==="1";}catch(e){return true;}}
  function save(k,v){if(!remember())return;try{localStorage.setItem(k,v);}catch(e){}}
  var FOOT={on:true,text:"Page {pageNumber} / {totalPages}",align:"center",border:true};
  function loadFooter(){try{var o=localStorage.getItem("mdocify_footer_on");if(o!==null)FOOT.on=(o==="1");var t=localStorage.getItem("mdocify_footer_text");if(t!==null)FOOT.text=t;var a=localStorage.getItem("mdocify_footer_align");if(a)FOOT.align=a;var b=localStorage.getItem("mdocify_footer_border");if(b!==null)FOOT.border=(b==="1");}catch(e){}}
  function saveFooter(){save("mdocify_footer_on",FOOT.on?"1":"0");save("mdocify_footer_text",FOOT.text);save("mdocify_footer_align",FOOT.align);save("mdocify_footer_border",FOOT.border?"1":"0");}
  function syncDocx(){window.__docSettings=window.__docSettings||{};window.__docSettings.footer={on:FOOT.on,text:FOOT.text,align:FOOT.align,border:FOOT.border};}
  window.applyFooter=function(){var pages=document.querySelectorAll("#pages .pagedjs_page");var content=[];pages.forEach(function(pg){var mc=pg.querySelector(".pagedjs_margin-bottom-center .pagedjs_margin-content");if(mc){mc.textContent="";mc.style.borderTop="";mc.style.paddingTop="";}if(!mc||pg.querySelector(".cover"))return;var body=pg.querySelector(".pagedjs_page_content");var has=body&&(body.textContent.trim().length>0||body.querySelector("img,svg,table,hr,figure"));if(!has)return;content.push(mc);});if(!FOOT.on)return;var total=content.length;content.forEach(function(mc,i){mc.textContent=String(FOOT.text).replace(/\{pageNumber\}/g,i+1).replace(/\{totalPages\}/g,total);mc.style.justifyContent=(FOOT.align==="left"?"flex-start":(FOOT.align==="right"?"flex-end":"center"));if(FOOT.border){mc.style.borderTop="1px solid #cbd5e1";mc.style.paddingTop="5px";}});};
  loadFooter();syncDocx();
  var on=document.getElementById("tmFooter"),txt=document.getElementById("tmFooterText"),al=document.getElementById("tmFooterAlign"),bd=document.getElementById("tmFooterBorder"),body=document.getElementById("tmFooterBody");
  function sync(){if(on)on.checked=FOOT.on;if(txt)txt.value=FOOT.text;if(al)al.value=FOOT.align;if(bd)bd.checked=FOOT.border;if(body)body.classList.toggle("off",!FOOT.on);}
  function changed(){if(on)FOOT.on=on.checked;if(txt)FOOT.text=txt.value;if(al)FOOT.align=al.value;if(bd)FOOT.border=bd.checked;if(body)body.classList.toggle("off",!FOOT.on);saveFooter();syncDocx();window.applyFooter();}
  sync();
  [on,al,bd].forEach(function(el){if(el)el.addEventListener("change",changed);});
  if(txt)txt.addEventListener("input",changed);
})();

/* ===== 쪽 머리말(Header): footer 와 대칭. 미리보기(Paged.js @top-center) + .docx 공통. 변수 {pageNumber} {totalPages} {title}. 기본 off. ===== */
(function(){
  function remember(){try{var r=localStorage.getItem("mdocify_remember");return r===null?true:r==="1";}catch(e){return true;}}
  function save(k,v){if(!remember())return;try{localStorage.setItem(k,v);}catch(e){}}
  var HEAD={on:false,text:"{title}",align:"center",border:true};
  function loadHeader(){try{var o=localStorage.getItem("mdocify_header_on");if(o!==null)HEAD.on=(o==="1");var t=localStorage.getItem("mdocify_header_text");if(t!==null)HEAD.text=t;var a=localStorage.getItem("mdocify_header_align");if(a)HEAD.align=a;var b=localStorage.getItem("mdocify_header_border");if(b!==null)HEAD.border=(b==="1");}catch(e){}}
  function saveHeader(){save("mdocify_header_on",HEAD.on?"1":"0");save("mdocify_header_text",HEAD.text);save("mdocify_header_align",HEAD.align);save("mdocify_header_border",HEAD.border?"1":"0");}
  function syncDocx(){window.__docSettings=window.__docSettings||{};window.__docSettings.header={on:HEAD.on,text:HEAD.text,align:HEAD.align,border:HEAD.border};}
  window.applyHeader=function(){var pages=document.querySelectorAll("#pages .pagedjs_page");var content=[];pages.forEach(function(pg){var mc=pg.querySelector(".pagedjs_margin-top-center .pagedjs_margin-content");if(mc){mc.textContent="";mc.style.borderBottom="";mc.style.paddingBottom="";}if(!mc||pg.querySelector(".cover"))return;var body=pg.querySelector(".pagedjs_page_content");var has=body&&(body.textContent.trim().length>0||body.querySelector("img,svg,table,hr,figure"));if(!has)return;content.push(mc);});if(!HEAD.on)return;var total=content.length,title=(window.__fname||"document");content.forEach(function(mc,i){mc.textContent=String(HEAD.text).replace(/\{pageNumber\}/g,i+1).replace(/\{totalPages\}/g,total).replace(/\{title\}/g,title);mc.style.justifyContent=(HEAD.align==="left"?"flex-start":(HEAD.align==="right"?"flex-end":"center"));if(HEAD.border){mc.style.borderBottom="1px solid #cbd5e1";mc.style.paddingBottom="5px";}});};
  loadHeader();syncDocx();
  var on=document.getElementById("tmHeader"),txt=document.getElementById("tmHeaderText"),al=document.getElementById("tmHeaderAlign"),bd=document.getElementById("tmHeaderBorder"),body=document.getElementById("tmHeaderBody");
  function sync(){if(on)on.checked=HEAD.on;if(txt)txt.value=HEAD.text;if(al)al.value=HEAD.align;if(bd)bd.checked=HEAD.border;if(body)body.classList.toggle("off",!HEAD.on);}
  function changed(){if(on)HEAD.on=on.checked;if(txt)HEAD.text=txt.value;if(al)HEAD.align=al.value;if(bd)HEAD.border=bd.checked;if(body)body.classList.toggle("off",!HEAD.on);saveHeader();syncDocx();window.applyHeader();}
  sync();
  [on,al,bd].forEach(function(el){if(el)el.addEventListener("change",changed);});
  if(txt)txt.addEventListener("input",changed);
})();
