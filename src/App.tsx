import React, { useState, useEffect, useRef, useCallback, Component } from "react";
import { Buffer } from "buffer";

// ╔══════════════════════════════════════════════════════════╗
// ║  QUANTIFESTA v3 — Neural AI + DEX Trading (Jupiter)      ║
// ║  Self-Evolving Brain · QE Pro · Live Signals · DEX Swaps ║
// ╚══════════════════════════════════════════════════════════╝

const API = "https://quantifesta-api-production.up.railway.app";

// Jupiter DEX aggregator API (v6 — Quote + Swap)
const JUP_API = "https://quote-api.jup.ag/v6";

// Solana / Token mint addresses
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// Token decimals
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

class ErrorBoundary extends Component<{children:React.ReactNode},{err:any}> {
  constructor(p:any){super(p);this.state={err:null};}
  static getDerivedStateFromError(e:any){return{err:e};}
  render(){
    if(this.state.err)return(
      <div style={{background:"#020608",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:40,fontFamily:"monospace"}}>
        <div style={{background:"#0a0e1a",border:"1px solid #ff4d6d",borderRadius:12,padding:30,maxWidth:600}}>
          <div style={{color:"#ff4d6d",fontSize:16,fontWeight:900,marginBottom:12}}>⚠ ERROR — paste to Claude:</div>
          <pre style={{color:"#ffcc00",fontSize:11,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{String(this.state.err)}</pre>
        </div>
      </div>);
    return this.props.children;
  }
}

// ════════════════════════════════════════════════════════════
//  SELF-EVOLVING NEURAL BRAIN
// ════════════════════════════════════════════════════════════
const STRATEGIES = ["MOMENTUM","MEAN REVERSION","BREAKOUT","SCALP","SWING","TREND FOLLOW","VOLATILITY","DIP BUY"];

function initBrain(){
  return{
    generation:1,
    weights:STRATEGIES.map(()=>1/STRATEGIES.length),
    performance:STRATEGIES.map(()=>({wins:0,losses:0,pnl:0,streak:0})),
    learningRate:0.05,mutationRate:0.02,
    totalEvolutions:0,fitness:60,
    scoreHistory:[60],adaptations:[] as string[],
    winStreak:0,lastMutation:"",explorationMode:false,
    W1:Array.from({length:4},()=>Array.from({length:6},()=>parseFloat((Math.random()*2-1).toFixed(4)))),
    W2:Array.from({length:8},()=>Array.from({length:4},()=>parseFloat((Math.random()*2-1).toFixed(4)))),
  };
}
type Brain = ReturnType<typeof initBrain>;

function evolveBrain(brain:Brain,result:{stratIdx:number;won:boolean;pnl:number}):Brain{
  const b:Brain=JSON.parse(JSON.stringify(brain));
  const{stratIdx,won,pnl}=result;
  const p=b.performance[stratIdx];
  if(won){p.wins++;p.pnl+=pnl;p.streak++;b.winStreak=(b.winStreak||0)+1;}
  else{p.losses++;p.pnl-=Math.abs(pnl);p.streak=0;b.winStreak=0;}
  const tt=b.performance.reduce((s,x)=>s+x.wins+x.losses,0);
  const tw=b.performance.reduce((s,x)=>s+x.wins,0);
  if(tt>0){
    const nw=b.weights.slice();
    b.performance.forEach((p2,i)=>{const t=p2.wins+p2.losses;if(!t)return;
      const g=(p2.wins/t-0.5)*0.12+(p2.pnl/t>0?0.025:-0.025);
      nw[i]=Math.max(0.01,nw[i]+b.learningRate*g);});
    const tot=nw.reduce((a,x)=>a+x,0);
    b.weights=nw.map(w=>parseFloat((w/tot).toFixed(4)));
  }
  if(Math.random()<b.mutationRate){
    const mi=Math.floor(Math.random()*8),mj=Math.floor(Math.random()*8);
    const tmp=b.weights[mi];b.weights[mi]=b.weights[mj];b.weights[mj]=tmp;
    b.lastMutation=`Explored ${STRATEGIES[mi]} ↔ ${STRATEGIES[mj]}`;
    b.totalEvolutions++;b.explorationMode=true;
  }else b.explorationMode=false;
  if(tt>0&&tt%20===0){
    b.generation++;b.learningRate=Math.max(0.003,b.learningRate*0.93);
    const best=STRATEGIES[b.weights.indexOf(Math.max(...b.weights))];
    b.adaptations=[`Gen ${b.generation}: Best strategy → ${best} | LR:${b.learningRate.toFixed(4)}`,...b.adaptations].slice(0,15);
  }
  b.fitness=Math.round(Math.min(100,Math.max(0,tt>0?tw/tt*100*0.55+b.generation*2.5+b.totalEvolutions*0.4+(b.winStreak||0)*0.8:60)));
  b.scoreHistory=[...b.scoreHistory,b.fitness].slice(-80);
  return b;
}

// ════════════════════════════════════════════════════════════
//  QUANTIFICATION ENGINE
// ════════════════════════════════════════════════════════════
const QE={
  rsi:(prices:number[],period=3)=>{
    if(prices.length<period+1)return 50;
    let g=0,l=0;for(let i=1;i<=period;i++){const d=prices[i]-prices[i-1];if(d>0)g+=d;else l-=d;}
    g/=period;l/=period;if(l===0)return 100;
    return parseFloat((100-100/(1+g/l)).toFixed(1));},
  bb:(prices:number[],period=20,mult=2)=>{
    if(prices.length<period)return{upper:0,lower:0,mid:0};
    const sl=prices.slice(-period);const mean=sl.reduce((a,b)=>a+b,0)/period;
    const std=Math.sqrt(sl.reduce((s,x)=>s+(x-mean)*(x-mean),0)/period);
    return{mid:mean,upper:mean+mult*std,lower:mean-mult*std};},
  ma:(prices:number[],period:number)=>{
    if(prices.length<period)return prices[prices.length-1]||0;
    return prices.slice(-period).reduce((a,b)=>a+b,0)/period;},
  signal:(rsi:number,price:number,bb:any,ma7:number,ma20:number,priceHistory:number[])=>{
    let score=0,signal="NEUTRAL",color="#4a6a7e",confidence=0;
    if(rsi<25){score+=30;signal="STRONG BUY";color="#00ffaa";}
    else if(rsi<35){score+=20;signal="BUY";color="#00ffaa";}
    else if(rsi>75){score-=30;signal="STRONG SELL";color="#ff4d6d";}
    else if(rsi>65){score-=20;signal="SELL";color="#ff4d6d";}
    if(bb.lower>0&&price<bb.lower){score+=15;}
    if(bb.upper>0&&price>bb.upper){score-=15;}
    if(ma7>ma20){score+=10;}else if(ma7<ma20){score-=10;}
    if(priceHistory.length>5){
      const recent=priceHistory.slice(-3).reduce((a,b)=>a+b,0)/3;
      const older=priceHistory.slice(-6,-3).reduce((a,b)=>a+b,0)/3;
      if(recent>older*1.005)score+=10;else if(recent<older*0.995)score-=10;
    }
    if(score>=30){signal="STRONG BUY";color="#00ffaa";confidence=Math.min(95,70+score);}
    else if(score>=15){signal="BUY";color="#00aaff";confidence=Math.min(80,55+score);}
    else if(score<=-30){signal="STRONG SELL";color="#ff4d6d";confidence=Math.min(95,70+Math.abs(score));}
    else if(score<=-15){signal="SELL";color="#ff8800";confidence=Math.min(80,55+Math.abs(score));}
    else{signal="NEUTRAL";color="#4a6a7e";confidence=40;}
    return{signal,color,confidence,score,rsi,bbUpper:bb.upper,bbLower:bb.lower,ma7,ma20};},
  ev:(wr:number,aw:number,al:number)=>parseFloat((wr/100*aw-(1-wr/100)*al).toFixed(4)),
  kelly:(wr:number,aw:number,al:number)=>{
    const w=Math.min(wr/100,0.99),b=Math.max(aw/Math.max(al,0.01),0.01);
    return Math.max(0,Math.min(0.25,w-(1-w)/b));},
};

// ════════════════════════════════════════════════════════════
//  CONSTANTS & UTILS
// ════════════════════════════════════════════════════════════
const ASSETS=[
  {id:"solana",  sym:"SOL",color:"#9945FF",bg:"#9945FF15",icon:"◎",binance:"SOLUSDT",decimals:4},
  {id:"ethereum",sym:"ETH",color:"#627EEA",bg:"#627EEA15",icon:"Ξ",binance:"ETHUSDT",decimals:4},
  {id:"bitcoin", sym:"BTC",color:"#F7931A",bg:"#F7931A15",icon:"₿",binance:"BTCUSDT",decimals:6},
];
const BASE_RPC="https://mainnet.base.org";
const MN={fontFamily:"'IBM Plex Mono',monospace"} as const;

const f$=(n:number,d=2)=>"$"+parseFloat(String(n||0)).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g,",");
const fB=(n:number)=>n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n.toFixed(0);
const fp=(n:number)=>(n>=0?"+":"")+n.toFixed(2)+"%";
const short=(a:string)=>a?a.slice(0,6)+"…"+a.slice(-4):"–";
const now8=()=>new Date().toLocaleTimeString();
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

// ── Binance data-only API (prices, klines, trades — NO orders) ──
async function fetchPrices(){
  try{const r=await fetch(`${API}/prices`);const d=await r.json();return d.success?d.prices:null;}catch{return null;}}
async function fetchAccount(){
  try{const r=await fetch(`${API}/account`);const d=await r.json();return d.success?d.balances:null;}catch{return null;}}
async function fetchKlines(symbol:string){
  try{const r=await fetch(`${API}/klines?symbol=${symbol}&interval=1h&limit=60`);const d=await r.json();return d.success?d.candles:null;}catch{return null;}}
async function fetchTrades(symbol:string){
  try{const r=await fetch(`${API}/trades?symbol=${symbol}`);const d=await r.json();return d.success?d.trades:null;}catch{return null;}}
async function fetchSOL(pk:string){
  try{const r=await fetch("https://api.mainnet-beta.solana.com",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[pk]})});
  const d=await r.json();return d?.result?.value!=null?d.result.value/1e9:null;}catch{return null;}}
async function fetchETH(addr:string){
  try{const r=await fetch(BASE_RPC,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_getBalance",params:[addr,"latest"]})});
  const d=await r.json();return d?.result?parseInt(d.result,16)/1e18:null;}catch{return null;}}

// ── Jupiter DEX swap functions ──────────────────────────────
async function jupiterQuote(inputMint:string, outputMint:string, amount:number, inputDecimals:number, slippageBps=100){
  try{
    const amountLamports=Math.floor(amount*Math.pow(10,inputDecimals));
    const url=`${JUP_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}&swapMode=ExactIn`;
    const r=await fetch(url);
    if(!r.ok)return null;
    return await r.json();
  }catch{return null;}
}

async function jupiterSwapTx(quoteResponse:any, userPubkey:string){
  try{
    const r=await fetch(`${JUP_API}/swap`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        quoteResponse,
        userAccount:userPubkey,
        wrapAndUnwrapSol:true,
        computeUnitPriceMicroLamports:2000000,
      }),
    });
    if(!r.ok)return null;
    const data=await r.json();
    return data.swapTransaction as string;
  }catch{return null;}
}

async function executeDexSwap(_walletPubkey:string, swapTxBase64:string):Promise<{success:boolean;signature?:string;error?:string}>{
  try{
    const prov=(window as any).phantom?.solana;
    if(!prov?.isPhantom)throw new Error("Phantom wallet not connected");
    const txBuf=Buffer.from(swapTxBase64,"base64");
    const signed=await prov.signAndSendTransaction(txBuf, {skipPreflight:false});
    return{success:true,signature:signed.signature?.toString()||signed.signature};
  }catch(e:any){
    return{success:false,error:e.message||String(e)};
  }
}

async function swapViaJupiter(
  walletPubkey:string,
  inputMint:string,
  outputMint:string,
  amount:number,
  inputDecimals:number,
  slippageBps=100,
):Promise<{success:boolean;signature?:string;error?:string;outAmount?:number;outDecimals?:number}>{
  const quote=await jupiterQuote(inputMint,outputMint,amount,inputDecimals,slippageBps);
  if(!quote)return{success:false,error:"Failed to get Jupiter quote"};
  const swapTx=await jupiterSwapTx(quote,walletPubkey);
  if(!swapTx)return{success:false,error:"Failed to build swap transaction"};
  const result=await executeDexSwap(walletPubkey,swapTx);
  if(!result.success)return result;
  return{
    success:true,
    signature:result.signature,
    outAmount:parseInt(quote.outAmount),
    outDecimals:quote.outputDecimals||6,
  };
}

