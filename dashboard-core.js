/* ===== Enhanced Market Dashboard V2 — Core Logic ===== */
if(!Math.erf){Math.erf=function(x){const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+p*x);return s*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));}}
const AI_MEAN=35.55,AI_SD=4.27;
let gData=null,quadrantChart=null,scoreHistoryChart=null,backtestChart=null;
const QKEY='quadrant-history-v2',RKEY='regime-log-v2',SKEY='score-history-v2',SIGKEY='prev-signals-v2';

// KPI definitions with polarity (true=higher is good for stocks)
const KPI_DEFS=[
    {id:'pe',label:'Shiller PE',get:d=>d.shiller?.current,fmt:v=>v.toFixed(2),prevGet:null,polarity:false,
     status:v=>{const z=(v-AI_MEAN)/AI_SD;return{text:'Z: '+z.toFixed(2)+'σ',cls:z>1.5?'down':z>0.8?'neutral':'up'}},
     thresh:[{val:39.8,label:'⚠️警戒',dir:'above'},{val:44.1,label:'🚨泡沫',dir:'above'}]},
    {id:'spx',label:'S&P 500',get:d=>d.spx?.currentPrice,prev:d=>d.spx?.previousClose,fmt:v=>v.toFixed(0),polarity:true,thresh:[]},
    {id:'ixic',label:'NASDAQ',get:d=>d.ixic?.currentPrice,prev:d=>d.ixic?.previousClose,fmt:v=>v.toFixed(0),polarity:true,thresh:[]},
    {id:'sox',label:'PHLX SOX',get:d=>d.sox?.currentPrice,prev:d=>d.sox?.previousClose,fmt:v=>v.toFixed(0),polarity:true,thresh:[]},
    {id:'qqq',label:'QQQ',get:d=>d.qqq?.currentPrice,prev:d=>d.qqq?.previousClose,fmt:v=>'$'+v.toFixed(1),polarity:true,
     sparkData:d=>d.qqq?.closes?.slice(-5),thresh:[]},
    {id:'smh',label:'SMH',get:d=>d.smh?.currentPrice,prev:d=>d.smh?.previousClose,fmt:v=>'$'+v.toFixed(1),polarity:true,
     sparkData:d=>d.smh?.closes?.slice(-5),thresh:[]},
    {id:'boxx',label:'BOXX',get:d=>d.boxx?.currentPrice,prev:d=>d.boxx?.previousClose,fmt:v=>'$'+v.toFixed(1),polarity:true,thresh:[]},
    {id:'vix',label:'VIX',get:d=>d.vix?.currentPrice,prev:d=>d.vix?.previousClose,fmt:v=>v.toFixed(1),polarity:false,
     sparkData:d=>d.vix?.closes?.slice(-5),
     status:v=>({text:v>25?'🟢 買點':v<15?'🔴 過熱':'🟡 中性',cls:v>25?'up':v<15?'down':'neutral'}),
     thresh:[{val:25,label:'🟢買點',dir:'above'},{val:15,label:'🔴過熱',dir:'below'}]},
    {id:'dxy',label:'DXY',get:d=>d.dxy?.currentPrice,prev:d=>d.dxy?.previousClose,fmt:v=>v.toFixed(1),polarity:false,
     sparkData:d=>d.dxy?.closes?.slice(-5),thresh:[]},
    {id:'tnx',label:'10Y Yield',get:d=>d.tnx?.currentPrice,prev:d=>d.tnx?.previousClose,fmt:v=>v.toFixed(2)+'%',polarity:false,
     status:v=>({text:v>4.5?'🔴 壓力':v<3.5?'🟢 利多':'🟡 中性',cls:v>4.5?'down':v<3.5?'up':'neutral'}),
     thresh:[{val:4.5,label:'🔴壓力',dir:'above'},{val:3.5,label:'🟢利多',dir:'below'}]},
    {id:'fg',label:'Fear/Greed',get:d=>d.fearGreed?.score,fmt:v=>String(v),polarity:true,
     status:v=>({text:v>70?'🔴 貪婪':v<30?'🟢 恐慌':'🟡 中性',cls:v>70?'down':v<30?'up':'neutral'}),
     thresh:[{val:30,label:'🟢恐慌',dir:'below'},{val:70,label:'🔴貪婪',dir:'above'}]},
    {id:'cs',label:'Credit Spread',get:d=>d.creditSpread?.value,fmt:v=>v.toFixed(2)+'%',polarity:false,
     status:v=>({text:v>5?'🚨 高風險':'✅ 正常',cls:v>5?'down':'up'}),
     thresh:[{val:5,label:'🚨危機',dir:'above'}]},
    {id:'oas',label:'HY OAS (bp)',get:d=>d.creditSpread?.value?d.creditSpread.value*100:null,fmt:v=>Math.round(v)+' bp',polarity:false,
     status:v=>({text:v>600?'🚨 極端恐慌':v>500?'🔴 高壓':v>400?'🟡 警戒':v>300?'🟢 中性':'✅ 低風險',cls:v>500?'down':v>400?'neutral':'up'}),
     thresh:[{val:400,label:'🟡警戒',dir:'above'},{val:600,label:'🚨極端',dir:'above'}]},
    {id:'br',label:'市場廣度 (>200MA)',get:d=>d.breadth?.value,fmt:v=>v.toFixed(1)+'%',polarity:true,
     status:v=>({text:v>80?'🔴 過熱':v>50?'🟡 中性':'🟢 偏弱可觀察',cls:v>80?'down':v>50?'neutral':'up'}),
     thresh:[{val:30,label:'🟢超賣',dir:'below'},{val:80,label:'🔴過熱',dir:'above'}]},
    {id:'twd',label:'USD/TWD',get:d=>(d.usdtwd||d.twd)?.currentPrice,prev:d=>(d.usdtwd||d.twd)?.previousClose,fmt:v=>v.toFixed(2),polarity:false,thresh:[]},
    {id:'hg',label:'Copper (銅)',get:d=>d.copper?.currentPrice,prev:d=>d.copper?.previousClose,fmt:v=>'$'+v.toFixed(2),polarity:true,
     sparkData:d=>d.copper?.closes?.slice(-5),thresh:[]}
];

