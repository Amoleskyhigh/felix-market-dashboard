/* ===== Enhanced Market Dashboard V2 — UI & Features ===== */

// ===== UPDATE ALLOC (main render) =====
function updateAlloc(){
    const sc=computeScores();if(!sc)return;
    const{trend,trendRaw,trendScore,K,ma200,dd,emotionScore,emoVix,emoFg,emoOas,vix,fg,oas,pe,stockTarget,stockCap,spx}=sc;
    const fund=parseFloat(document.getElementById('fund-input').value)||0;
    const qld=Math.round(Math.max(0,(stockTarget-40)*0.35));
    const qqq=Math.round(stockTarget-qld);const cash=Math.max(0,100-qld-qqq);
    const zone=quadrantZone(trendScore,emotionScore);

    // Action Banner
    const banner=document.getElementById('action-banner');
    banner.querySelector('.banner-zone').textContent=`Today: ${zone.name}`;
    banner.querySelector('.banner-zone').style.color=zone.color;
    document.getElementById('banner-detail').textContent=`${zone.action} | Suggested: ${zone.band} stocks`;
    document.getElementById('banner-alloc').textContent=stockTarget+'%';
    banner.className='action-banner'+(stockTarget<=40||stockTarget>=65?' pulse':'');

    // Alloc result
    document.getElementById('alloc-result-area').innerHTML=
        `<div style="text-align:center;margin-bottom:10px">趨勢軸 <b>${trendScore.toFixed(1)}</b> ｜ 情緒軸 <b>${emotionScore}</b> ｜ 股票目標 <b style="color:var(--accent);font-size:26px">${stockTarget}%</b></div>`+
        `<div style="text-align:center;margin-bottom:10px;font-size:12px;color:var(--text-dim)">PE護欄上限: ${stockCap===100?'無上限':stockCap+'%'}（上線設定 70%）</div>`+
        `<div class="alloc-bar"><div class="alloc-item" style="width:${qld}%;background:#f44336">QLD ${qld}%</div><div class="alloc-item" style="width:${qqq}%;background:var(--accent)">QQQ ${qqq}%</div><div class="alloc-item" style="width:${cash}%;background:var(--green)">現金 ${cash}%</div></div>`+
        `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;font-size:14px"><div>QLD: <b>$${(fund*qld/100).toLocaleString()}</b></div><div>QQQ: <b>$${(fund*qqq/100).toLocaleString()}</b></div><div>現金: <b>$${(fund*cash/100).toLocaleString()}</b></div></div>`;

    // Scoring display
    document.getElementById('trend-total').textContent=trendScore.toFixed(1)+' / 8';
    document.getElementById('trend-sub').textContent=`原始 ${trendRaw}/8 × K=${K.toFixed(1)}`;
    document.getElementById('emotion-total').textContent=emotionScore+' / 9';
    document.getElementById('trend-rows').innerHTML=
        `<tr><td>Copper vs MA3</td><td>${gData.copper?.currentPrice?'$'+gData.copper.currentPrice.toFixed(3):'--'}</td><td>${trend.copper>=0?'+':''}${trend.copper}</td></tr>`+
        `<tr><td>10Y Yield vs MA20</td><td>${gData.tnx?.currentPrice?gData.tnx.currentPrice.toFixed(2)+'%':'--'}</td><td>${trend.tnx>=0?'+':''}${trend.tnx}</td></tr>`+
        `<tr><td>DXY vs MA20</td><td>${gData.dxy?.currentPrice?gData.dxy.currentPrice.toFixed(1):'--'}</td><td>${trend.dxy>=0?'+':''}${trend.dxy}</td></tr>`+
        `<tr><td>市場廣度</td><td>${gData.breadth?.value?gData.breadth.value.toFixed(1)+'%':'--'}</td><td>${trend.breadth>=0?'+':''}${trend.breadth}</td></tr>`;
    document.getElementById('emotion-rows').innerHTML=
        `<tr><td>VIX</td><td>${vix?.toFixed?vix.toFixed(1):'--'}</td><td>${emoVix>=0?'+':''}${emoVix}</td></tr>`+
        `<tr><td>Fear & Greed</td><td>${fg}</td><td>${emoFg>=0?'+':''}${emoFg}</td></tr>`+
        `<tr><td>HY OAS</td><td>${Math.round(oas)}bp</td><td>${emoOas>=0?'+':''}${emoOas}</td></tr>`;
    document.getElementById('k-value').textContent=K.toFixed(1);
    document.getElementById('k-note').textContent=ma200?`SPX vs MA200\nSPX ${spx.currentPrice.toFixed(1)} vs MA200 ${ma200.toFixed(1)} (${(dd*100).toFixed(1)}%)`:'MA200 資料不足';

    renderQuadrant(trendScore,emotionScore);
    updatePortfolioGap();
    checkConvergence();
    updateRegimeLog(trendScore,emotionScore,zone);
    saveScoreHistory(trendScore,emotionScore,stockTarget);
}