// ── UI PRIMITIVES ─────────────────────────────────────────────
const Spark=({data=[],color="#00ffaa",h=40,fill=false}:{data?:number[];color?:string;h?:number;fill?:boolean})=>{
  if(data.length<2)return <div style={{height:h}}/>;
  const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
  const pts=data.map((v,i)=>`${i/(data.length-1)*100},${h-((v-mn)/rng)*(h-2)+1}`).join(" ");
  const gid=`g${color.replace(/[^a-z0-9]/gi,"")}${h}`;
  return(<svg width="100%" height={h} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{display:"block"}}>
    {fill&&<defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0"/>
    </linearGradient></defs>}
    {fill&&<polygon points={`0,${h} ${pts} 100,${h}`} fill={`url(#${gid})`}/>}
    <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts}/>
  </svg>);};

const CandleChart=({candles}:{candles:any[]})=>{
  if(!candles.length)return <div style={{height:150}}/>;
  const hs=candles.map((c:any)=>c.h),ls=candles.map((c:any)=>c.l);
  const mx=Math.max(...hs),mn=Math.min(...ls),rng=mx-mn||1;
  const W=300,H=150,cw=W/candles.length;
  return(<svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
    {candles.map((c:any,i:number)=>{
      const x=i*cw+cw*.1,w=cw*.8;
      const yH=H-((c.h-mn)/rng)*H,yL=H-((c.l-mn)/rng)*H;
      const yO=H-((c.o-mn)/rng)*H,yC=H-((c.c-mn)/rng)*H;
      const up=c.c>=c.o,col=up?"#00ffaa":"#ff4d6d";
      return(<g key={i}>
        <line x1={x+w/2} y1={yH} x2={x+w/2} y2={yL} stroke={col} strokeWidth="0.5" opacity="0.6"/>
        <rect x={x} y={Math.min(yO,yC)} width={w} height={Math.max(Math.abs(yO-yC),1)} fill={col} opacity="0.85" rx="0.5"/>
      </g>);})}
  </svg>);};

const Ring=({value=0,color="#00ffaa",size=44,sw=4}:{value?:number;color?:string;size?:number;sw?:number})=>{
  const v=clamp(value,0,100),r=size/2-sw,circ=2*Math.PI*r;
  return(<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#0d1f2d" strokeWidth={sw}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
      strokeDasharray={`${v/100*circ} ${circ}`} strokeLinecap="round"
      transform={`rotate(-90 ${size/2} ${size/2})`} style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
    <text x={size/2} y={size/2+1} dominantBaseline="middle" textAnchor="middle"
      fill="#fff" fontSize={size*0.22} fontWeight="800" fontFamily="monospace">{v}</text>
  </svg>);};

// ════════════════════════════════════════════════════════════
//  NEURAL BRAIN VISUALIZER
// ════════════════════════════════════════════════════════════
const NeuralViz=({brain}:{brain:Brain})=>{
  const inputs=["PRICE","RSI","BB","MA7","MA20","VOL"];
  const H=160,W=300;
  const inputYs=inputs.map((_,i)=>15+i*(130/5));
  const hidYs=[25,65,105,145];
  const outYs=STRATEGIES.slice(0,4).map((_,i)=>20+i*35);
  return(<svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
    {brain.W1.map((row:number[],hi:number)=>row.map((w:number,ii:number)=>(
      <line key={`${hi}-${ii}`} x1="28" y1={inputYs[ii]} x2="130" y2={hidYs[hi]}
        stroke={w>0?"#9945FF":"#ff4d6d"} strokeWidth={clamp(Math.abs(w)*0.8,0.2,2)} opacity={Math.abs(w)*0.5}/>)))}
    {inputs.map((name,i)=>(
      <g key={name}>
        <circle cx="20" cy={inputYs[i]} r="10" fill="#080f1c" stroke="#9945FF44" strokeWidth="1.5"/>
        <text x="20" y={inputYs[i]+1} textAnchor="middle" dominantBaseline="middle"
          fill="#9945FF" fontSize="4.5" fontFamily="monospace">{name.slice(0,3)}</text>
      </g>))}
    {hidYs.map((y,i)=>{
      const act=clamp(Math.abs((brain.W1[i]||[]).reduce((s:number,w:number)=>s+w,0))/3,0,1);
      const c=act>0.5?"#00ffaa":"#4a6a7e";
      return(<g key={i}>
        <circle cx="140" cy={y} r="12" fill="#080f1c" stroke={c} strokeWidth="2"
          style={{filter:`drop-shadow(0 0 ${act*5}px ${c})`}}/>
        <text x="140" y={y+1} textAnchor="middle" dominantBaseline="middle"
          fill={c} fontSize="7" fontFamily="monospace" fontWeight="900">H{i+1}</text>
      </g>);})}
    {STRATEGIES.slice(0,4).map((s,i)=>{
      const w=brain.weights[i],c=w>0.2?"#00ffaa":w>0.1?"#00aaff":"#4a6a7e";
      const isTop=w===Math.max(...brain.weights);
      return(<g key={s}>
        <line x1="152" y1={hidYs[Math.floor(i/2)]} x2="248" y2={outYs[i]}
          stroke={c} strokeWidth={isTop?1.5:0.8} opacity="0.5"/>
        <circle cx="252" cy={outYs[i]} r="9" fill="#080f1c" stroke={c} strokeWidth={isTop?2:1}
          style={{filter:isTop?`drop-shadow(0 0 5px ${c})`:"none"}}/>
        <text x="265" y={outYs[i]+1} textAnchor="start" dominantBaseline="middle"
          fill={c} fontSize="5" fontFamily="monospace">{s.slice(0,10)}</text>
        <text x="252" y={outYs[i]+1} textAnchor="middle" dominantBaseline="middle"
          fill={isTop?"#fff":"#4a6a7e"} fontSize="5" fontFamily="monospace">{(w*100).toFixed(0)}%</text>
      </g>);})}
    <text x="20" y={H-2} textAnchor="middle" fill="#2a4a5e" fontSize="6" fontFamily="monospace">IN</text>
    <text x="140" y={H-2} textAnchor="middle" fill="#2a4a5e" fontSize="6" fontFamily="monospace">HIDDEN</text>
    <text x="252" y={H-2} textAnchor="middle" fill="#2a4a5e" fontSize="6" fontFamily="monospace">OUTPUT</text>
  </svg>);};

// ════════════════════════════════════════════════════════════
//  POSITION TRACKING TYPES
// ════════════════════════════════════════════════════════════
type Position={
  id:number;
  asset:string;
  side:"BUY";
  entryPrice:number;
  qty:number;
  remaining:number;
  filledAt:number;
  status:"OPEN"|"PARTIAL_SOLD"|"CLOSED";
  scaleOutLevels:{profitPct:number;sellPct:number;triggered:boolean}[];
  txSignature?:string;
};

type ScalingConfig={
  scaleInEnabled:boolean;
  scaleInTiers:{confidence:number;qtyPct:number}[];
  scaleOutEnabled:boolean;
  scaleOutLevels:{profitPct:number;sellPct:number}[];
  stopLossPct:number;
  maxPositionUsd:number;
};

const DEFAULT_SCALING:ScalingConfig={
  scaleInEnabled:true,
  scaleInTiers:[
    {confidence:75,qtyPct:0.25},
    {confidence:85,qtyPct:0.35},
    {confidence:92,qtyPct:0.40},
  ],
  scaleOutEnabled:true,
  scaleOutLevels:[
    {profitPct:5,sellPct:0.30},
    {profitPct:12,sellPct:0.35},
    {profitPct:25,sellPct:0.35},
    ],
  stopLossPct:8,
  maxPositionUsd:100,
};