const isValid=d=>!!(d&&d.qqq?.currentPrice&&d.smh?.currentPrice&&d.vix?.currentPrice&&d.shiller?.current);
function lsGet(k,def){try{return JSON.parse(localStorage.getItem(k))||def;}catch{return def;}}
function lsSet(k,v){localStorage.setItem(k,JSON.stringify(v));}
function movingAverage(arr,n){if(!arr?.length)return[];const out=[],win=[];for(let i=0;i<arr.length;i++){const v=arr[i];if(Number.isFinite(v))win.push(v);if(win.length>n)win.shift();out.push(win.length===n?win.reduce((a,b)=>a+b,0)/n:null);}return out;}

// ===== INIT =====
async function init(){
    const bar=document.getElementById('status-bar');
    try{
        let src='live API',res;
        try{res=await fetch('/api/data?t='+Date.now());if(!res.ok)throw 0;const d=await res.json();if(!isValid(d))throw 0;gData=d;}
        catch{src='snapshot';
            try{res=await fetch('./market-data-snapshot.json?t='+Date.now());if(!res.ok)throw 0;const s=await res.json();if(!isValid(s))throw 0;gData=s;}
            catch{res=await fetch('https://amoleskyhigh.github.io/felix-market-dashboard/market-data-snapshot.json?t='+Date.now());if(!res.ok)throw new Error('無法載入 snapshot');const s2=await res.json();if(!isValid(s2))throw new Error('invalid');gData=s2;}
        }
        bar.className='status-bar success';
        const ts=gData.timestamp||gData.updatedAt;
        bar.innerText=`✅ 數據已載入（${src}） ${ts?new Date(ts).toLocaleString():new Date().toLocaleTimeString()}`;
        renderKPIs();renderCharts();updateAlloc();renderMTD();renderRegimeLog();renderScoreHistory();renderBacktest();initWhatIf();
    }catch(e){bar.className='status-bar error';bar.innerText='❌ 系統錯誤: '+e.message;}
}