// ===== QUADRANT CHART =====
const quadrantBgPlugin={id:'qbg',beforeDraw(chart){const{ctx,chartArea:a,scales:s}=chart;if(!a)return;
    const xC=s.x.getPixelForValue(4),yC=s.y.getPixelForValue(2);ctx.save();
    ctx.fillStyle='rgba(255,214,102,0.08)';ctx.fillRect(a.left,a.top,xC-a.left,yC-a.top);
    ctx.fillStyle='rgba(76,175,80,0.10)';ctx.fillRect(xC,a.top,a.right-xC,yC-a.top);
    ctx.fillStyle='rgba(244,67,54,0.08)';ctx.fillRect(a.left,yC,xC-a.left,a.bottom-yC);
    ctx.fillStyle='rgba(255,152,0,0.08)';ctx.fillRect(xC,yC,a.right-xC,a.bottom-yC);ctx.restore();}};

function renderQuadrant(ts,es){
    const today=new Date().toISOString().slice(0,10);
    let hist=lsGet(QKEY,[]).filter(x=>x&&x.date&&Number.isFinite(x.x));
    if(!hist.length||hist[hist.length-1].date!==today)hist.push({date:today,x:ts,y:es});
    else hist[hist.length-1]={date:today,x:ts,y:es};
    hist=hist.slice(-10);lsSet(QKEY,hist);
    const zone=quadrantZone(ts,es);
    document.getElementById('quadrant-note').textContent=`今日位置：${zone.name}（趨勢=${ts.toFixed(1)}, 情緒=${es}）｜建議 ${zone.band}`;
    const ctx=document.getElementById('chart-quadrant');if(!ctx)return;
    if(quadrantChart)quadrantChart.destroy();
    const lineData=hist.map(p=>({x:p.x,y:p.y}));
    quadrantChart=new Chart(ctx,{type:'scatter',data:{datasets:[
        {type:'line',data:lineData,borderColor:'rgba(144,202,249,0.6)',borderWidth:2,pointRadius:4,pointBackgroundColor:hist.map((_,i)=>i===hist.length-1?'#4fc3f7':'rgba(144,202,249,0.5)'),pointBorderColor:hist.map((_,i)=>i===hist.length-1?'#fff':'transparent'),pointBorderWidth:hist.map((_,i)=>i===hist.length-1?2:0),fill:false,tension:0.15,
         pointRadius:hist.map((_,i)=>i===hist.length-1?10:4)},
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(_,{dataIndex:i})=>`${hist[i]?.date}: T=${hist[i]?.x?.toFixed(1)}, E=${hist[i]?.y}`}}},
        scales:{x:{min:0,max:8,title:{display:true,text:'趨勢軸',color:'var(--text-dim)'},grid:{color:'rgba(255,255,255,0.05)'}},
                y:{min:-2,max:10,title:{display:true,text:'情緒軸',color:'var(--text-dim)'},grid:{color:'rgba(255,255,255,0.05)'}}}},
    plugins:[quadrantBgPlugin]});
}