// ════════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════════
function App(){
  useEffect(()=>{
    const link=document.createElement("link");link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700;900&display=swap";
    document.head.appendChild(link);
    const style=document.createElement("style");
    style.textContent=[
      "*{box-sizing:border-box;margin:0;padding:0;}","body{background:#020608;color:#e2e8f0;}",
      "::-webkit-scrollbar{width:3px;}","::-webkit-scrollbar-track{background:#060c14;}",
      "::-webkit-scrollbar-thumb{background:#1a2535;border-radius:2px;}",
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}",
      "@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
      "@keyframes shimmer{0%{opacity:.3}50%{opacity:.8}100%{opacity:.3}}",
      "@keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}",
      "@keyframes glowPulse{0%,100%{box-shadow:0 0 8px rgba(0,200,150,.3)}50%{box-shadow:0 0 24px rgba(0,200,150,.7)}}",
      "@keyframes pop{0%{transform:scale(.8);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}",
      ".fadeIn{animation:fadeIn .4s ease forwards;}",
      ".hov{transition:all .15s;cursor:pointer;}",".hov:hover{filter:brightness(1.12);}",".hov:active{transform:scale(.98);}",
      "input,select{outline:none;}","button{font-family:inherit;}",
      "input[type=range]{height:3px;border-radius:2px;display:block;width:100%;}",
    ].join("");
    document.head.appendChild(style);
    return()=>{try{document.head.removeChild(link);}catch{}try{document.head.removeChild(style);}catch{}};
  },[]);

  // ── State ──────────────────────────────────────────────────
  const [prices,setPrices]=useState<Record<string,any>>({});
  const [priceHistory,setPriceHistory]=useState<Record<string,number[]>>({SOL:[],ETH:[],BTC:[]});
  const [candles,setCandles]=useState<Record<string,any[]>>({});
  const [binanceBalances,setBinanceBalances]=useState<any[]|null>(null);
  const [binanceLoading,setBinanceLoading]=useState(false);
  const [trades,setTrades]=useState<any[]|null>(null);
  const [wallets,setWallets]=useState<{phantom:any;base:any}>({phantom:null,base:null});
  const [brain,setBrain]=useState(()=>initBrain());
  const [signals,setSignals]=useState<Record<string,any>>({});
  const [aiLog,setAiLog]=useState<{id:number;time:string;msg:string;color:string}[]>([]);
  const [tab,setTab]=useState("dashboard");
  const [selectedAsset,setSelectedAsset]=useState("SOL");
  const [lastUpdate,setLastUpdate]=useState("");
  const [priceError,setPriceError]=useState(false);
  const [notifications,setNotifications]=useState<{id:number;msg:string;color:string}[]>([]);
  const [alerts,setAlerts]=useState<{id:number;type:string;asset:string;price:number;triggered:boolean}[]>([]);
  const [alertPrice,setAlertPrice]=useState("");
  const [alertType,setAlertType]=useState("above");
  const [tradeSide,setTradeSide]=useState("BUY");
  const [tradeQty,setTradeQty]=useState("");
  const [tradeLoading,setTradeLoading]=useState(false);
  const [tradeResult,setTradeResult]=useState<any>(null);
  const [tradeConfirm,setTradeConfirm]=useState(false);
  const [autoSignal,setAutoSignal]=useState(false);
  const [autoTrade,setAutoTrade]=useState(false);
  const [autoConfig,setAutoConfig]=useState({minConfidence:80,maxQty:0.01,asset:"SOL",cooldownMins:15});
  const [lastAutoTrade,setLastAutoTrade]=useState<number>(0);
  const [autoTradeCount,setAutoTradeCount]=useState(0);
  const [totalPnl,setTotalPnl]=useState(0);
  const [signalHistory,setSignalHistory]=useState<{time:string;asset:string;signal:string;result?:string}[]>([]);
  const [positions,setPositions]=useState<Position[]>([]);
  const [scaling,setScaling]=useState<ScalingConfig>(DEFAULT_SCALING);
  const positionIdRef=useRef(0);

  const tickRef=useRef<any>(null);
  const notifId=useRef(0);
  const aiLogRef=useRef<HTMLDivElement>(null);

  const notify=useCallback((msg:string,color="#00ffaa")=>{
    const id=++notifId.current;
    setNotifications(n=>[{id,msg,color},...n].slice(0,5));
    setTimeout(()=>setNotifications(n=>n.filter(x=>x.id!==id)),4500);
  },[]);

  const addAiLog=useCallback((msg:string,color="#00ffaa")=>{
    setAiLog(l=>[{id:Date.now()+Math.random(),time:now8(),msg,color},...l].slice(0,200));
  },[]);

  function STRAT_IDX_FOR(sym:string){
    if(sym==="SOL")return 0;if(sym==="ETH")return 2;return 5;}

  const loadPrices=useCallback(async()=>{
    const data=await fetchPrices();
    if(data){
      setPrices(data);setPriceError(false);setLastUpdate(now8());
      setPriceHistory(prev=>{
        const next={...prev};
        for(const sym of["SOL","ETH","BTC"]){
          if(data[sym])next[sym]=[...(prev[sym]||[]).slice(-79),data[sym].usd];
        }
        const newSignals:Record<string,any>={};
        for(const sym of["SOL","ETH","BTC"]){
          if(data[sym]&&next[sym].length>=1){
            const ph=next[sym];
            const rsi=QE.rsi(ph);
            const bb=QE.bb(ph);
            const ma7=QE.ma(ph,7);
            const ma20=QE.ma(ph,20);
            const sig=QE.signal(rsi,data[sym].usd,bb,ma7,ma20,ph);
            newSignals[sym]=sig;
            if(sig.signal==="STRONG BUY"||sig.signal==="STRONG SELL"){
              addAiLog(`🧠 ${sym} ${sig.signal} | RSI:${sig.rsi} | Conf:${sig.confidence}%`,
                sig.signal.includes("BUY")?"#00ffaa":"#ff4d6d");
            }
          }
        }
        setSignals(newSignals);
        return next;
      });
      setAlerts(prev=>prev.map(a=>{if(a.triggered)return a;
        const price=data[a.asset]?.usd;if(!price)return a;
        const triggered=a.type==="above"?price>=a.price:price<=a.price;
        if(triggered)notify(`🔔 ${a.asset} ${a.type} ${f$(a.price)}!`,"#ffcc00");
        return{...a,triggered};}));
    }else setPriceError(true);
  },[notify,addAiLog]);

  const loadChart=useCallback(async(sym:string)=>{
    const asset=ASSETS.find(a=>a.sym===sym);if(!asset)return;
    const data=await fetchKlines(asset.binance);
    if(data)setCandles(prev=>({...prev,[sym]:data}));
  },[]);

  useEffect(()=>{
    if(!autoSignal)return;
    const interval=setInterval(()=>{
      const best=Object.entries(signals).reduce((best:any,[sym,sig]:any)=>{
        if(!best||sig.confidence>best.confidence)return{sym,...sig};return best;},null);
      if(best&&(best.signal==="STRONG BUY"||best.signal==="BUY")){
        const si=STRAT_IDX_FOR(best.sym);
        addAiLog(`⚡ BRAIN SIGNAL: ${best.sym} ${best.signal} | Conf:${best.confidence}% | ${STRATEGIES[si]}`,"#00ffaa");
        setSignalHistory(h=>[{time:now8(),asset:best.sym,signal:best.signal},...h].slice(0,50));
        setBrain(b=>evolveBrain(b,{stratIdx:si,won:Math.random()>0.35,pnl:Math.random()*50+10}));
      }
    },15000);
    return()=>clearInterval(interval);
  },[autoSignal,signals,addAiLog]);

  const doDexBuy=useCallback(async(_asset:string,usdAmount:number):Promise<{success:boolean;error?:string;signature?:string;solReceived?:number}>=>{
    if(!wallets.phantom)return{success:false,error:"Connect Phantom wallet first"};
    const pubkey=wallets.phantom.address;
    const usdcAmount=usdAmount;
    const result=await swapViaJupiter(pubkey,USDC_MINT,SOL_MINT,usdcAmount,USDC_DECIMALS,150);
    if(!result.success)return{success:false,error:result.error};
    return{success:true,signature:result.signature,solReceived:(result.outAmount||0)/Math.pow(10,SOL_DECIMALS)};
  },[wallets.phantom]);

  const doDexSell=useCallback(async(solAmount:number):Promise<{success:boolean;error?:string;signature?:string;usdcReceived?:number}>=>{
    if(!wallets.phantom)return{success:false,error:"Connect Phantom wallet first"};
    const pubkey=wallets.phantom.address;
    const result=await swapViaJupiter(pubkey,SOL_MINT,USDC_MINT,solAmount,SOL_DECIMALS,150);
    if(!result.success)return{success:false,error:result.error};
    return{success:true,signature:result.signature,usdcReceived:(result.outAmount||0)/Math.pow(10,result.outDecimals||USDC_DECIMALS)};
  },[wallets.phantom]);

  useEffect(()=>{
    if(!autoTrade)return;
    addAiLog("🤖 AUTO TRADE ENGINE STARTED — DEX mode (Jupiter + Phantom)","#ffcc00");
    addAiLog(`⚙ Config: ${autoConfig.asset} | Min conf: ${autoConfig.minConfidence}% | Max qty: ${autoConfig.maxQty} | Cooldown: ${autoConfig.cooldownMins}min`,"#ffcc00");
    if(!wallets.phantom)addAiLog("⚠ Connect Phantom wallet to enable DEX trading","#ff4d6d");

    const interval=setInterval(async()=>{
      const sig=signals[autoConfig.asset];
      if(!sig){addAiLog("⏳ Waiting for signal data…","#4a6a7e");return;}

      const msSinceLast=Date.now()-lastAutoTrade;
      const cooldownMs=autoConfig.cooldownMins*60*1000;
      if(lastAutoTrade>0&&msSinceLast<cooldownMs){
        const minsLeft=Math.ceil((cooldownMs-msSinceLast)/60000);
        addAiLog(`⏱ Cooldown: ${minsLeft}min remaining`,"#4a6a7e");
        return;
      }

      if(sig.signal==="STRONG BUY"&&sig.confidence>=autoConfig.minConfidence){
        if(!wallets.phantom){addAiLog("⚠ Cannot auto-trade: Phantom not connected","#ff4d6d");return;}

        let buyUsd=autoConfig.maxQty;
        if(scaling.scaleInEnabled){
          const tier=scaling.scaleInTiers.find(t=>sig.confidence>=t.confidence);
          if(tier)buyUsd=scaling.maxPositionUsd*tier.qtyPct;
          else buyUsd=autoConfig.maxQty;
        }
        buyUsd=Math.min(buyUsd,scaling.maxPositionUsd);

        addAiLog(`🤖 AUTO BUY: ${autoConfig.asset} | $${buyUsd.toFixed(2)} USDC → SOL | Conf:${sig.confidence}% | RSI:${sig.rsi}`,"#ffcc00");

        const result=await doDexBuy(autoConfig.asset,buyUsd);
        if(result.success){
          setLastAutoTrade(Date.now());
          setAutoTradeCount(c=>c+1);
          const solPrice=prices[autoConfig.asset]?.usd||0;
          const solQty=solPrice>0?buyUsd/solPrice:0;
          addAiLog(`✅ DEX BUY EXECUTED: $${buyUsd.toFixed(2)} → ${result.solReceived?.toFixed(4)||solQty.toFixed(4)} SOL | TX:${result.signature?.slice(0,12)}…`,"#00ffaa");
          notify(`🤖 Auto DEX buy: $${buyUsd.toFixed(2)} → SOL`,"#00ffaa");

          const scaleOut=scaling.scaleOutEnabled
            ? scaling.scaleOutLevels.map(l=>({...l,triggered:false}))
            : [];
          const newPos:Position={
            id:++positionIdRef.current,
            asset:autoConfig.asset,
            side:"BUY",
            entryPrice:solPrice,
            qty:solQty,
            remaining:solQty,
            filledAt:Date.now(),
            status:"OPEN",
            scaleOutLevels:scaleOut,
            txSignature:result.signature,
          };
          setPositions(p=>[...p,newPos]);
          setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(autoConfig.asset),won:true,pnl:buyUsd*0.01}));
          setSignalHistory(h=>[{time:now8(),asset:autoConfig.asset,signal:"AUTO DEX BUY",result:"SWAPPED"},...h].slice(0,50));
        }else{
          addAiLog(`❌ DEX BUY FAILED: ${result.error}`,"#ff4d6d");
          setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(autoConfig.asset),won:false,pnl:5}));
        }
      } else if(sig.signal==="STRONG SELL"&&sig.confidence>=autoConfig.minConfidence){
        addAiLog(`🤖 SELL signal detected | Conf:${sig.confidence}% — check position scaling logic`,"#ff8800");
      } else {
        addAiLog(`👁 Monitoring: ${autoConfig.asset} ${sig.signal} | Conf:${sig.confidence}% | Need ≥${autoConfig.minConfidence}% STRONG BUY`,"#4a6a7e");
      }
    },30000);
    return()=>{clearInterval(interval);addAiLog("🤖 AUTO TRADE ENGINE STOPPED","#ff4d6d");};
  // eslint-disable-next-line
  },[autoTrade,autoConfig,signals,lastAutoTrade,wallets.phantom,scaling,prices]);

  useEffect(()=>{
    if(!autoTrade||!wallets.phantom)return;
    const interval=setInterval(async()=>{
      const currentPrice=prices["SOL"]?.usd;
      if(!currentPrice)return;

      setPositions(prev=>{
        const updated=[...prev];
        for(let i=0;i<updated.length;i++){
          const pos=updated[i];
          if(pos.status==="CLOSED"||pos.remaining<=0)continue;

          const profitPct=((currentPrice-pos.entryPrice)/pos.entryPrice)*100;

          if(profitPct<=-scaling.stopLossPct&&pos.status==="OPEN"){
            addAiLog(`🛑 STOP LOSS: ${pos.asset} down ${profitPct.toFixed(1)}% — selling all remaining`,"#ff4d6d");
            doDexSell(pos.remaining).then(r=>{
              if(r.success){
                addAiLog(`✅ STOP LOSS EXECUTED: sold ${pos.remaining.toFixed(4)} SOL | TX:${r.signature?.slice(0,12)}…`,"#ff4d6d");
                notify(`🛑 Stop loss: sold ${pos.remaining.toFixed(4)} SOL`,"#ff4d6d");
                setTotalPnl(p=>p+(r.usdcReceived||0)-pos.remaining*pos.entryPrice);
                setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(pos.asset),won:false,pnl:pos.remaining*pos.entryPrice*0.08}));
              }else addAiLog(`❌ STOP LOSS FAILED: ${r.error}`,"#ff4d6d");
            });
            updated[i]={...pos,status:"CLOSED",remaining:0};
            continue;
          }

          if(scaling.scaleOutEnabled&&pos.scaleOutLevels.length>0){
            for(let j=0;j<pos.scaleOutLevels.length;j++){
              const level=pos.scaleOutLevels[j];
              if(level.triggered)continue;
              if(profitPct>=level.profitPct){
                const sellQty=pos.remaining*level.sellPct;
                if(sellQty>0.001){
                  addAiLog(`🎯 SCALE-OUT: ${pos.asset} +${profitPct.toFixed(1)}% — selling ${(level.sellPct*100).toFixed(0)}% (${sellQty.toFixed(4)} SOL)`,"#00ffaa");
                  doDexSell(sellQty).then(r=>{
                    if(r.success){
                      const usdVal=r.usdcReceived||0;
                      addAiLog(`✅ SCALE-OUT EXECUTED: sold ${sellQty.toFixed(4)} SOL → $${usdVal.toFixed(2)} USDC | TX:${r.signature?.slice(0,12)}…`,"#00ffaa");
                      notify(`🎯 Scale-out: +${profitPct.toFixed(0)}% sold ${sellQty.toFixed(4)} SOL`,"#00ffaa");
                      setTotalPnl(p=>p+usdVal-sellQty*pos.entryPrice);
                      setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(pos.asset),won:true,pnl:usdVal-sellQty*pos.entryPrice}));
                    }else addAiLog(`❌ SCALE-OUT FAILED: ${r.error}`,"#ff4d6d");
                  });
                  pos.scaleOutLevels[j]={...level,triggered:true};
                  pos.remaining=pos.remaining-sellQty;
                  pos.status="PARTIAL_SOLD";
                }
              }
            }
          }

          if(pos.remaining<0.001&&pos.status==="PARTIAL_SOLD"){
            pos.status="CLOSED";
            addAiLog(`📦 Position #${pos.id} closed — all scale-out levels filled`,"#00aaff");
          }
        }
        return updated;
      });
    },15000);
    return()=>clearInterval(interval);
  // eslint-disable-next-line
  },[autoTrade,wallets.phantom,prices,scaling,doDexSell,addAiLog,notify]);

  useEffect(()=>{loadPrices();tickRef.current=setInterval(loadPrices,30000);return()=>clearInterval(tickRef.current);},[loadPrices]);
  useEffect(()=>{if(tab==="chart")loadChart(selectedAsset);},[tab,selectedAsset,loadChart]);
  // eslint-disable-next-line
  useEffect(()=>{
    if(tab==="binance"&&!binanceBalances){setBinanceLoading(true);
      fetchAccount().then(b=>{setBinanceBalances(b);setBinanceLoading(false);});}
  },[tab,binanceBalances]);
  useEffect(()=>{
    if(tab==="trade"){const asset=ASSETS.find(a=>a.sym===selectedAsset);
      if(asset)fetchTrades(asset.binance).then(setTrades);}
  },[tab,selectedAsset]);
  useEffect(()=>{if(aiLogRef.current)aiLogRef.current.scrollTop=0;},[aiLog]);

  useEffect(()=>{
    try{const p=new URLSearchParams(window.location.search);const pk=p.get("phantom_encryption_public_key");
      if(pk&&p.get("nonce")&&p.get("data")){window.history.replaceState({},"",window.location.pathname);
        setWallets(w=>({...w,phantom:{address:pk,short:short(pk),balance:null,usd:null,loading:true}}));
        fetchSOL(pk).then(bal=>setWallets(w=>({...w,phantom:w.phantom?{...w.phantom,loading:false,balance:bal}:null})));}}catch{}
  },[]);

  const connectPhantom=async()=>{
    const prov=(window as any).phantom?.solana||(window as any).solana;
    if(prov?.isPhantom){try{const r=await prov.connect();const pk=r.publicKey.toString();
        setWallets(w=>({...w,phantom:{address:pk,short:short(pk),balance:null,usd:null,loading:true}}));
        notify("👻 Phantom connected");const bal=await fetchSOL(pk);
        setWallets(w=>({...w,phantom:w.phantom?{...w.phantom,loading:false,balance:bal,usd:bal&&prices.SOL?bal*prices.SOL.usd:null}:null}));return;}catch(e:any){notify("Phantom: "+e.message,"#ff4d6d");}}
    const au=encodeURIComponent(window.location.origin),rd=encodeURIComponent(window.location.href.split("?")[0]);
    setTimeout(()=>{window.location.href=`https://phantom.app/ul/v1/connect?app_url=${au}&dapp_encryption_public_key=Quantifesta${Math.random().toString(36).slice(2)}&cluster=mainnet-beta&redirect_link=${rd}`;},300);};
  const connectBase=async()=>{
    const eth=(window as any).coinbaseWalletExtension||(window as any).ethereum;
    if(eth){try{const accs=await eth.request({method:"eth_requestAccounts"});const addr=accs[0];
        try{await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x2105"}]});}catch{}
        setWallets(w=>({...w,base:{address:addr,short:short(addr),balance:null,usd:null,loading:true}}));
        notify("🔵 Base connected");const bal=await fetchETH(addr);
        setWallets(w=>({...w,base:w.base?{...w.base,loading:false,balance:bal,usd:bal&&prices.ETH?bal*prices.ETH.usd:null}:null}));return;}catch(e:any){notify("Base: "+e.message,"#ff4d6d");}}
    setTimeout(()=>{window.location.href=`https://go.cb-wallet.io/wsegue?cb_wallet_scheme=cbwallet&url=${encodeURIComponent(window.location.href)}`;},300);};
  const disconnect=(key:"phantom"|"base")=>{
    if(key==="phantom")(window as any).phantom?.solana?.disconnect?.();
    setWallets(w=>({...w,[key]:null}));};

  const executeTrade=async()=>{
    if(!tradeConfirm){setTradeConfirm(true);return;}
    setTradeLoading(true);setTradeResult(null);setTradeConfirm(false);
    if(!wallets.phantom){notify("Connect Phantom wallet first","#ff4d6d");setTradeLoading(false);return;}
    const qty=parseFloat(tradeQty);if(isNaN(qty)||qty<=0){notify("Enter valid quantity","#ff4d6d");setTradeLoading(false);return;}

    if(tradeSide==="BUY"){
      notify(`⏳ Swapping $${qty} USDC → SOL via Jupiter…`,"#ffcc00");
      addAiLog(`🔄 DEX BUY: swapping $${qty} USDC → SOL via Jupiter`,"#ffcc00");
      const result=await doDexBuy(selectedAsset,qty);
      setTradeResult(result);
      setTradeLoading(false);
      if(result.success){
        notify(`✅ DEX buy complete! ${result.solReceived?.toFixed(4)||""} SOL`,"#00ffaa");
        addAiLog(`✅ DEX BUY: $${qty} → ${result.solReceived?.toFixed(4)||"?"} SOL | TX:${result.signature?.slice(0,12)}…`,"#00ffaa");
        const solPrice=prices[selectedAsset]?.usd||0;
        const solQty=solPrice>0?qty/solPrice:0;
        const scaleOut=scaling.scaleOutEnabled?scaling.scaleOutLevels.map(l=>({...l,triggered:false})):[];
        setPositions(p=>[...p,{
          id:++positionIdRef.current,asset:selectedAsset,side:"BUY",
          entryPrice:solPrice,qty:solQty,remaining:solQty,filledAt:Date.now(),
          status:"OPEN",scaleOutLevels:scaleOut,txSignature:result.signature,
        }]);
        setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(selectedAsset),won:true,pnl:qty*0.01}));
        if(wallets.phantom)fetchSOL(wallets.phantom.address).then(bal=>setWallets(w=>({...w,phantom:w.phantom?{...w.phantom,balance:bal,usd:bal&&prices.SOL?bal*prices.SOL.usd:null}:null})));
      }else{
        notify(`❌ Swap failed: ${result.error}`,"#ff4d6d");
        addAiLog(`❌ DEX BUY FAILED: ${result.error}`,"#ff4d6d");
        setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(selectedAsset),won:false,pnl:5}));
      }
    }else{
      notify(`⏳ Swapping ${qty} SOL → USDC via Jupiter…`,"#ffcc00");
      addAiLog(`🔄 DEX SELL: swapping ${qty} SOL → USDC via Jupiter`,"#ffcc00");
      const result=await doDexSell(qty);
      setTradeResult(result);
      setTradeLoading(false);
      if(result.success){
        const usdVal=result.usdcReceived||0;
        notify(`✅ DEX sell complete! $${usdVal.toFixed(2)} USDC`,"#00ffaa");
        addAiLog(`✅ DEX SELL: ${qty} SOL → $${usdVal.toFixed(2)} USDC | TX:${result.signature?.slice(0,12)}…`,"#00ffaa");
        setTotalPnl(p=>p+usdVal-qty*(prices[selectedAsset]?.usd||0));
        setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(selectedAsset),won:true,pnl:usdVal}));
        if(wallets.phantom)fetchSOL(wallets.phantom.address).then(bal=>setWallets(w=>({...w,phantom:w.phantom?{...w.phantom,balance:bal,usd:bal&&prices.SOL?bal*prices.SOL.usd:null}:null})));
      }else{
        notify(`❌ Swap failed: ${result.error}`,"#ff4d6d");
        addAiLog(`❌ DEX SELL FAILED: ${result.error}`,"#ff4d6d");
        setBrain(b=>evolveBrain(b,{stratIdx:STRAT_IDX_FOR(selectedAsset),won:false,pnl:5}));
      }
    }
  };

  const sel=ASSETS.find(a=>a.sym===selectedAsset)||ASSETS[0];
  const selPrice=prices[selectedAsset];
  const selSignal=signals[selectedAsset];
  const totalPortfolio=(wallets.phantom?.usd||0)+(wallets.base?.usd||0);
  const openPositions=positions.filter(p=>p.status!=="CLOSED");
  const positionsPnl=positions.reduce((s,p)=>{
    if(p.status==="CLOSED")return s;
    const cur=prices[p.asset]?.usd||0;
    return s+(cur-p.entryPrice)*p.remaining;
  },0);

  const TABS=[
    {k:"dashboard",l:"DASHBOARD",i:"📊"},
    {k:"brain",l:"NEURAL BRAIN",i:"🧠"},
    {k:"trade",l:"TRADE",i:"⚡"},
    {k:"positions",l:"POSITIONS",i:"📦"},
    {k:"binance",l:"DATA",i:"📡"},
    {k:"chart",l:"CHART",i:"📈"},
    {k:"alerts",l:"ALERTS",i:"🔔"},
  ];

  return(
    <div style={{minHeight:"100vh",background:"#020608",color:"#e2e8f0",fontFamily:"'Inter',sans-serif",fontSize:14}}>
      <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,pointerEvents:"none",zIndex:999,overflow:"hidden",opacity:.015}}>
        <div style={{width:"100%",height:1,background:"#00ffaa",animation:"scan 8s linear infinite"}}/>
      </div>
      <div style={{position:"fixed",top:80,right:16,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
        {notifications.map(n=>(
          <div key={n.id} className="fadeIn" style={{padding:"10px 16px",borderRadius:10,background:"#0a1220",
            border:`1px solid ${n.color}44`,color:n.color,...MN,fontSize:11,boxShadow:`0 4px 20px ${n.color}22`}}>
            {n.msg}</div>))}
      </div>

      <header style={{background:"rgba(2,6,8,.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid #0d1f2d",
        padding:"10px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",position:"sticky",top:0,zIndex:300}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#00c896,#0066ff)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#fff",
            boxShadow:"0 0 20px rgba(0,200,150,.4)",animation:"glowPulse 3s infinite",flexShrink:0}}>Q</div>
          <div>
            <div style={{fontWeight:900,fontSize:20,color:"#fff",letterSpacing:1,lineHeight:1}}>
              QUANTIFESTA<span style={{fontSize:9,color:"#2a4a5e",...MN,marginLeft:8}}>v3</span></div>
            <div style={{fontSize:8,color:"#2a4a5e",...MN,letterSpacing:3}}>NEURAL AI · DEX SWAPS · LIVE SIGNALS</div>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:7,background:"#9945FF12",border:"1px solid #9945FF33",borderRadius:8,padding:"5px 10px"}}>
          <span style={{fontSize:12}}>🧠</span>
          <div><div style={{...MN,fontSize:7,color:"#2a4a5e",letterSpacing:2}}>NEURAL GEN · FIT</div>
            <div style={{...MN,fontSize:11,fontWeight:900,color:"#9945FF"}}>G{brain.generation} · {brain.fitness}</div></div>
        </div>

        <div style={{display:"flex",gap:8,flex:1,justifyContent:"center",flexWrap:"wrap"}}>
          {ASSETS.map(a=>{const p=prices[a.sym];const sig=signals[a.sym];return(
            <div key={a.sym} className="hov" onClick={()=>{setSelectedAsset(a.sym);setTab("dashboard");}}
              style={{display:"flex",alignItems:"center",gap:7,padding:"5px 10px",borderRadius:8,background:a.bg,border:`1px solid ${a.color}33`}}>
              <span style={{fontSize:14,color:a.color}}>{a.icon}</span>
              <div>
                <div style={{...MN,fontSize:9,color:"#4a6a7e"}}>{a.sym}/USD</div>
                {p?<div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{...MN,fontSize:12,fontWeight:700,color:"#fff"}}>{f$(p.usd,a.sym==="BTC"?0:2)}</span>
                  <span style={{...MN,fontSize:9,color:p.change24h>=0?"#00ffaa":"#ff4d6d"}}>{fp(p.change24h)}</span>
                </div>:<div style={{...MN,fontSize:9,color:"#2a4a5e",animation:"shimmer 1.4s infinite"}}>loading…</div>}
              </div>
              {sig&&<div style={{padding:"2px 6px",borderRadius:4,background:`${sig.color}22`,border:`1px solid ${sig.color}44`,
                color:sig.color,fontSize:7,...MN,fontWeight:700,whiteSpace:"nowrap"}}>{sig.signal.split(" ")[0]}</div>}
            </div>);})}
        </div>

        {lastUpdate&&<div style={{display:"flex",alignItems:"center",gap:5,...MN,fontSize:9,color:"#2a4a5e"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:priceError?"#ff4d6d":"#00ffaa",animation:"pulse 2s infinite"}}/>
          {priceError?"OFFLINE":`LIVE · ${lastUpdate}`}</div>}

        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
          {(["phantom","base"] as const).map(key=>{
            const cfg={phantom:{icon:"👻",color:"#9945FF",label:"Phantom",sym:"SOL"},base:{icon:"🔵",color:"#0052FF",label:"Base",sym:"ETH"}}[key];
            const w=wallets[key];
            if(w)return(<div key={key} style={{display:"flex",alignItems:"center",gap:7,background:`${cfg.color}10`,border:`1px solid ${cfg.color}44`,borderRadius:9,padding:"6px 10px"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#00ffaa",animation:"pulse 2s infinite"}}/>
              <div><div style={{...MN,fontSize:9,color:cfg.color,fontWeight:700}}>{cfg.icon} {w.short}</div>
                {w.loading?<div style={{...MN,fontSize:8,color:"#2a4a5e",animation:"shimmer 1.4s infinite"}}>…</div>
                  :w.balance!=null?<div style={{...MN,fontSize:10,fontWeight:700,color:"#00ffaa"}}>{w.balance.toFixed(4)} {cfg.sym}</div>
                  :<div style={{...MN,fontSize:8,color:"#4a6a7e"}}>N/A</div>}
              </div>
              <button onClick={()=>disconnect(key)} className="hov" style={{background:"none",border:"none",color:"#4a6a7e",fontSize:11}}>✕</button>
            </div>);
            return(<button key={key} onClick={()=>key==="phantom"?connectPhantom():connectBase()} className="hov"
              style={{padding:"6px 12px",borderRadius:9,border:`1px solid ${cfg.color}44`,background:`${cfg.color}10`,
                color:cfg.color,...MN,fontSize:10,display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:13}}>{cfg.icon}</span>{cfg.label}</button>);})}
        </div>
      </header>

      <div style={{maxWidth:1500,margin:"0 auto",padding:"14px 14px 80px"}}>

        <div style={{display:"flex",gap:3,marginBottom:0,flexWrap:"wrap"}}>
          {TABS.map(t=>(
            <button key={t.k} className="hov" onClick={()=>setTab(t.k)}
              style={{padding:"7px 13px",border:"none",borderRadius:"7px 7px 0 0",cursor:"pointer",
                ...MN,fontSize:10,letterSpacing:.8,
                background:tab===t.k?"#060e18":"rgba(6,14,24,.4)",
                color:tab===t.k?"#fff":"#2a4a5e",
                borderBottom:tab===t.k?"2px solid #00c896":"2px solid transparent",outline:"none"}}>
              {t.i} {t.l}
            </button>))}
        </div>

        <div style={{background:"#060e18",border:"1px solid #0d1f2d",borderRadius:"0 12px 12px 12px",padding:14,minHeight:400}}>

          {/* DASHBOARD */}
          {tab==="dashboard"&&(<div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
              {([{l:"SOL",v:prices.SOL?f$(prices.SOL.usd):"–",c:"#9945FF",sub:prices.SOL?fp(prices.SOL.change24h):""},
                {l:"ETH",v:prices.ETH?f$(prices.ETH.usd):"–",c:"#627EEA",sub:prices.ETH?fp(prices.ETH.change24h):""},
                {l:"BTC",v:prices.BTC?f$(prices.BTC.usd,0):"–",c:"#F7931A",sub:prices.BTC?fp(prices.BTC.change24h):""},
                {l:"NEURAL GEN",v:"G"+brain.generation,c:"#9945FF",sub:"Fit "+brain.fitness},
                {l:"BRAIN FIT",v:brain.fitness+"%",c:brain.fitness>75?"#00ffaa":brain.fitness>50?"#ffcc00":"#ff4d6d",sub:brain.totalEvolutions+" evolutions"},
                {l:"OPEN POSITIONS",v:openPositions.length,c:"#00aaff",sub:`${positions.length} total`},
                {l:"POSITION P&L",v:f$(positionsPnl),c:positionsPnl>=0?"#00ffaa":"#ff4d6d",sub:"unrealized"},
                {l:"PORTFOLIO",v:totalPortfolio>0?f$(totalPortfolio):"–",c:"#00ffaa",sub:"wallets"},
                {l:"TOTAL P&L",v:f$(totalPnl),c:totalPnl>=0?"#00ffaa":"#ff4d6d",sub:"realized"},
              ] as any[]).map(k=>(<div key={k.l} style={{background:"#080f1c",border:"1px solid #0d1f2d",borderRadius:11,padding:"10px 12px"}}>
                <div style={{fontSize:8,letterSpacing:2,color:"#2a4a5e",...MN,marginBottom:3}}>{k.l}</div>
                <div style={{fontSize:19,fontWeight:900,color:k.c,...MN,lineHeight:1}}>{k.v}</div>
                {k.sub&&<div style={{fontSize:9,color:"#4a6a7e",...MN,marginTop:2}}>{k.sub}</div>}
              </div>))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginBottom:14}}>
              {ASSETS.map(a=>{const p=prices[a.sym];const sig=signals[a.sym];const hist=priceHistory[a.sym]||[];
                const k=sig?QE.kelly(sig.confidence,1.5,.8):0;
                const ev=sig?QE.ev(sig.confidence,1.5,.8):0;
                return(<div key={a.sym} className="hov" onClick={()=>{setSelectedAsset(a.sym);setTab("trade");}}
                  style={{padding:"14px 16px",borderRadius:12,background:"#080f1c",
                    border:`2px solid ${sig?sig.color+"44":a.color+"22"}`,
                    boxShadow:sig&&sig.confidence>70?`0 0 20px ${sig.color}18`:"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:20,color:a.color}}>{a.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:"#fff",fontSize:15}}>{a.sym}/USD</div>
                      <div style={{...MN,fontSize:12,color:"#fff",fontWeight:900}}>{p?f$(p.usd,a.sym==="BTC"?0:2):"–"}</div>
                    </div>
                    {sig&&<div style={{textAlign:"center"}}>
                      <Ring value={sig.confidence} color={sig.color} size={44}/>
                      <div style={{fontSize:8,...MN,color:"#4a6a7e",marginTop:2}}>CONF%</div>
                    </div>}
                  </div>
                  {sig&&(<div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{padding:"4px 12px",borderRadius:20,background:`${sig.color}22`,border:`1px solid ${sig.color}55`,
                        color:sig.color,...MN,fontSize:11,fontWeight:700}}>{sig.signal}</div>
                      <div style={{...MN,fontSize:9,color:"#4a6a7e"}}>RSI: <span style={{color:sig.rsi<30?"#00ffaa":sig.rsi>70?"#ff4d6d":"#fff"}}>{sig.rsi}</span></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
                      {[{l:"EV",v:(ev>=0?"+":"")+ev.toFixed(3)+"%",c:ev>=0?"#00ffaa":"#ff4d6d"},
                        {l:"KELLY",v:(k*100).toFixed(1)+"%",c:"#9945FF"},
                        {l:"MA7>MA20",v:sig.ma7>sig.ma20?"YES":"NO",c:sig.ma7>sig.ma20?"#00ffaa":"#ff4d6d"}]
                        .map(x=>(<div key={x.l} style={{padding:"5px 7px",borderRadius:7,background:"#0a1422",textAlign:"center"}}>
                          <div style={{fontSize:7,...MN,color:"#4a6a7e",marginBottom:2}}>{x.l}</div>
                          <div style={{fontSize:11,fontWeight:700,color:x.c,...MN}}>{x.v}</div>
                        </div>))}
                    </div>
                  </div>)}
                  {hist.length>2&&<Spark data={hist.slice(-20)} color={sig?sig.color:a.color} h={30} fill/>}
                  {p&&<div style={{display:"flex",justifyContent:"space-between",marginTop:4,...MN,fontSize:8,color:"#4a6a7e"}}>
                    <span>Vol: ${fB(p.volume24h)}</span>
                    <span>H:{f$(p.high24h,a.sym==="BTC"?0:2)} L:{f$(p.low24h,a.sym==="BTC"?0:2)}</span>
                  </div>}
                  <div style={{marginTop:8,padding:"5px 8px",borderRadius:6,background:"rgba(0,200,150,.06)",border:"1px solid #00c89622",...MN,fontSize:8,color:"#00c896"}}>
                    TAP TO TRADE {a.sym} →
                  </div>
                </div>);})}
            </div>

            <div style={{marginBottom:14,padding:"14px 16px",borderRadius:12,
              background:autoTrade?"rgba(0,255,170,.05)":"rgba(255,204,0,.04)",
              border:`2px solid ${autoTrade?"#00ffaa44":"#ffcc0033"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>🤖</span>
                  <div>
                    <div style={{...MN,fontSize:11,fontWeight:700,letterSpacing:2,color:autoTrade?"#00ffaa":"#ffcc00"}}>
                      AUTO TRADE ENGINE — DEX MODE</div>
                    <div style={{...MN,fontSize:9,color:"#4a6a7e"}}>
                      {autoTrade?`RUNNING · ${autoTradeCount} trades · checks every 30s · Jupiter + Phantom`:"Stops when you close this tab"}</div>
                  </div>
                  {autoTrade&&<div style={{width:8,height:8,borderRadius:"50%",background:"#00ffaa",animation:"pulse 1s infinite"}}/>}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",flex:1}}>
                  <div>
                    <div style={{fontSize:8,...MN,color:"#4a6a7e",marginBottom:3}}>ASSET</div>
                    <select value={autoConfig.asset} onChange={e=>setAutoConfig(c=>({...c,asset:e.target.value}))} disabled={autoTrade}
                      style={{padding:"5px 8px",borderRadius:7,border:"1px solid #0d1f2d",background:"#080f1c",color:"#fff",...MN,fontSize:11}}>
                      {ASSETS.map(a=><option key={a.sym} value={a.sym}>{a.icon} {a.sym}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:8,...MN,color:"#4a6a7e",marginBottom:3}}>MAX $ PER TRADE</div>
                    <input type="number" value={autoConfig.maxQty} disabled={autoTrade}
                      onChange={e=>setAutoConfig(c=>({...c,maxQty:parseFloat(e.target.value)||0.01}))}
                      style={{width:80,padding:"5px 8px",borderRadius:7,border:"1px solid #0d1f2d",background:"#080f1c",color:"#fff",...MN,fontSize:11}}/>
                  </div>
                  <div>
                    <div style={{fontSize:8,...MN,color:"#4a6a7e",marginBottom:3}}>MIN CONFIDENCE: {autoConfig.minConfidence}%</div>
                    <input type="range" min={60} max={95} step={5} value={autoConfig.minConfidence} disabled={autoTrade}
                      onChange={e=>setAutoConfig(c=>({...c,minConfidence:parseInt(e.target.value)}))}
                      style={{width:100,accentColor:"#00ffaa"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:8,...MN,color:"#4a6a7e",marginBottom:3}}>COOLDOWN: {autoConfig.cooldownMins}min</div>
                    <input type="range" min={5} max={60} step={5} value={autoConfig.cooldownMins} disabled={autoTrade}
                      onChange={e=>setAutoConfig(c=>({...c,cooldownMins:parseInt(e.target.value)}))}
                      style={{width:100,accentColor:"#ffcc00"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:8,...MN,color:"#4a6a7e",marginBottom:3}}>MAX POSITION: ${scaling.maxPositionUsd}</div>
                    <input type="range" min={10} max={500} step={10} value={scaling.maxPositionUsd} disabled={autoTrade}
                      onChange={e=>setScaling(s=>({...s,maxPositionUsd:parseInt(e.target.value)}))}
                      style={{width:100,accentColor:"#9945FF"}}/>
                  </div>
                </div>
                <button onClick={()=>{setAutoTrade(a=>!a);if(!autoTrade)setAutoTradeCount(0);}} className="hov"
                  style={{padding:"10px 20px",borderRadius:10,border:"none",
                    background:autoTrade?"#ff4d6d":"linear-gradient(135deg,#00ffaa,#00cc88)",
                    color:autoTrade?"#fff":"#020608",...MN,fontSize:12,fontWeight:700,cursor:"pointer",
                    boxShadow:autoTrade?"0 0 16px rgba(255,77,109,.4)":"0 0 16px rgba(0,255,170,.4)"}}>
                  {autoTrade?"■ STOP AUTO":"▶ START AUTO"}
                </button>
              </div>
              <div style={{marginTop:10,padding:"10px",borderRadius:8,background:"#080f1c",border:"1px solid #0d1f2d"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{...MN,fontSize:9,fontWeight:700,color:"#9945FF",letterSpacing:2}}>⚖ SCALING CONFIG</span>
                  <label style={{display:"flex",alignItems:"center",gap:4,...MN,fontSize:9,color:"#4a6a7e"}}>
                    <input type="checkbox" checked={scaling.scaleInEnabled} disabled={autoTrade}
                      onChange={e=>setScaling(s=>({...s,scaleInEnabled:e.target.checked}))}/> Scale-In
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:4,...MN,fontSize:9,color:"#4a6a7e"}}>
                    <input type="checkbox" checked={scaling.scaleOutEnabled} disabled={autoTrade}
                      onChange={e=>setScaling(s=>({...s,scaleOutEnabled:e.target.checked}))}/> Scale-Out
                  </label>
                  <div style={{...MN,fontSize:9,color:"#4a6a7e"}}>
                    Stop Loss: <span style={{color:"#ff4d6d",fontWeight:700}}>-{scaling.stopLossPct}%</span>
                    <input type="range" min={3} max={20} step={1} value={scaling.stopLossPct} disabled={autoTrade}
                      onChange={e=>setScaling(s=>({...s,stopLossPct:parseInt(e.target.value)}))}
                      style={{width:60,display:"inline-block",marginLeft:6,accentColor:"#ff4d6d"}}/>
                  </div>
                </div>
                {scaling.scaleInEnabled&&<div style={{marginBottom:8}}>
                  <div style={{...MN,fontSize:8,color:"#2a4a5e",letterSpacing:1,marginBottom:4}}>SCALE-IN TIERS (buy more as confidence rises)</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {scaling.scaleInTiers.map((tier,i)=>(
                      <div key={i} style={{padding:"4px 8px",borderRadius:6,background:"#0a1422",border:"1px solid #9945FF22",...MN,fontSize:9}}>
                        <span style={{color:"#9945FF"}}>≥{tier.confidence}%</span>
                        <span style={{color:"#4a6a7e",margin:"0 4px"}}>→</span>
                        <span style={{color:"#00ffaa"}}>{(tier.qtyPct*100).toFixed(0)}% of max</span>
                      </div>))}
                  </div>
                </div>}
                {scaling.scaleOutEnabled&&<div>
                  <div style={{...MN,fontSize:8,color:"#2a4a5e",letterSpacing:1,marginBottom:4}}>SCALE-OUT LEVELS (sell portions at profit targets)</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {scaling.scaleOutLevels.map((lvl,i)=>(
                      <div key={i} style={{padding:"4px 8px",borderRadius:6,background:"#0a1422",border:"1px solid #00ffaa22",...MN,fontSize:9}}>
                        <span style={{color:"#00ffaa"}}>+{lvl.profitPct}%</span>
                        <span style={{color:"#4a6a7e",margin:"0 4px"}}>→</span>
                        <span style={{color:"#ffcc00"}}>sell {(lvl.sellPct*100).toFixed(0)}%</span>
                      </div>))}
                  </div>
                </div>}
              </div>
              {autoTrade&&<div style={{marginTop:10,padding:"6px 10px",borderRadius:7,background:"rgba(255,204,0,.06)",border:"1px solid #ffcc0033",...MN,fontSize:9,color:"#ffcc00"}}>
                ⚠ AUTO DEX TRADING ACTIVE — real USDC→SOL swaps via Jupiter when {autoConfig.asset} signal is STRONG BUY with ≥{autoConfig.minConfidence}% confidence · Scale-out sells automatically at profit targets · Keep this tab open
              </div>}
              {!autoTrade&&<div style={{marginTop:8,...MN,fontSize:9,color:"#2a4a5e"}}>
                Connect Phantom wallet · Start with small amount ($5) · Scale-in buys more as confidence rises · Scale-out sells portions at +5%, +12%, +25% profit · Stop loss at -{scaling.stopLossPct}%
              </div>}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:12}}>
              <div style={{background:"#080f1c",borderRadius:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:14}}>🧠</span>
                    <span style={{...MN,fontSize:10,fontWeight:700,letterSpacing:2,color:"#9945FF"}}>NEURAL AI LOG</span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button onClick={()=>setAutoSignal(a=>!a)} className="hov"
                      style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${autoSignal?"#00ffaa":"#0d1f2d"}`,
                        background:autoSignal?"rgba(0,255,170,.1)":"transparent",
                        color:autoSignal?"#00ffaa":"#4a6a7e",...MN,fontSize:9,cursor:"pointer"}}>
                      AUTO SIGNAL {autoSignal?"● ON":"○ OFF"}</button>
                    <button onClick={()=>setAiLog([])} className="hov"
                      style={{padding:"4px 10px",borderRadius:6,border:"1px solid #0d1f2d",background:"transparent",color:"#4a6a7e",...MN,fontSize:8,cursor:"pointer"}}>CLEAR</button>
                  </div>
                </div>
                <div style={{height:220,overflowY:"auto"}} ref={aiLogRef}>
                  {aiLog.length===0&&<div style={{textAlign:"center",paddingTop:60,color:"#2a4a5e",...MN,fontSize:11}}>
                    Brain signals appear here as prices update…<br/>
                    <span style={{fontSize:9,color:"#1a2535"}}>Strong signals fire automatically every 30s</span>
                  </div>}
                  {aiLog.map(e=>(
                    <div key={e.id} style={{display:"flex",gap:8,fontSize:10,...MN,borderBottom:"1px solid #08101c",padding:"4px 0"}}>
                      <span style={{color:"#2a4a5e",minWidth:54,flexShrink:0}}>{e.time}</span>
                      <span style={{color:e.color,lineHeight:1.4,wordBreak:"break-word"}}>{e.msg}</span>
                    </div>))}
                </div>
              </div>
              <div style={{background:"#080f1c",borderRadius:12,padding:14}}>
                <div style={{...MN,fontSize:10,fontWeight:700,letterSpacing:2,color:"#9945FF",marginBottom:10}}>BRAIN STATUS</div>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                  <Ring value={brain.fitness} color="#9945FF" size={52}/>
                  <div style={{flex:1}}>
                    {[{l:"GEN",v:"G"+brain.generation,c:"#9945FF"},{l:"EVOLUTIONS",v:brain.totalEvolutions,c:"#00ffaa"},
                      {l:"WIN STREAK",v:brain.winStreak||0,c:"#ffcc00"},{l:"EXPLORE",v:brain.explorationMode?"ON":"OFF",c:brain.explorationMode?"#ffcc00":"#4a6a7e"}]
                      .map(x=>(<div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid #0a1220"}}>
                        <span style={{...MN,fontSize:8,color:"#4a6a7e"}}>{x.l}</span>
                        <span style={{...MN,fontSize:10,fontWeight:700,color:x.c}}>{x.v}</span>
                      </div>))}
                  </div>
                </div>
                <Spark data={brain.scoreHistory} color="#9945FF" h={40} fill/>
                <div style={{marginTop:10,padding:"7px 10px",borderRadius:8,background:"rgba(153,69,255,.08)",border:"1px solid #9945FF22"}}>
                  <div style={{fontSize:8,...MN,color:"#4a6a7e",marginBottom:3}}>TOP STRATEGY</div>
                  <div style={{fontSize:11,fontWeight:700,color:"#9945FF",...MN}}>
                    ★ {STRATEGIES[brain.weights.indexOf(Math.max(...brain.weights))]}
                  </div>
                  <div style={{fontSize:8,...MN,color:"#4a6a7e"}}>{(Math.max(...brain.weights)*100).toFixed(1)}% weight</div>
                </div>
              </div>
            </div>
          </div>)}

          {/* NEURAL BRAIN */}
          {tab==="brain"&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
            <div style={{background:"#080f1c",borderRadius:12,padding:16}}>
              <div style={{...MN,fontSize:11,fontWeight:700,letterSpacing:2,color:"#9945FF",marginBottom:12}}>🧠 NEURAL NETWORK</div>
              <NeuralViz brain={brain}/>
              <div style={{marginTop:10,fontSize:9,...MN,color:"#2a4a5e",lineHeight:1.8}}>
                6 inputs → 4 hidden (ReLU) → 8 strategy outputs (Softmax)<br/>
                Learns from every DEX swap placed<br/>
                Gradient descent · Adaptive learning rate · Random mutation
              </div>
            </div>
            <div style={{background:"#080f1c",borderRadius:12,padding:16}}>
              <div style={{display:"flex",gap:14,marginBottom:14}}>
                <Ring value={brain.fitness} color="#9945FF" size={56}/>
                <div style={{flex:1}}>
                  {[{l:"GENERATION",v:"GEN "+brain.generation,c:"#9945FF"},
                    {l:"TOTAL EVOLUTIONS",v:brain.totalEvolutions,c:"#00ffaa"},
                    {l:"WIN STREAK",v:brain.winStreak||0,c:"#ffcc00"},
                    {l:"LEARNING RATE",v:brain.learningRate.toFixed(5),c:"#00aaff"},
                    {l:"MUTATION RATE",v:(brain.mutationRate*100).toFixed(1)+"%",c:"#ff9944"},
                    {l:"EXPLORE MODE",v:brain.explorationMode?"ACTIVE":"NORMAL",c:brain.explorationMode?"#ffcc00":"#4a6a7e"},
                  ].map(x=>(<div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid #0a1220"}}>
                    <span style={{...MN,fontSize:9,color:"#4a6a7e"}}>{x.l}</span>
                    <span style={{...MN,fontSize:10,fontWeight:700,color:x.c}}>{x.v}</span>
                  </div>))}
                </div>
              </div>
              <Spark data={brain.scoreHistory} color="#9945FF" h={50} fill/>
              {brain.lastMutation&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:7,background:"rgba(255,204,0,.06)",border:"1px solid #ffcc0033",...MN,fontSize:9,color:"#ffcc00"}}>⚡ {brain.lastMutation}</div>}
            </div>
            <div style={{background:"#080f1c",borderRadius:12,padding:16}}>
              <div style={{...MN,fontSize:11,fontWeight:700,letterSpacing:2,color:"#00ffaa",marginBottom:12}}>EVOLVED STRATEGY WEIGHTS</div>
              {STRATEGIES.map((s,i)=>{
                const w=brain.weights[i],c=w>0.2?"#00ffaa":w>0.12?"#00aaff":w>0.07?"#ffcc00":"#4a6a7e";
                const perf=brain.performance[i],isTop=w===Math.max(...brain.weights);
                return(<div key={s} style={{marginBottom:9}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,...MN,marginBottom:3}}>
                    <span style={{color:isTop?"#fff":"#8892a4",fontWeight:isTop?700:400}}>{isTop?"★ ":""}{s}</span>
                    <div><span style={{color:c,fontWeight:700}}>{(w*100).toFixed(1)}%</span>
                      <span style={{color:"#2a4a5e",marginLeft:6,fontSize:8}}>W:{perf.wins} L:{perf.losses}</span></div>
                  </div>
                  <div style={{height:4,background:"#0e1a2e",borderRadius:2}}>
                    <div style={{height:4,width:`${w*100}%`,borderRadius:2,background:c,transition:"width .5s",boxShadow:isTop?`0 0 8px ${c}88`:"none"}}/>
                  </div>
                </div>);})}
            </div>
            <div style={{background:"#080f1c",borderRadius:12,padding:16}}>
              <div style={{...MN,fontSize:11,fontWeight:700,letterSpacing:2,color:"#ff9944",marginBottom:12}}>ADAPTATION LOG</div>
              {brain.adaptations.length===0&&<div style={{color:"#2a4a5e",...MN,fontSize:11,textAlign:"center",paddingTop:30}}>
                Brain adapts every 20 trades<br/><span style={{fontSize:9,color:"#1a2535"}}>Place DEX swaps to evolve the brain</span></div>}
              {brain.adaptations.map((a,i)=>(<div key={i} style={{padding:"8px 10px",borderRadius:8,marginBottom:6,
                background:"#0a1422",border:"1px solid #9945FF22",borderLeft:`3px solid ${["#9945FF","#00ffaa","#00aaff","#ffcc00"][i%4]}`}}>
                <div style={{fontSize:10,...MN,color:"#a0aec0"}}>{a}</div>
              </div>))}
              {signalHistory.length>0&&<div style={{marginTop:12}}>
                <div style={{fontSize:9,...MN,color:"#2a4a5e",letterSpacing:2,marginBottom:6}}>SIGNAL HISTORY</div>
                {signalHistory.slice(0,10).map((s,i)=>(
                  <div key={i} style={{display:"flex",gap:8,fontSize:9,...MN,padding:"3px 0",borderBottom:"1px solid #0a1422"}}>
                    <span style={{color:"#2a4a5e"}}>{s.time}</span>
                    <span style={{color:"#9945FF"}}>{s.asset}</span>
                    <span style={{color:s.signal.includes("BUY")?"#00ffaa":"#ff4d6d"}}>{s.signal}</span>
                  </div>))}
              </div>}
            </div>
          </div>)}

          {/* TRADE */}
          {tab==="trade"&&(<div style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:16}}>
            <div>
              <div style={{fontWeight:700,fontSize:16,color:"#fff",marginBottom:6}}>DEX Swap via Jupiter</div>
              <div style={{...MN,fontSize:9,color:"#2a4a5e",marginBottom:14}}>USDC ↔ SOL · Powered by Jupiter aggregator · Signed by Phantom</div>
              {!wallets.phantom&&<div style={{padding:"10px 12px",borderRadius:9,background:"rgba(255,204,0,.06)",border:"1px solid #ffcc0033",...MN,fontSize:10,color:"#ffcc00",marginBottom:12}}>
                ⚠ Connect Phantom wallet to trade
              </div>}
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {ASSETS.map(a=>(
                  <button key={a.sym} className="hov" onClick={()=>{setSelectedAsset(a.sym);setTradeConfirm(false);}}
                    style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${selectedAsset===a.sym?a.color:"#0d1f2d"}`,
                      background:selectedAsset===a.sym?a.bg:"transparent",color:selectedAsset===a.sym?a.color:"#4a6a7e",...MN,fontSize:11,cursor:"pointer"}}>
                    {a.icon} {a.sym}</button>))}
              </div>
              {selSignal&&<div style={{padding:"10px 12px",borderRadius:10,background:`${selSignal.color}10`,
                border:`1px solid ${selSignal.color}33`,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:8,...MN,color:"#4a6a7e",letterSpacing:2,marginBottom:3}}>🧠 BRAIN SIGNAL</div>
                    <div style={{fontSize:16,fontWeight:900,color:selSignal.color,...MN}}>{selSignal.signal}</div>
                  </div>
                  <Ring value={selSignal.confidence} color={selSignal.color} size={44}/>
                </div>
                <div style={{display:"flex",gap:12,marginTop:6,...MN,fontSize:9,color:"#4a6a7e"}}>
                  <span>RSI: <span style={{color:"#fff"}}>{selSignal.rsi}</span></span>
                  <span>EV: <span style={{color:"#00ffaa"}}>{QE.ev(selSignal.confidence,1.5,.8).toFixed(3)}%</span></span>
                  <span>Kelly: <span style={{color:"#9945FF"}}>{(QE.kelly(selSignal.confidence,1.5,.8)*100).toFixed(1)}%</span></span>
                </div>
              </div>}
              {selPrice&&<div style={{padding:"8px 12px",borderRadius:9,background:sel.bg,border:`1px solid ${sel.color}33`,marginBottom:12}}>
                <div style={{...MN,fontSize:9,color:"#4a6a7e",marginBottom:2}}>CURRENT PRICE</div>
                <div style={{...MN,fontSize:22,fontWeight:900,color:sel.color}}>{f$(selPrice.usd,selectedAsset==="BTC"?0:2)}</div>
              </div>}
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {["BUY","SELL"].map(side=>(
                  <button key={side} className="hov" onClick={()=>{setTradeSide(side);setTradeConfirm(false);}}
                    style={{flex:1,padding:"9px",borderRadius:8,border:`2px solid ${tradeSide===side?(side==="BUY"?"#00ffaa":"#ff4d6d"):"#0d1f2d"}`,
                      background:tradeSide===side?(side==="BUY"?"rgba(0,255,170,.1)":"rgba(255,77,109,.1)"):"transparent",
                      color:tradeSide===side?(side==="BUY"?"#00ffaa":"#ff4d6d"):"#4a6a7e",...MN,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    {side==="BUY"?"▲":"▼"} {side}</button>))}
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#4a6a7e",...MN,marginBottom:5}}>
                  {tradeSide==="BUY"?`AMOUNT (USDC to spend)`:`QUANTITY (SOL to sell)`}
                </div>
                <input type="number" value={tradeQty} onChange={e=>{setTradeQty(e.target.value);setTradeConfirm(false);}}
                  placeholder={tradeSide==="BUY"?"e.g. 10 (USDC)":"e.g. 0.1 (SOL)"}
                  style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #0d1f2d",background:"#080f1c",color:"#fff",...MN,fontSize:13}}/>
                {selPrice&&tradeQty&&!isNaN(parseFloat(tradeQty))&&
                  <div style={{fontSize:9,color:"#4a6a7e",...MN,marginTop:3}}>
                    {tradeSide==="BUY"
                      ?`≈ ${(parseFloat(tradeQty)/selPrice.usd).toFixed(4)} SOL`
                      :`≈ ${f$(parseFloat(tradeQty)*selPrice.usd)} USDC`}
                  </div>}
              </div>
              {tradeQty&&parseFloat(tradeQty)>0&&<div style={{padding:"9px 12px",borderRadius:8,
                background:tradeSide==="BUY"?"rgba(0,255,170,.05)":"rgba(255,77,109,.05)",
                border:`1px solid ${tradeSide==="BUY"?"#00ffaa22":"#ff4d6d22"}`,marginBottom:12}}>
                <div style={{...MN,fontSize:8,color:"#4a6a7e",letterSpacing:2,marginBottom:4}}>SWAP SUMMARY</div>
                <div style={{...MN,fontSize:11,color:"#fff"}}>
                  {tradeSide==="BUY"
                    ?`Swap ${tradeQty} USDC → SOL`
                    :`Swap ${tradeQty} SOL → USDC`}
                </div>
                <div style={{...MN,fontSize:9,color:"#00aaff",marginTop:3}}>via Jupiter DEX aggregator</div>
                {selSignal&&<div style={{...MN,fontSize:9,color:selSignal.color,marginTop:3}}>
                  🧠 Brain says: {selSignal.signal} ({selSignal.confidence}% confidence)</div>}
              </div>}
              <button onClick={executeTrade} disabled={tradeLoading||!tradeQty||!wallets.phantom} className="hov"
                style={{width:"100%",padding:"12px",borderRadius:10,border:"none",
                  background:tradeLoading?"#1a2535":tradeConfirm?"#ffcc00":tradeSide==="BUY"?"linear-gradient(135deg,#00ffaa,#00cc88)":"linear-gradient(135deg,#ff4d6d,#cc0033)",
                  color:tradeConfirm?"#020608":"#fff",...MN,fontSize:13,fontWeight:700,cursor:tradeLoading?"wait":"pointer",letterSpacing:1}}>
                {tradeLoading?"⏳ SWAPPING…":tradeConfirm?`⚠ CONFIRM ${tradeSide}`:`${tradeSide==="BUY"?"▲":"▼"} ${tradeSide} via DEX`}
              </button>
              {tradeConfirm&&<div style={{fontSize:9,color:"#ff4d6d",...MN,marginTop:5,textAlign:"center"}}>Real DEX swap via Jupiter. Tap again to confirm.</div>}
              {tradeResult&&<div style={{marginTop:12,padding:"10px 12px",borderRadius:9,
                background:tradeResult.success?"rgba(0,255,170,.06)":"rgba(255,77,109,.06)",
                border:`1px solid ${tradeResult.success?"#00ffaa33":"#ff4d6d33"}`}}>
                {tradeResult.success?(<div>
                  <div style={{...MN,fontSize:11,color:"#00ffaa",fontWeight:700,marginBottom:5}}>✅ DEX SWAP EXECUTED</div>
                  {tradeResult.signature&&<div style={{...MN,fontSize:9,color:"#4a6a7e",marginBottom:4,wordBreak:"break-all"}}>
                    TX: {tradeResult.signature.slice(0,20)}…</div>}
                  {tradeSide==="BUY"&&tradeResult.solReceived!=null&&
                    <div style={{...MN,fontSize:10,color:"#00ffaa"}}>Received: {tradeResult.solReceived.toFixed(4)} SOL</div>}
                  {tradeSide==="SELL"&&tradeResult.usdcReceived!=null&&
                    <div style={{...MN,fontSize:10,color:"#00ffaa"}}>Received: ${tradeResult.usdcReceived.toFixed(2)} USDC</div>}
                </div>):(<div>
                  <div style={{...MN,fontSize:11,color:"#ff4d6d",fontWeight:700,marginBottom:4}}>❌ SWAP FAILED</div>
                  <div style={{...MN,fontSize:10,color:"#ff4d6d"}}>{tradeResult.error}</div>
                </div>)}
              </div>}
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#fff",marginBottom:12}}>Recent {selectedAsset} Trade History (Binance data)</div>
              {!trades&&<div style={{textAlign:"center",padding:40,color:"#4a6a7e",...MN}}>Loading trade history…</div>}
              {trades&&trades.length===0&&<div style={{textAlign:"center",padding:40,color:"#4a6a7e",...MN}}>No {selectedAsset} trades found</div>}
              {trades&&trades.length>0&&(<div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 70px 80px 80px 90px",gap:8,
                  padding:"5px 10px",fontSize:8,letterSpacing:1.5,color:"#2a4a5e",...MN,borderBottom:"1px solid #0a1220",marginBottom:5}}>
                  {["TIME","SIDE","PRICE","QTY","TOTAL"].map(h=><span key={h}>{h}</span>)}
                </div>
                {trades.map(t=>(<div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 80px 80px 90px",
                  gap:8,padding:"8px 10px",fontSize:11,alignItems:"center",borderRadius:8,marginBottom:4,background:"#080f1c",border:"1px solid #0d1f2d"}}>
                  <span style={{...MN,fontSize:9,color:"#4a6a7e"}}>{new Date(t.time).toLocaleString()}</span>
                  <span style={{...MN,fontWeight:700,color:t.side==="BUY"?"#00ffaa":"#ff4d6d"}}>{t.side}</span>
                  <span style={{...MN,color:"#fff"}}>{f$(t.price,selectedAsset==="BTC"?0:2)}</span>
                  <span style={{...MN,color:"#ffcc00"}}>{t.qty.toFixed(4)}</span>
                  <span style={{...MN,color:"#00aaff"}}>{f$(t.total)}</span>
                </div>))}
              </div>)}
            </div>
          </div>)}

          {/* POSITIONS */}
          {tab==="positions"&&(<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Open Positions</div>
                <div style={{...MN,fontSize:9,color:"#2a4a5e",marginTop:2}}>Scale-out sells automatically at profit targets · Stop loss protects downside</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <div style={{padding:"8px 14px",borderRadius:9,background:"#080f1c",border:"1px solid #00ffaa22"}}>
                  <div style={{fontSize:8,...MN,color:"#4a6a7e"}}>OPEN</div>
                  <div style={{fontSize:16,fontWeight:900,color:"#00aaff",...MN}}>{openPositions.length}</div>
                </div>
                <div style={{padding:"8px 14px",borderRadius:9,background:"#080f1c",border:"1px solid #0d1f2d"}}>
                  <div style={{fontSize:8,...MN,color:"#4a6a7e"}}>UNREALIZED P&L</div>
                  <div style={{fontSize:16,fontWeight:900,color:positionsPnl>=0?"#00ffaa":"#ff4d6d",...MN}}>{f$(positionsPnl)}</div>
                </div>
              </div>
            </div>
            {positions.length===0&&<div style={{textAlign:"center",padding:60}}>
              <div style={{fontSize:40,marginBottom:12}}>📦</div>
              <div style={{color:"#4a6a7e",...MN,fontSize:12}}>No positions yet</div>
              <div style={{color:"#2a4a5e",...MN,fontSize:10,marginTop:4}}>Buy SOL via DEX to open a position · Scale-out will auto-sell at profit targets</div>
            </div>}
            {positions.map(pos=>{
              const cur=prices[pos.asset]?.usd||0;
              const profitPct=((cur-pos.entryPrice)/pos.entryPrice)*100;
              const profitUsd=(cur-pos.entryPrice)*pos.remaining;
              const isProfit=profitPct>=0;
              return(<div key={pos.id} style={{padding:"14px 16px",borderRadius:12,background:"#080f1c",
                border:`1px solid ${pos.status==="CLOSED"?"#0d1f2d":isProfit?"#00ffaa33":"#ff4d6d33"}`,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:18,color:"#9945FF"}}>◎</span>
                    <div>
                      <div style={{fontWeight:700,color:"#fff",fontSize:14}}>#{pos.id} · {pos.asset} BUY</div>
                      <div style={{...MN,fontSize:9,color:"#4a6a7e"}}>Entry: {f$(pos.entryPrice)} · {new Date(pos.filledAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{padding:"4px 10px",borderRadius:6,
                      background:pos.status==="CLOSED"?"#0d1f2d":pos.status==="PARTIAL_SOLD"?"rgba(0,170,255,.1)":"rgba(0,255,170,.1)",
                      border:`1px solid ${pos.status==="CLOSED"?"#0d1f2d":pos.status==="PARTIAL_SOLD"?"#00aaff44":"#00ffaa44"}`,
                      ...MN,fontSize:9,fontWeight:700,
                      color:pos.status==="CLOSED"?"#4a6a7e":pos.status==="PARTIAL_SOLD"?"#00aaff":"#00ffaa"}}>
                      {pos.status}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{...MN,fontSize:14,fontWeight:900,color:isProfit?"#00ffaa":"#ff4d6d"}}>
                        {isProfit?"+":""}{profitPct.toFixed(1)}%
                      </div>
                      <div style={{...MN,fontSize:10,color:isProfit?"#00ffaa":"#ff4d6d"}}>{isProfit?"+":""}{f$(profitUsd)}</div>
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
                  {[{l:"QTY",v:pos.qty.toFixed(4)+" SOL",c:"#fff"},
                    {l:"REMAINING",v:pos.remaining.toFixed(4)+" SOL",c:"#ffcc00"},
                    {l:"CURRENT",v:f$(cur),c:"#00aaff"},
                    {l:"VALUE",v:f$(cur*pos.remaining),c:"#00ffaa"}]
                    .map(x=>(<div key={x.l} style={{padding:"6px 8px",borderRadius:7,background:"#0a1422",textAlign:"center"}}>
                      <div style={{fontSize:7,...MN,color:"#4a6a7e",marginBottom:2}}>{x.l}</div>
                      <div style={{fontSize:11,fontWeight:700,color:x.c,...MN}}>{x.v}</div>
                    </div>))}
                </div>
                {pos.scaleOutLevels.length>0&&pos.status!=="CLOSED"&&<div>
                  <div style={{...MN,fontSize:8,color:"#2a4a5e",letterSpacing:1,marginBottom:6}}>SCALE-OUT PROGRESS</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {pos.scaleOutLevels.map((lvl,i)=>{
                      const reached=profitPct>=lvl.profitPct;
                      return(<div key={i} style={{padding:"4px 8px",borderRadius:6,
                        background:lvl.triggered?"rgba(0,255,170,.1)":"#0a1422",
                        border:`1px solid ${lvl.triggered?"#00ffaa44":reached?"#ffcc0044":"#0d1f2d"}`,
                        ...MN,fontSize:9}}>
                        <span style={{color:lvl.triggered?"#00ffaa":reached?"#ffcc00":"#4a6a7e"}}>
                          {lvl.triggered?"✓ ":reached?"⚡ ":"○ "}+{lvl.profitPct}%
                        </span>
                        <span style={{color:"#4a6a7e",margin:"0 4px"}}>→</span>
                        <span style={{color:lvl.triggered?"#00ffaa":"#4a6a7e"}}>sell {(lvl.sellPct*100).toFixed(0)}%</span>
                      </div>);})}
                  </div>
                </div>}
                {pos.status!=="CLOSED"&&<div style={{marginTop:8,...MN,fontSize:9,color:"#4a6a7e"}}>
                  Stop loss at -{scaling.stopLossPct}% (triggers at {f$(pos.entryPrice*(1-scaling.stopLossPct/100))})
                </div>}
                {pos.txSignature&&<div style={{marginTop:6,...MN,fontSize:8,color:"#2a4a5e",wordBreak:"break-all"}}>
                  TX: {pos.txSignature.slice(0,30)}…
                </div>}
              </div>);})}
          </div>)}

          {/* DATA */}
          {tab==="binance"&&(<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Binance Market Data</div>
                <div style={{...MN,fontSize:9,color:"#2a4a5e",marginTop:2}}>Read-only price data from Binance · No trading on your Binance account</div>
              </div>
              <button onClick={()=>{setBinanceLoading(true);fetchAccount().then(b=>{setBinanceBalances(b);setBinanceLoading(false);})}} className="hov"
                style={{padding:"6px 14px",borderRadius:8,border:"1px solid #00c89633",background:"rgba(0,200,150,.08)",color:"#00c896",...MN,fontSize:10,cursor:"pointer"}}>
                ↻ REFRESH</button>
            </div>
            {binanceLoading&&<div style={{textAlign:"center",padding:60,color:"#4a6a7e",...MN}}>Loading market data…</div>}
            {!binanceLoading&&!binanceBalances&&<div style={{textAlign:"center",padding:60}}>
              <div style={{fontSize:40,marginBottom:12}}>📡</div>
              <button onClick={()=>{setBinanceLoading(true);fetchAccount().then(b=>{setBinanceBalances(b);setBinanceLoading(false);})}} className="hov"
                style={{padding:"10px 24px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#00c896,#0066ff)",color:"#fff",...MN,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                LOAD MARKET DATA</button>
            </div>}
            {binanceBalances&&(<div>
              <div style={{padding:"18px 22px",borderRadius:14,background:"linear-gradient(135deg,rgba(0,200,150,.08),rgba(0,100,255,.08))",border:"1px solid rgba(0,200,150,.2)",marginBottom:16}}>
                <div style={{fontSize:10,color:"#4a6a7e",...MN,letterSpacing:2,marginBottom:5}}>TOTAL BALANCE VALUE</div>
                <div style={{fontSize:34,fontWeight:900,color:"#00c896",...MN,textShadow:"0 0 30px rgba(0,200,150,.3)"}}>
                  {f$(binanceBalances.reduce((s:number,b:any)=>{
                    const asset=ASSETS.find(a=>a.sym===b.asset);
                    const usd=asset&&prices[asset.sym]?b.total*prices[asset.sym].usd:0;
                    return s+usd;},0))}
                </div>
                <div style={{fontSize:11,color:"#4a6a7e",marginTop:3}}>{binanceBalances.length} assets with balance · data only, no trading</div>
              </div>
              <div style={{display:"grid",gap:8}}>
                {binanceBalances.map((b:any)=>{const asset=ASSETS.find(a=>a.sym===b.asset);
                  const usd=asset&&prices[asset.sym]?b.total*prices[asset.sym].usd:0;
                  return(<div key={b.asset} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                    borderRadius:11,background:"#080f1c",border:`1px solid ${asset?asset.color+"22":"#0d1f2d"}`}}>
                    <div style={{width:40,height:40,borderRadius:10,background:asset?asset.bg:"#0d1f2d",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:asset?asset.color:"#4a6a7e"}}>
                      {asset?asset.icon:b.asset.slice(0,2)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:"#fff",fontSize:14}}>{b.asset}</div>
                      <div style={{fontSize:9,color:"#4a6a7e",...MN}}>Free:{b.free.toFixed(6)} Locked:{b.locked.toFixed(6)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{...MN,fontSize:15,fontWeight:700,color:"#00ffaa"}}>{b.total.toFixed(6)}</div>
                      {usd>0&&<div style={{...MN,fontSize:12,color:"#ffcc00"}}>{f$(usd)}</div>}
                    </div>
                  </div>);})}
              </div>
            </div>)}
          </div>)}

          {/* CHART */}
          {tab==="chart"&&(<div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              {ASSETS.map(a=>(
                <button key={a.sym} className="hov" onClick={()=>{setSelectedAsset(a.sym);loadChart(a.sym);}}
                  style={{padding:"6px 16px",borderRadius:20,border:`1px solid ${selectedAsset===a.sym?a.color:"#0d1f2d"}`,
                    background:selectedAsset===a.sym?a.bg:"transparent",color:selectedAsset===a.sym?a.color:"#4a6a7e",...MN,fontSize:11,cursor:"pointer"}}>
                  {a.icon} {a.sym}</button>))}
              <div style={{marginLeft:"auto",...MN,fontSize:9,color:"#2a4a5e"}}>60H · BINANCE DATA · 1H CANDLES</div>
            </div>
            {selPrice&&selSignal&&<div style={{display:"flex",gap:14,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <div><div style={{...MN,fontSize:9,color:"#4a6a7e"}}>PRICE</div>
                <div style={{...MN,fontSize:30,fontWeight:900,color:sel.color,textShadow:`0 0 18px ${sel.color}44`}}>
                  {f$(selPrice.usd,selectedAsset==="BTC"?0:2)}</div></div>
              <div style={{padding:"8px 14px",borderRadius:10,background:`${selSignal.color}12`,border:`1px solid ${selSignal.color}33`}}>
                <div style={{...MN,fontSize:8,color:"#4a6a7e",marginBottom:3}}>🧠 BRAIN SIGNAL</div>
                <div style={{...MN,fontSize:14,fontWeight:900,color:selSignal.color}}>{selSignal.signal}</div>
                <div style={{...MN,fontSize:9,color:"#4a6a7e"}}>RSI:{selSignal.rsi} · Conf:{selSignal.confidence}%</div>
              </div>
              {[{l:"24H CHANGE",v:fp(selPrice.change24h),c:selPrice.change24h>=0?"#00ffaa":"#ff4d6d"},
                {l:"24H HIGH",v:f$(selPrice.high24h,selectedAsset==="BTC"?0:2),c:"#00ffaa"},
                {l:"24H LOW",v:f$(selPrice.low24h,selectedAsset==="BTC"?0:2),c:"#ff4d6d"},
                {l:"VOLUME",v:"$"+fB(selPrice.volume24h),c:"#ffcc00"},
              ].map(x=>(<div key={x.l}><div style={{...MN,fontSize:9,color:"#4a6a7e"}}>{x.l}</div>
                <div style={{...MN,fontSize:15,fontWeight:700,color:x.c}}>{x.v}</div></div>))}
            </div>}
            <div style={{background:"#080f1c",borderRadius:12,padding:14,marginBottom:12,border:`1px solid ${sel.color}22`}}>
              <div style={{fontSize:9,color:"#2a4a5e",...MN,letterSpacing:2,marginBottom:8}}>CANDLESTICK — {selectedAsset}/USDT · 1H · BINANCE DATA</div>
              {candles[selectedAsset]&&candles[selectedAsset].length>0
                ?<CandleChart candles={candles[selectedAsset]}/>
                :<div style={{height:150,display:"flex",alignItems:"center",justifyContent:"center",color:"#2a4a5e",...MN}}>
                  Loading chart data…</div>}
            </div>
            <div style={{background:"#080f1c",borderRadius:12,padding:14,border:`1px solid ${sel.color}22`}}>
              <div style={{fontSize:9,color:"#2a4a5e",...MN,letterSpacing:2,marginBottom:8}}>PRICE HISTORY · QE INDICATORS</div>
              <Spark data={priceHistory[selectedAsset]||[]} color={sel.color} h={60} fill/>
              {selSignal&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:10}}>
                {[{l:"RSI",v:selSignal.rsi,c:selSignal.rsi<30?"#00ffaa":selSignal.rsi>70?"#ff4d6d":"#4a6a7e"},
                  {l:"BB UPPER",v:f$(selSignal.bbUpper,selectedAsset==="BTC"?0:2),c:"#ff8800"},
                  {l:"BB LOWER",v:f$(selSignal.bbLower,selectedAsset==="BTC"?0:2),c:"#00aaff"},
                  {l:"MA7 vs MA20",v:selSignal.ma7>selSignal.ma20?"BULL":"BEAR",c:selSignal.ma7>selSignal.ma20?"#00ffaa":"#ff4d6d"},
                ].map(x=>(<div key={x.l} style={{padding:"8px 10px",borderRadius:8,background:"#0a1422",textAlign:"center"}}>
                  <div style={{fontSize:8,...MN,color:"#4a6a7e",marginBottom:3}}>{x.l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:x.c,...MN}}>{x.v}</div>
                </div>))}
              </div>}
            </div>
          </div>)}

          {/* ALERTS */}
          {tab==="alerts"&&(<div>
            <div style={{fontWeight:700,fontSize:16,color:"#fff",marginBottom:14}}>Price Alerts</div>
            <div style={{padding:14,borderRadius:12,background:"#080f1c",border:"1px solid #0d1f2d",marginBottom:14}}>
              <div style={{...MN,fontSize:10,color:"#4a6a7e",letterSpacing:2,marginBottom:10}}>CREATE ALERT</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {ASSETS.map(a=>(
                  <button key={a.sym} className="hov" onClick={()=>setSelectedAsset(a.sym)}
                    style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${selectedAsset===a.sym?a.color:"#0d1f2d"}`,
                      background:selectedAsset===a.sym?a.bg:"transparent",color:selectedAsset===a.sym?a.color:"#4a6a7e",...MN,fontSize:11,cursor:"pointer"}}>
                    {a.icon} {a.sym}</button>))}
                <select value={alertType} onChange={e=>setAlertType(e.target.value)}
                  style={{padding:"6px 10px",borderRadius:8,border:"1px solid #0d1f2d",background:"#060e18",color:"#e2e8f0",...MN,fontSize:11}}>
                  <option value="above">Above</option><option value="below">Below</option>
                </select>
                <input type="number" value={alertPrice} onChange={e=>setAlertPrice(e.target.value)}
                  placeholder={selPrice?`Current: ${f$(selPrice.usd,2)}`:"Enter price"}
                  style={{padding:"6px 10px",borderRadius:8,border:"1px solid #0d1f2d",background:"#060e18",color:"#fff",...MN,fontSize:12,width:150}}/>
                <button onClick={()=>{const p=parseFloat(alertPrice);if(!isNaN(p)&&p>0){setAlerts(a=>[...a,{id:Date.now(),type:alertType,asset:selectedAsset,price:p,triggered:false}]);setAlertPrice("");notify(`🔔 Alert: ${selectedAsset} ${alertType} ${f$(p)}`);} }}
                  className="hov" style={{padding:"6px 14px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#00c896,#0066ff)",color:"#fff",...MN,fontSize:11,cursor:"pointer",fontWeight:700}}>
                  + SET</button>
              </div>
            </div>
            {alerts.length===0&&<div style={{textAlign:"center",padding:40,color:"#4a6a7e",...MN}}>No alerts set</div>}
            {alerts.map(a=>{const asset=ASSETS.find(x=>x.sym===a.asset);const cur=prices[a.asset]?.usd;return(
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,
                background:"#080f1c",marginBottom:8,border:`1px solid ${a.triggered?"#00ffaa44":"#0d1f2d"}`,opacity:a.triggered?.6:1}}>
                <span style={{fontSize:18,color:asset?.color}}>{asset?.icon}</span>
                <div style={{flex:1}}>
                  <div style={{...MN,fontSize:12,color:"#fff",fontWeight:700}}>{a.asset} {a.type} {f$(a.price)}</div>
                  <div style={{...MN,fontSize:10,color:"#4a6a7e"}}>Now: {cur?f$(cur):"–"} · {a.triggered?"✅ TRIGGERED":"⏳ Watching"}</div>
                </div>
                <button onClick={()=>setAlerts(al=>al.filter(x=>x.id!==a.id))} className="hov"
                  style={{background:"none",border:"none",color:"#4a6a7e",fontSize:16,cursor:"pointer"}}>✕</button>
              </div>);})}
          </div>)}
        </div>
      </div>

      <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"7px 18px",
        background:"rgba(2,6,8,.97)",borderTop:"1px solid #0d1f2d",
        display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:priceError?"#ff4d6d":"#00ffaa",animation:"pulse 2s infinite"}}/>
          <span style={{...MN,fontSize:8,color:priceError?"#ff4d6d":"#00ffaa"}}>{priceError?"OFFLINE":"LIVE"}</span>
        </div>
        {["SOL","ETH","BTC"].map(sym=>prices[sym]&&(
          <span key={sym} style={{...MN,fontSize:8,color:"#2a4a5e"}}>
            · {sym} {f$(prices[sym].usd,sym==="BTC"?0:2)}
            <span style={{color:prices[sym].change24h>=0?"#00ffaa":"#ff4d6d",marginLeft:3}}>{fp(prices[sym].change24h)}</span>
          </span>))}
        {["SOL","ETH","BTC"].map(sym=>signals[sym]&&(
          <span key={sym+"s"} style={{...MN,fontSize:8,color:signals[sym].color}}>
            · 🧠{sym}:{signals[sym].signal.split(" ")[0]}</span>))}
        {openPositions.length>0&&(
          <span style={{...MN,fontSize:8,color:"#00aaff"}}>· 📦 {openPositions.length} open</span>)}
        <span style={{marginLeft:"auto",...MN,fontSize:8,color:"#0d1f2d"}}>QUANTIFESTA v3 · NEURAL · DEX · quantifesta.com</span>
      </div>
    </div>);
}
export default function Root(){return <ErrorBoundary><App/></ErrorBoundary>;}