// ===== KPI RENDERING =====
function renderKPIs(){
    const row=document.getElementById('kpi-row');row.innerHTML='';
    KPI_DEFS.forEach((def,i)=>{
        const val=def.get(gData);if(val==null)return;
        const card=document.createElement('div');card.className='kpi-card';card.style.animationDelay=(i*0.05)+'s';
        let html=`<div class="kpi-label">${def.label}</div><div class="kpi-value">${def.fmt(val)}</div>`;
        // Status
        if(def.status){const s=def.status(val);html+=`<div class="kpi-status ${s.cls}">${s.text}</div>`;}
        // Delta badge
        const prevVal=def.prev?def.prev(gData):null;
        if(prevVal!=null&&Number.isFinite(prevVal)&&prevVal!==0){
            const delta=val-prevVal;const pct=((delta/Math.abs(prevVal))*100);
            const favorable=def.polarity?(delta>=0):(delta<=0);
            const cls=favorable?'up':'down';
            const arrow=delta>0?'▲':'▼';
            html+=`<div class="kpi-delta ${cls}">Δ ${delta>=0?'+':''}${Math.abs(pct)>1?pct.toFixed(1)+'%':delta.toFixed(2)} ${arrow}</div>`;
        }
        // Distance to threshold
        if(def.thresh?.length){
            const nearest=findNearestThreshold(val,def.thresh);
            if(nearest){
                const dist=Math.abs(nearest.dist);
                const pctDist=Math.min(100,Math.max(5,(1-dist/Math.max(1,Math.abs(val)))*100));
                const fillColor=dist<val*0.05?'var(--red)':dist<val*0.15?'var(--yellow)':'var(--green)';
                html+=`<div class="kpi-threshold"><span class="threshold-bar"><span class="threshold-fill" style="width:${pctDist}%;background:${fillColor}"></span></span> ${dist.toFixed(1)} to ${nearest.label}</div>`;
            }
        }
        // Sparkline
        if(def.sparkData){
            const sd=def.sparkData(gData);
            if(sd?.length>=3)html+=`<div class="kpi-sparkline"><canvas id="spark-${def.id}" width="120" height="28"></canvas></div>`;
        }
        card.innerHTML=html;row.appendChild(card);
        // Draw sparkline after DOM insert
        if(def.sparkData){const sd=def.sparkData(gData);if(sd?.length>=3)setTimeout(()=>drawSparkline('spark-'+def.id,sd,def.polarity),50);}
    });
}

function findNearestThreshold(val,thresholds){
    let best=null,bestDist=Infinity;
    thresholds.forEach(t=>{const d=t.val-val;const absd=Math.abs(d);
        if(absd<bestDist){bestDist=absd;best={dist:d,label:t.label};}});
    return best;
}