// ===== CHARTS =====
function renderCharts(){
    const d=gData;
    if(d.qqq)draw('chart-qqq',d.qqq,'#4fc3f7','QQQ',[]);
    if(d.shiller){const pd={timestamps:d.shiller.history.map(h=>new Date(h.date).getTime()),closes:d.shiller.history.map(h=>h.value)};draw('chart-pe',pd,'#ff9800','Shiller PE',[AI_MEAN,AI_MEAN+AI_SD,AI_MEAN+2*AI_SD]);}
    if(d.smh)draw('chart-smh',d.smh,'#ce93d8','SMH',[]);
    if(d.vix)draw('chart-vix',d.vix,'#f44336','VIX',[25,15]);
    if(d.dxy)draw('chart-dxy',d.dxy,'#81c784','DXY',[],[{period:20,color:'#90caf9',label:'MA20'}]);
    if(d.tnx)draw('chart-tnx',d.tnx,'#ffd54f','Yield',[4.5,3.5],[{period:20,color:'#90caf9',label:'MA20'}]);
    if(d.copper)draw('chart-hg',d.copper,'#ff7043','Copper',[],[{period:3,color:'#90caf9',label:'MA3'}]);
}
function draw(id,data,color,label,lines,maDefs=[]){
    if(!data?.timestamps)return;
    const datasets=[{label,data:data.closes,borderColor:color,borderWidth:1.5,pointRadius:0,fill:false}];
    lines.forEach(val=>datasets.push({label:'Ref',data:data.closes.map(()=>val),borderColor:'rgba(255,255,255,0.15)',borderDash:[5,5],pointRadius:0,fill:false,borderWidth:1}));
    maDefs.forEach(def=>datasets.push({label:def.label||`MA${def.period}`,data:movingAverage(data.closes,def.period),borderColor:def.color||'#90caf9',borderWidth:1.2,pointRadius:0,borderDash:[4,3],fill:false}));
    new Chart(document.getElementById(id),{type:'line',data:{labels:data.timestamps.map(t=>new Date(t)),datasets},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'var(--text-dim)',font:{size:10}}}},
        scales:{x:{type:'time',ticks:{maxTicksLimit:5,color:'var(--text-dim)'},grid:{color:'rgba(255,255,255,0.04)'}},y:{ticks:{color:'var(--text-dim)'},grid:{color:'rgba(255,255,255,0.04)'}}}}});
}

// ===== MTD =====
function mtdOf(asset){if(!asset?.timestamps?.length||!asset?.closes?.length)return null;const n=asset.timestamps.length;const latest=asset.closes[n-1];const ld=new Date(asset.timestamps[n-1]);let first=null;for(let i=0;i<n;i++){const d=new Date(asset.timestamps[i]);if(d.getMonth()===ld.getMonth()&&d.getFullYear()===ld.getFullYear()){first=asset.closes[i];break;}}if(!first||!latest)return null;return((latest-first)/first)*100;}
function renderMTD(){
    const items=['qqq','smh','spy','boxx','qld'];
    document.getElementById('mtd-box').innerHTML=items.map(k=>{
        const v=mtdOf(gData[k]);const txt=v==null?'--':`${v>=0?'+':''}${v.toFixed(2)}%`;
        const cls=v==null?'':(v>=0?'up':'down');
        return `<div class="mtd-item"><span>${k.toUpperCase()}</span><b class="${cls}">${txt}</b></div>`;
    }).join('');
}

