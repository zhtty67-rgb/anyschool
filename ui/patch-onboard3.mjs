// 给引导条加 localStorage 记忆 + 顶部手动回看入口
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let s = readFileSync(F, 'utf8');
const done = [];

// 1) 顶部加"新手引导"回看链接
if (!s.includes('data-act="onboard-show"')) {
  const topAnchor = '<div class="src">数据源：<b>${esc(snap.label)}</b></div>';
  const replacement =
    '<div class="src">数据源：<b>${esc(snap.label)}</b>' +
    '<a class="onboard-link" href="javascript:void 0" data-act="onboard-show">新手引导</a></div>';
  if (s.includes(topAnchor)) {
    s = s.replace(topAnchor, replacement);
    done.push('顶部回看链接');
  }

  // 客户端渲染里也有同一个头部
  const topAnchorClient = '\'<div class="src">数据源：<b>\'+esc(snap.label)+\'</b></div>\'';
  const replacementClient =
    '\'<div class="src">数据源：<b>\'+esc(snap.label)+\'</b><a class="onboard-link" href="javascript:void 0" data-act="onboard-show">新手引导</a></div>\'';
  if (s.includes(topAnchorClient)) {
    s = s.replace(topAnchorClient, replacementClient);
    done.push('客户端回看链接');
  }
}

// 2) 引导条默认隐藏（如果标记为已看过）
if (!s.includes('onboardHidden')) {
  const pageAnchor = '  const onboard = renderOnboarding(snap.startNode, snap.stats);';
  if (s.includes(pageAnchor)) {
    s = s.replace(
      pageAnchor,
      '  // 看过就默认收起；给一段内联脚本在渲染前判断，避免闪一下再消失\n' +
      '  const onboard = renderOnboarding(snap.startNode, snap.stats).replace(\'class="onboard" id="onboard"\', \'class="onboard" id="onboard" data-default-collapsed="1"\');'
    );
    done.push('引导条加收起标记');
  }
}

// 3) 客户端：进页面先按 localStorage 决定显示与否；点回看重新展开
if (!s.includes("act==='onboard-show'")) {
  const clientAnchor = "    if(act==='onboard-dismiss'){var ob=document.getElementById('onboard');if(ob)ob.remove();return}";
  const newClient =
    "    if(act==='onboard-dismiss'){var ob=document.getElementById('onboard');if(ob)ob.remove();try{localStorage.setItem('anylearn.onboarded','1')}catch(e){};return}\n" +
    "    if(act==='onboard-show'){\n" +
    "      var old=document.getElementById('onboard');if(old)old.remove();\n" +
    "      view='tree';activeNode=null;paint();\n" +
    "      var fresh=document.getElementById('onboard');\n" +
    "      if(fresh){fresh.style.display='';}\n" +
    "      try{localStorage.removeItem('anylearn.onboarded')}catch(e){}\n" +
    "      return;\n" +
    "    }";
  if (s.includes(clientAnchor)) {
    s = s.replace(clientAnchor, newClient);
    done.push('客户端按钮逻辑');
  }
}

// 4) paint 之后按标记决定是否显示
if (!s.includes('applyOnboardState')) {
  const paintAnchor = "  paint();\n})();";
  const insertion =
    "  function applyOnboardState(){\n" +
    "    var ob=document.getElementById('onboard');\n" +
    "    if(!ob) return;\n" +
    "    var seen=false;\n" +
    "    try{seen=localStorage.getItem('anylearn.onboarded')==='1'}catch(e){}\n" +
    "    ob.style.display = seen ? 'none' : '';\n" +
    "  }\n\n" +
    "  var __paint=paint;\n" +
    "  paint=function(){ __paint(); applyOnboardState(); };\n\n" +
    "  paint();\n})();";
  if (s.includes(paintAnchor)) {
    s = s.replace(paintAnchor, insertion);
    done.push('渲染后应用状态');
  }
}

// 5) 回看链接样式
if (!s.includes('.onboard-link{')) {
  s = s.replace('.onboard-foot{font-size:12px;color:#7a849c}', '.onboard-foot{font-size:12px;color:#7a849c}');
  const cssAnchor = 'const CSS = ONBOARD_CSS + `';
  s = s.replace(cssAnchor, cssAnchor + '\n.onboard-link{margin-left:12px;font-size:12px;color:#3b6df6;text-decoration:none;border-bottom:1px dashed #b9cdfc}\n.onboard-link:hover{color:#2b4c9b}');
  done.push('回看链接样式');
}

writeFileSync(F, s, 'utf8');
console.log(done.length ? `已改：${done.join('、')}` : '无变化（已是最新）');