function drawSparkline(canvasId,data,polarity){
    const c=document.getElementById(canvasId);if(!c)return;
    const ctx=c.getContext('2d');const w=c.width,h=c.height;
    const mn=Math.min(...data),mx=Math.max(...data),range=mx-mn||1;
    ctx.clearRect(0,0,w,h);
    const goingUp=data[data.length-1]>=data[0];
    const color=polarity?(goingUp?'#00e676':'#ff5252'):(goingUp?'#ff5252':'#00e676');
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.lineJoin='round';
    ctx.beginPath();
    data.forEach((v,i)=>{const x=(i/(data.length-1))*w;const y=h-((v-mn)/range)*(h-4)-2;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.stroke();
    // Fill gradient
    const last=data.length-1;ctx.lineTo((last/(data.length-1))*w,h);ctx.lineTo(0,h);ctx.closePath();
    const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,color.replace(')',',0.15)').replace('rgb','rgba'));grad.addColorStop(1,'transparent');
    ctx.fillStyle=grad;ctx.fill();
}

// ===== SCORING ENGINE =====
function computeScores(overrides={}){
    const d=gData;if(!d?.shiller||!d?.vix||!d?.tnx)return null;
    const spx=d.spx||d.spy;
    const copperMA3=(d.copper?.closes?.length>=4)?(d.copper.closes.slice(-4,-1).reduce((a,b)=>a+b,0)/3):null;
    const tnxMA20=(d.tnx?.closes?.length>=20)?(d.tnx.closes.slice(-20).reduce((a,b)=>a+b,0)/20):null;
    const dxyMA20=(d.dxy?.closes?.length>=20)?(d.dxy.closes.slice(-20).reduce((a,b)=>a+b,0)/20):null;
    const vix=overrides.vix??d.vix.currentPrice;
    const fg=overrides.fg??(d.fearGreed?.score??50);
    const oas=overrides.oas??((d.creditSpread?.value||3)*100);
    const breadthVal=overrides.breadth??(d.breadth?.value??50);
    const tnxVal=overrides.tnx??d.tnx.currentPrice;
    const trend={
        copper:(d.copper?.currentPrice&&copperMA3)?(d.copper.currentPrice>copperMA3?2:0):0,
        tnx:(tnxVal&&tnxMA20)?(tnxVal<tnxMA20?2:0):0,
        dxy:(d.dxy?.currentPrice&&dxyMA20)?(d.dxy.currentPrice<dxyMA20?2:0):0,
        breadth:breadthVal>70?2:breadthVal>50?1:0
    };
    let K=1.0,ma200=null,dd=null;
    if(spx?.currentPrice&&spx?.closes?.length>=200){
        ma200=spx.closes.slice(-200).reduce((a,b)=>a+b,0)/200;dd=(spx.currentPrice-ma200)/ma200;
        if(dd<-0.15)K=0.5;else if(dd<-0.05)K=0.6;else if(dd<0)K=0.8;
    }
    const trendRaw=trend.copper+trend.tnx+trend.dxy+trend.breadth;
    const trendScore=trendRaw*K;
    const emoVix=vix>35?3:vix>28?2:vix>20?1:vix>15?0:-1;
    const emoFg=fg<20?3:fg<40?2:fg<60?1:fg<75?0:-1;
    const emoOas=oas>600?3:oas>500?2:oas>400?1:oas>300?0:-1;
    const emotionScore=emoVix+emoFg+emoOas;
    const pe=d.shiller.current;
    const rawStock=Math.min(70,Math.max(20,Math.round(20+trendScore*5+emotionScore*4)));
    let stockCap=100;if(pe>39.33)stockCap=55;else if(pe>=36)stockCap=65;
    const stockTarget=Math.min(rawStock,stockCap,70);
    return{trend,trendRaw,trendScore,K,ma200,dd,emotionScore,emoVix,emoFg,emoOas,vix,fg,oas,pe,stockTarget,stockCap,spx};
}

function quadrantZone(x,y){
    if(x>=4&&y>=2)return{name:'🟢 進攻區',band:'55%~70%',action:'Aggressive — full risk-on',color:'var(--green)'};
    if(x<4&&y>=2)return{name:'🟡 逆向佈局區',band:'45%~60%',action:'Contrarian — cautious accumulation',color:'var(--yellow)'};
    if(x>=4&&y<2)return{name:'🟠 趨勢續抱區',band:'50%~65%',action:'Hold trend — maintain positions',color:'var(--orange)'};
    return{name:'🔴 防守區',band:'35%~50%',action:'Defensive — reduce risk exposure',color:'var(--red)'};
}