// ===== CONVERGENCE ALERTS =====
function checkConvergence(){
    const checks=[
        {name:'VIX',cur:gData.vix?.currentPrice,prev:gData.vix?.previousClose,polarity:false},
        {name:'Breadth',cur:gData.breadth?.value,prev:null,polarity:true},
        {name:'10Y',cur:gData.tnx?.currentPrice,prev:gData.tnx?.previousClose,polarity:false},
        {name:'F&G',cur:gData.fearGreed?.score,prev:null,polarity:true},
        {name:'DXY',cur:gData.dxy?.currentPrice,prev:gData.dxy?.previousClose,polarity:false},
    ];
    let improving=[], deteriorating=[];
    checks.forEach(c=>{if(c.cur==null||c.prev==null)return;const d=c.cur-c.prev;
        if(Math.abs(d)<0.001)return;
        const good=c.polarity?(d>0):(d<0);
        (good?improving:deteriorating).push(c.name+(d>0?'↑':'↓'));});
    const el=document.getElementById('convergence-alert');
    if(deteriorating.length>=3){el.classList.remove('hidden');document.getElementById('conv-text').textContent=`Convergence Alert: ${deteriorating.join(', ')} — Multiple defensive signals detected`;}
    else if(improving.length>=3){el.classList.remove('hidden');el.style.borderColor='rgba(0,230,118,0.4)';el.style.background='rgba(0,230,118,0.06)';document.getElementById('conv-text').style.color='var(--green)';document.getElementById('conv-text').textContent=`Convergence: ${improving.join(', ')} — Multiple bullish signals`;}
    else{el.classList.add('hidden');}
}

// ===== REGIME CHANGE LOG =====
function updateRegimeLog(ts,es,zone){
    const today=new Date().toISOString().slice(0,10);
    const prev=lsGet(SIGKEY,{});const log=lsGet(RKEY,[]);
    const curZone=zone.name;
    if(prev.zone&&prev.zone!==curZone)log.push({date:today,event:`Zone: ${prev.zone} → ${curZone}`});
    // Check individual signal changes
    const sigs={vix:gData.vix?.currentPrice>25?'buy':gData.vix?.currentPrice<15?'hot':'normal',
        fg:gData.fearGreed?.score>70?'greed':gData.fearGreed?.score<30?'fear':'normal',
        tnx:gData.tnx?.currentPrice>4.5?'pressure':gData.tnx?.currentPrice<3.5?'bullish':'normal'};
    if(prev.vix&&prev.vix!==sigs.vix)log.push({date:today,event:`VIX signal: ${prev.vix} → ${sigs.vix}`});
    if(prev.fg&&prev.fg!==sigs.fg)log.push({date:today,event:`Fear/Greed: ${prev.fg} → ${sigs.fg}`});
    if(prev.tnx&&prev.tnx!==sigs.tnx)log.push({date:today,event:`10Y Yield: ${prev.tnx} → ${sigs.tnx}`});
    lsSet(SIGKEY,{zone:curZone,...sigs});lsSet(RKEY,log.slice(-20));
    renderRegimeLog();
}
function renderRegimeLog(){
    const log=lsGet(RKEY,[]);const el=document.getElementById('regime-log');
    if(!log.length){el.innerHTML='<div class="empty-state">No regime changes recorded yet. Check back tomorrow.</div>';return;}
    el.innerHTML=log.slice().reverse().map(e=>`<div class="entry"><span class="entry-date">${e.date}</span><span class="entry-event">${e.event}</span></div>`).join('');
}

// ===== 30-DAY SCORE HISTORY =====
function saveScoreHistory(ts,es,st){
    const today=new Date().toISOString().slice(0,10);
    let hist=lsGet(SKEY,[]);
    if(hist.length&&hist[hist.length-1].date===today)hist[hist.length-1]={date:today,t:ts,e:es,s:st};
    else hist.push({date:today,t:ts,e:es,s:st});
    lsSet(SKEY,hist.slice(-30));renderScoreHistory();
}
function renderScoreHistory(){
    const hist=lsGet(SKEY,[]);if(hist.length<2)return;
    const ctx=document.getElementById('chart-score-history');if(!ctx)return;
    if(scoreHistoryChart)scoreHistoryChart.destroy();
    scoreHistoryChart=new Chart(ctx,{type:'line',data:{labels:hist.map(h=>h.date),datasets:[
        {label:'Trend Score',data:hist.map(h=>h.t),borderColor:'#4fc3f7',borderWidth:2,pointRadius:2,fill:false,tension:0.3},
        {label:'Emotion Score',data:hist.map(h=>h.e),borderColor:'#ffd740',borderWidth:2,pointRadius:2,fill:false,tension:0.3},
        {label:'Stock Target %',data:hist.map(h=>h.s),borderColor:'#00e676',borderWidth:1,borderDash:[4,3],pointRadius:0,fill:false,yAxisID:'y1'}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'var(--text-dim)',font:{size:10}}}},
        scales:{x:{ticks:{maxTicksLimit:6,color:'var(--text-dim)'},grid:{color:'rgba(255,255,255,0.04)'}},
                y:{ticks:{color:'var(--text-dim)'},grid:{color:'rgba(255,255,255,0.04)'}},
                y1:{position:'right',ticks:{color:'var(--text-dim)'},grid:{display:false},min:20,max:70}}}});
}

// ===== PORTFOLIO GAP =====
function updatePortfolioGap(){
    const slider=document.getElementById('portfolio-slider');if(!slider)return;
    const cur=parseInt(slider.value);document.getElementById('portfolio-pct').textContent=cur+'%';
    const sc=computeScores();if(!sc)return;
    const target=sc.stockTarget;const gap=cur-target;
    const zone=quadrantZone(sc.trendScore,sc.emotionScore);
    let advice='',cls='';
    if(Math.abs(gap)<=5){advice='✅ Your allocation is within the recommended range.';cls='up';}
    else if(gap>0){advice=`⚠️ You are ${gap}pp above target. Consider reducing by ${gap}pp.`;cls='down';}
    else{advice=`💡 You are ${Math.abs(gap)}pp below target. Room to add ${Math.abs(gap)}pp.`;cls='up';}
    document.getElementById('portfolio-gap-result').innerHTML=
        `<div class="${cls}" style="font-weight:600;margin-bottom:8px">${advice}</div>`+
        `<div style="font-size:12px;color:var(--text-dim)">Current: ${cur}% | Target: ${target}% (${zone.band})</div>`+
        `<div class="gap-bar-container"><div class="gap-bar-track">`+
        `<div class="gap-bar-current" style="width:${cur}%;background:${gap>5?'var(--red)':gap<-5?'var(--green)':'var(--accent)'}"></div>`+
        `<div class="gap-bar-target" style="left:${target}%;background:var(--yellow)"></div></div></div>`;
}

// ===== WHAT-IF SLIDERS =====
function initWhatIf(){
    const grid=document.getElementById('whatif-grid');
    const items=[
        {id:'wi-vix',label:'VIX',min:8,max:60,step:0.5,val:gData.vix?.currentPrice||20},
        {id:'wi-fg',label:'Fear/Greed',min:0,max:100,step:1,val:gData.fearGreed?.score||50},
        {id:'wi-tnx',label:'10Y Yield %',min:1,max:7,step:0.05,val:gData.tnx?.currentPrice||4},
        {id:'wi-breadth',label:'Breadth %',min:0,max:100,step:1,val:gData.breadth?.value||50},
    ];
    grid.innerHTML=items.map(i=>`<div class="whatif-item"><label>${i.label}: <span class="wi-val" id="${i.id}-val">${i.val}</span></label><input type="range" id="${i.id}" min="${i.min}" max="${i.max}" step="${i.step}" value="${i.val}" oninput="onWhatIf()"></div>`).join('');
}
function onWhatIf(){
    ['wi-vix','wi-fg','wi-tnx','wi-breadth'].forEach(id=>{const el=document.getElementById(id);if(el)document.getElementById(id+'-val').textContent=el.value;});
    const ov={vix:parseFloat(document.getElementById('wi-vix')?.value),fg:parseFloat(document.getElementById('wi-fg')?.value),
        tnx:parseFloat(document.getElementById('wi-tnx')?.value),breadth:parseFloat(document.getElementById('wi-breadth')?.value),
        oas:(gData.creditSpread?.value||3)*100};
    const sc=computeScores(ov);if(!sc)return;
    const zone=quadrantZone(sc.trendScore,sc.emotionScore);
    document.getElementById('whatif-result').innerHTML=`<div style="font-weight:700;color:${zone.color}">${zone.name}</div><div>Trend: ${sc.trendScore.toFixed(1)} | Emotion: ${sc.emotionScore} | Stock Target: <b>${sc.stockTarget}%</b></div>`;
}
function resetWhatIf(){initWhatIf();document.getElementById('whatif-result').innerHTML='';}

// ===== BACKTESTING =====
function renderBacktest(){
    const d=gData;if(!d.qqq?.closes?.length)return;
    const closes=d.qqq.closes;const n=closes.length;
    // Simple backtest: model = hold stockTarget% in QQQ, rest in cash (0% return)
    let modelVal=10000,holdVal=10000;
    const modelLine=[10000],holdLine=[10000];
    const sc=computeScores();const alloc=(sc?.stockTarget||50)/100;
    for(let i=1;i<n;i++){
        const ret=(closes[i]-closes[i-1])/closes[i-1];
        modelVal*=(1+ret*alloc);holdVal*=(1+ret);
        modelLine.push(modelVal);holdLine.push(holdVal);
    }
    const labels=d.qqq.timestamps.map(t=>new Date(t));
    const ctx=document.getElementById('chart-backtest');if(!ctx)return;
    if(backtestChart)backtestChart.destroy();
    backtestChart=new Chart(ctx,{type:'line',data:{labels,datasets:[
        {label:'Model ('+Math.round(alloc*100)+'% QQQ)',data:modelLine,borderColor:'var(--accent)',borderWidth:1.5,pointRadius:0,fill:false},
        {label:'Buy & Hold QQQ',data:holdLine,borderColor:'var(--orange)',borderWidth:1.5,pointRadius:0,fill:false,borderDash:[4,3]}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'var(--text-dim)',font:{size:10}}}},
        scales:{x:{type:'time',ticks:{maxTicksLimit:4,color:'var(--text-dim)'},grid:{display:false}},y:{ticks:{color:'var(--text-dim)'},grid:{color:'rgba(255,255,255,0.04)'}}}}});
}

// ===== NOTIFICATIONS =====
function requestNotif(){
    if(!('Notification' in window)){alert('Browser does not support notifications');return;}
    Notification.requestPermission().then(p=>{
        document.getElementById('btn-notif').textContent=p==='granted'?'✅ Notifications Enabled':'❌ Denied';
    });
}
function copyAlertSummary(){
    const sc=computeScores();if(!sc)return;
    const zone=quadrantZone(sc.trendScore,sc.emotionScore);
    const txt=`📊 Market Dashboard Alert (${new Date().toLocaleDateString()})\n${zone.name} — ${zone.action}\nStock Target: ${sc.stockTarget}%\nTrend: ${sc.trendScore.toFixed(1)}/8 | Emotion: ${sc.emotionScore}/9\nVIX: ${sc.vix.toFixed(1)} | F&G: ${sc.fg} | 10Y: ${gData.tnx?.currentPrice?.toFixed(2)}%`;
    navigator.clipboard.writeText(txt).then(()=>{const btn=document.querySelector('.btn-copy');btn.textContent='✅ Copied!';setTimeout(()=>btn.textContent='📋 Copy Alert Summary',2000);});
}

// ===== COLLAPSE =====
function toggleCollapse(el){el.parentElement.classList.toggle('collapsed');}

// ===== TIMEFRAME TOGGLE =====
function setTimeframe(tf,btn){
    document.querySelectorAll('.tf-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    // Timeframe affects chart zoom (visual only)
    // Re-render charts with filtered data
    // For now this is a visual indicator - full implementation would filter timestamps
}

// ===== LAUNCH =====
init();
