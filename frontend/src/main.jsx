import React,{useEffect,useRef,useState,useMemo,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import useEmblaCarousel from 'embla-carousel-react';
import AutoScroll from 'embla-carousel-auto-scroll';
import {Hexagon,Activity,LayoutDashboard,Workflow,Boxes,Radio,ArrowUpRight,ChevronDown,Play,Terminal,Database,Upload,Check,X,SlidersHorizontal,Expand,Download,RotateCcw,ScanLine,ChartScatter,ChartNoAxesCombined,Sparkles,PanelLeftClose,HelpCircle,FileSpreadsheet,LoaderCircle,Pause,ArrowRight,Box,ShieldCheck,Moon,Sun,BarChart3} from 'lucide-react';
import {readDataset,analyzeRows,makeSample,taskNames,peekDataset} from './analysis';
import QuestionnaireModal from './QuestionnaireModal';
import ActionPages from './ActionPages';
import './style.css';

const Plot=lazy(async()=>{const [{default:factory},{default:Plotly}]=await Promise.all([import('react-plotly.js/factory'),import('plotly.js-dist-min')]);return{default:factory(Plotly)};});
const icons=[ScanLine,Box,ChartScatter,ChartNoAxesCombined,Sparkles];
const subtitles=['Automated ETL','Interactive 3D / 2D','Vector Scatter','Variance Matrix','Neural Brief'];
const fmt=n=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:3}):'—';

const DEFAULT_DATASETS = {
  revenue: {
    name: 'SaaS Revenue & Customer Metrics',
    topic: 'Sales & Recurring Revenue',
    userContext: 'Business Executive & Finance Team',
    goal: 'trends',
    targetCol: 'Revenue',
    dateCol: 'Date',
    groupCol: 'Segment',
    rows: [
      { Date: '2025-01-01', Revenue: 42000, Expense: 28000, Segment: 'Enterprise', Churn_Rate: 1.2, Marketing_Spend: 12000, NPS: 72 },
      { Date: '2025-02-01', Revenue: 48500, Expense: 29500, Segment: 'Mid-Market', Churn_Rate: 1.5, Marketing_Spend: 14500, NPS: 68 },
      { Date: '2025-03-01', Revenue: 51200, Expense: 31000, Segment: 'Enterprise', Churn_Rate: 0.9, Marketing_Spend: 13800, NPS: 78 },
      { Date: '2025-04-01', Revenue: 47800, Expense: 33000, Segment: 'SMB', Churn_Rate: 3.4, Marketing_Spend: 9200, NPS: 54 },
      { Date: '2025-05-01', Revenue: 62000, Expense: 34500, Segment: 'Enterprise', Churn_Rate: 1.1, Marketing_Spend: 18000, NPS: 81 },
      { Date: '2025-06-01', Revenue: 68400, Expense: 36000, Segment: 'Mid-Market', Churn_Rate: 1.4, Marketing_Spend: 19500, NPS: 74 },
      { Date: '2025-07-01', Revenue: 71000, Expense: 37500, Segment: 'Enterprise', Churn_Rate: 0.8, Marketing_Spend: 21000, NPS: 85 },
      { Date: '2025-08-01', Revenue: 69500, Expense: 39000, Segment: 'SMB', Churn_Rate: 2.9, Marketing_Spend: 12400, NPS: 61 },
      { Date: '2025-09-01', Revenue: 78000, Expense: 41000, Segment: 'Enterprise', Churn_Rate: 0.7, Marketing_Spend: 23500, NPS: 89 },
      { Date: '2025-10-01', Revenue: 84200, Expense: 42500, Segment: 'Mid-Market', Churn_Rate: 1.3, Marketing_Spend: 25000, NPS: 77 },
      { Date: '2025-11-01', Revenue: 91000, Expense: 45000, Segment: 'Enterprise', Churn_Rate: 0.6, Marketing_Spend: 28000, NPS: 92 },
      { Date: '2025-12-01', Revenue: 104500, Expense: 48000, Segment: 'Enterprise', Churn_Rate: 0.5, Marketing_Spend: 34000, NPS: 94 },
    ]
  },
  pareto: {
    name: 'Product Catalog & Volume Distribution',
    topic: 'Product Sales & Unit Volume',
    userContext: 'E-Commerce Merchandiser',
    goal: 'compare_groups',
    targetCol: 'Revenue',
    dateCol: null,
    groupCol: 'Product',
    rows: [
      { Product: 'Wireless Earbuds Pro', Quantity: 1250, Revenue: 62500, Category: 'Audio', Rating: 4.8 },
      { Product: 'MagSafe Phone Case', Quantity: 3500, Revenue: 52500, Category: 'Accessories', Rating: 4.5 },
      { Product: 'USB-C Braided Cable', Quantity: 4200, Revenue: 21000, Category: 'Cables', Rating: 4.2 },
      { Product: 'Tempered Screen Guard', Quantity: 2800, Revenue: 14000, Category: 'Protection', Rating: 4.1 },
      { Product: 'Smart Fitness Watch', Quantity: 150, Revenue: 29850, Category: 'Wearables', Rating: 4.7 },
      { Product: 'Bluetooth Mini Speaker', Quantity: 320, Revenue: 15900, Category: 'Audio', Rating: 4.3 },
      { Product: 'Laptop Stand Aluminum', Quantity: 480, Revenue: 24000, Category: 'Office', Rating: 4.9 },
    ]
  }
};

function inferColumns(rows) {
  if (!rows || rows.length === 0) return [];
  const fields = Object.keys(rows[0]);
  return fields.map((f) => {
    const hasNum = rows.some((r) => typeof r[f] === 'number');
    const isDate = f.toLowerCase().match(/(date|time|month|year)/);
    return {
      name: f,
      type: isDate ? 'datetime' : hasNum ? 'numeric' : 'text',
    };
  });
}

function useReduced(){const [value,set]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),f=()=>set(q.matches);q.addEventListener('change',f);return()=>q.removeEventListener('change',f);},[]);return value;}

function TaskRail({selected,onSelect,reduced}){
 const plugin=useMemo(()=>AutoScroll({speed:1,stopOnInteraction:false,stopOnMouseEnter:true,stopOnFocusIn:true,startDelay:3000,playOnInit:!reduced}),[reduced]);
 const [ref,api]=useEmblaCarousel({loop:true,align:'start',dragFree:true},[plugin]);const [active,setActive]=useState(0),[paused,setPaused]=useState(false);
 useEffect(()=>{if(!api)return;const update=()=>setActive(api.selectedScrollSnap()%5);api.on('select',update);return()=>api.off('select',update);},[api]);
 useEffect(()=>{if(!api)return;if(selected!==null||reduced||paused)plugin.stop();else plugin.play();},[api,selected,reduced,paused,plugin]);
 useEffect(()=>{if(!api)return;const stop=()=>{if(selected!==null||reduced||paused)plugin.stop();};api.on('autoScroll:play',stop);return()=>api.off('autoScroll:play',stop);},[api,selected,reduced,paused,plugin]);
 return <><div className="rail" ref={ref} aria-label="Analysis tasks" onKeyDown={e=>{if(e.key==='Escape')onSelect(null);}}><div className="rail-track">{[...taskNames,...taskNames].map((name,i)=>{const n=i%5,Icon=icons[n];return <button className={'task-card '+(selected===n?'selected':'')} key={i} tabIndex={i<5?0:-1} aria-hidden={i>=5?true:undefined} aria-pressed={selected===n} onClick={()=>{if(api?.clickAllowed?.()===false)return;onSelect(selected===n?null:n);}}><span className="card-top"><Icon size={23}/><span className="task-index">0{n+1}</span></span><span className="task-title">{name}</span><span className="task-subtitle">{subtitles[n]}</span><span className="card-arrow">{selected===n?<X size={16}/>:<ArrowUpRight size={16}/>}</span></button>;})}</div></div><div className="rail-bottom"><span className="mono">SELECT A TASK TO BEGIN</span><div className="progress-dots">{taskNames.map((t,i)=><button key={t} title={t} aria-label={`Go to ${t}`} className={active===i?'active':''} onClick={()=>{api?.scrollTo(i);setActive(i);}}/>)}</div><button className="rail-state" onClick={()=>setPaused(!paused)} aria-label={paused?'Resume task carousel':'Pause task carousel'}>{paused||reduced?<Play size={11}/>:<Pause size={11}/>}<span>{reduced?'MANUAL':paused?'PAUSED':'AUTO SCROLL'}</span></button></div></>;
}

function Modal({title,onClose,children}){const ref=useRef(null);useEffect(()=>{const prev=document.activeElement;ref.current.showModal();return()=>prev?.focus();},[]);return <dialog ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><header><h2>{title}</h2><button aria-label="Close dialog" className="icon-button" onClick={onClose}><X size={19}/></button></header>{children}</dialog>;}

function App(){
 const reduced=useReduced(),[selected,setSelected]=useState(null),[view,setView]=useState('Workbench'),[file,setFile]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[modal,setModal]=useState(null),[drag,setDrag]=useState(false),[logs,setLogs]=useState([{time:new Date().toLocaleTimeString(),text:'Workspace initialized. Sample visualization ready.'}]),[stageMode,setStageMode]=useState(0),[expanded,setExpanded]=useState(false),[pointSize,setPointSize]=useState(2),[grid,setGrid]=useState(true),[chartKey,setChartKey]=useState(0),[sampleResult,setSampleResult]=useState(false),[isLight,setIsLight]=useState(true),[cleanConfig,setCleanConfig]=useState(null);

 // Questionnaire and Action Pages State
 const [activeDatasetRows, setActiveDatasetRows] = useState(DEFAULT_DATASETS.revenue.rows);
 const [activeDatasetName, setActiveDatasetName] = useState(DEFAULT_DATASETS.revenue.name);
 const [activeActionGoal, setActiveActionGoal] = useState('trends');
 const [questionConfig, setQuestionConfig] = useState({
   topic: DEFAULT_DATASETS.revenue.topic,
   userContext: DEFAULT_DATASETS.revenue.userContext,
   goal: DEFAULT_DATASETS.revenue.goal,
   targetCol: DEFAULT_DATASETS.revenue.targetCol,
   dateCol: DEFAULT_DATASETS.revenue.dateCol,
   groupCol: DEFAULT_DATASETS.revenue.groupCol,
   subActions: ['trend_over_time'],
 });

 const activeColumns = useMemo(() => inferColumns(activeDatasetRows), [activeDatasetRows]);

 useEffect(()=>{document.documentElement.classList.toggle('light-theme',isLight);},[isLight]);
 const input=useRef(), sample=useMemo(makeSample,[]);
 const addLog=text=>setLogs(ls=>[...ls,{time:new Date().toLocaleTimeString(),text}]);

 const loadPresetData = (presetKey) => {
   const p = DEFAULT_DATASETS[presetKey] || DEFAULT_DATASETS.revenue;
   setActiveDatasetRows(p.rows);
   setActiveDatasetName(p.name);
   setQuestionConfig({
     topic: p.topic,
     userContext: p.userContext,
     goal: p.goal,
     targetCol: p.targetCol,
     dateCol: p.dateCol,
     groupCol: p.groupCol,
     subActions: [],
   });
   setActiveActionGoal(p.goal);
   addLog(`Loaded preset dataset: ${p.name}`);
 };

 const accept=async(f)=>{
   if(!f)return;
   setError('');
   if(!/\.(csv|json|xlsx|parquet)$/i.test(f.name)){setError('Supported formats: CSV, JSON, XLSX, and Parquet.');return;}
   if(f.size>20*1024*1024){setError('Maximum file size is 20 MB.');return;}
   setFile(f);
   addLog(`Dataset selected: ${f.name}`);

   try {
     const rows = await readDataset(f);
     setActiveDatasetRows(rows);
     setActiveDatasetName(f.name);
     const cols = inferColumns(rows);
     const num = cols.find(c => c.type === 'numeric');
     const dt = cols.find(c => c.type === 'datetime');
     const cat = cols.find(c => c.type === 'text');
     setQuestionConfig(prev => ({
       ...prev,
       targetCol: num?.name || cols[0]?.name || '',
       dateCol: dt?.name || '',
       groupCol: cat?.name || '',
     }));
     // Open questionnaire automatically with uploaded dataset columns
     setModal('questionnaire');
   } catch(e) {
     console.error('File read error:', e);
   }
 };

 const execute=async(demo=false, bypassWizard=false)=>{if(selected===null){setError('Select an analysis task first.');return;}if(!file&&!demo){input.current?.click();return;}setBusy(true);setError('');setStageMode(0);addLog(`Starting ${taskNames[selected]}${demo?' with sample data':''}…`);try{let r;const api=import.meta.env.VITE_API_URL;if(api&&!demo){const form=new FormData();form.append('file',file);form.append('task',taskNames[selected]);const response=await fetch(`${api}/api/analyze`,{method:'POST',body:form});if(!response.ok){let body=await response.json().catch(()=>({}));throw new Error(body.detail||`Analysis failed (${response.status}).`);}r=await response.json();}else{const rows=demo?sample:await readDataset(file);if(selected===0&&!bypassWizard&&!demo){setBusy(false);const peek=peekDataset(rows);setCleanConfig({rows,peek,config:{selectedColumns:peek.fields.slice(),renameMap:{},missingStrategies:{}}});setModal('clean');return;}r=analyzeRows(rows,taskNames[selected],bypassWizard?cleanConfig?.config:null);}setResult(r);setSampleResult(demo);addLog(`Complete: ${r.stats.rows} records analyzed, ${r.anomalies.length} outlier values flagged.`);if(selected===4)setStageMode(2);}catch(e){setError(e.message);addLog(`Error: ${e.message}`);}finally{setBusy(false);}};
 const download=()=>{if(!result)return;const blob=new Blob([JSON.stringify(result.cleaned||result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=result.cleaned?'omnisight-cleaned.json':'omnisight-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const baseChart=useMemo(()=>({data:[{type:'scatter3d',mode:'markers',x:sample.map(r=>r.x),y:sample.map(r=>r.y),z:sample.map(r=>r.z),marker:{size:pointSize,color:sample.map(r=>r.z),colorscale:[[0,'#104359'],[.4,'#16769a'],[.7,'#38BDF8'],[1,'#c1f1ff']],opacity:.8},hovertemplate:'X %{x:.2f}<br>Y %{y:.2f}<br>Z %{z:.2f}<extra>Sample point</extra>'}],layout:{}}),[sample,pointSize]);
 const c=result?.chart_json||baseChart;
 const axis={showbackground:false,gridcolor:'rgba(93,139,145,.16)',zerolinecolor:'rgba(93,139,145,.25)',color:'#5e777c',showgrid:grid,tickfont:{size:10},title:{text:''}};
 const chartLayout={...c.layout,autosize:true,margin:{l:40,r:25,b:35,t:60},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:'JetBrains Mono, monospace',color:'#98A2A2',size:11},showlegend:false,xaxis:{...axis,...c.layout?.xaxis},yaxis:{...axis,...c.layout?.yaxis},scene:{aspectratio:{x:1.7,y:1.4,z:1.3},camera:{eye:{x:1.05,y:1.1,z:.68}},xaxis:{...axis,...c.layout?.scene?.xaxis},yaxis:{...axis,...c.layout?.scene?.yaxis},zaxis:{...axis,...c.layout?.scene?.zaxis},bgcolor:'rgba(0,0,0,0)'},uirevision:chartKey};

 return (
  <div className="app">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();setView('Workbench');}}>
        <span className="brand-symbol"><Hexagon size={32}/><Activity size={19}/></span>OmniSight<span className="version">v2.0</span>
      </a>
      <div className="workspace-switch">
        <span className="workspace-logo">O</span>
        <div>OmniSight Workspace<small>Personal workspace</small></div>
        <ChevronDown size={14}/>
      </div>
      <span className="nav-label">PLATFORM</span>
      <nav>
        {[
          [LayoutDashboard,'Workbench'],
          [BarChart3, 'Action Pages'],
          [Workflow,'AI Pipeline'],
          [Boxes,'Model Registry'],
          [Radio,'Telemetry']
        ].map(([Icon,name]) => {
          const isActive = view === name || (name === 'Action Pages' && view.startsWith('Action'));
          return (
            <button
              key={name}
              className={isActive ? 'nav-active' : ''}
              onClick={() => {
                if (name === 'Action Pages') {
                  setView('Action: ' + activeActionGoal);
                } else {
                  setView(name);
                }
              }}
            >
              <Icon size={18}/>{name}{name==='Workbench'&&<span className="nav-shortcut">⌘ 1</span>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="engine-card">
          <span><span className="status-light"/> LOCAL ENGINE</span>
          <strong>Ready for analysis</strong>
          <small>Private, in-browser processing</small>
          <div className="engine-bars">{Array.from({length:26},(_,i)=><i key={i} style={{height:`${8+((i*13)%17)}px`}}/>)}</div>
        </div>
        <button className="help-button" onClick={()=>setModal('help')}><HelpCircle size={17}/> Quick start <ArrowUpRight size={14}/></button>
        <div className="profile">
          <div className="avatar">EV</div>
          <div><strong>Dr. Elena Vance</strong><small>Lead Architect</small></div>
          <button className="icon-button" aria-label="Profile information" onClick={()=>setModal('profile')}><ChevronDown size={15}/></button>
        </div>
      </div>
    </aside>

    <main>
      <header className="topbar">
        <div className="breadcrumb">
          <span>Platform</span><span>/</span><strong>{view}</strong>
        </div>
        <div className="topbar-right">
          <button className="icon-button" style={{marginRight:'10px'}} onClick={()=>setIsLight(!isLight)} aria-label="Toggle theme">
            {isLight?<Moon size={16}/>:<Sun size={16}/>}
          </button>
          <span className="environment"><span className="status-light"/>LOCAL WORKSPACE</span>
          <span className="divider"/>
          <span className="mono">V 2.0.0</span>
        </div>
      </header>

      {/* ── ACTION PAGES VIEW (Directed by Questionnaire) ── */}
      {view.startsWith('Action') ? (
        <ActionPages
          Plot={Plot}
          rows={activeDatasetRows}
          columns={activeColumns}
          config={questionConfig}
          activeGoal={activeActionGoal}
          onSelectGoal={(g) => {
            setActiveActionGoal(g);
            setView('Action: ' + g);
          }}
          onOpenQuestionnaire={() => setModal('questionnaire')}
          onBackToWorkbench={() => setView('Workbench')}
          isLight={isLight}
        />
      ) : view === 'Workbench' ? (
        <>
          <section className="execution">
            <div className="execution-toolbar">
              <span className="workspace-pill"><Terminal size={13}/> workspace://prod-cluster-04 <ChevronDown size={12}/></span>
              <div className="actions">
                <button
                  className="execute-button"
                  style={{ background: 'linear-gradient(135deg,#38bdf8,#0284c7)', color: '#030507', fontWeight: 700 }}
                  onClick={() => setModal('questionnaire')}
                >
                  <Sparkles size={14}/> Questionnaire &amp; Action Pages <span>↵</span>
                </button>
                <button className="outline-button" onClick={()=>setModal('logs')}><Terminal size={14}/>Logs</button>
                <button className="execute-button" onClick={()=>execute()} disabled={busy}>
                  {busy?<LoaderCircle className="spin" size={15}/>:<Play size={14} fill="currentColor"/>}
                  {busy?'Analyzing':'Execute'}
                  <span>↵</span>
                </button>
              </div>
            </div>

            {/* Hero Section */}
            <div className="hero">
              <div>
                <p className="eyebrow">NEXT-GEN NEURAL DATA ANALYSIS & TELEMETRY SUITE</p>
                <h1>How should we analyze<span>?</span></h1>
              </div>
              <span className="hero-aside"><span className="mini-line"/> FROM RAW DATA TO CLARITY</span>
            </div>

            {/* Quick Questionnaire & Action Pages Banner */}
            <div className="qmodal-preset-bar" style={{ margin: '0 0 16px 0', borderColor: 'rgba(0,230,118,0.25)', background: 'rgba(0,230,118,0.06)' }}>
              <span className="mono" style={{ color: '#00e676' }}>
                <Sparkles size={12} style={{ display: 'inline', marginRight: 4 }}/>
                INTAKE ROUTER: 5 Questions (Topic, Goal, Target, Date, ANOVA Group) &rarr; Dedicated Action Page
              </span>
              <div className="qmodal-preset-actions">
                <button
                  type="button"
                  className="qmodal-preset-btn"
                  style={{ padding: '4px 10px', fontWeight: 700 }}
                  onClick={() => setModal('questionnaire')}
                >
                  Configure Questions &rarr;
                </button>
                <button
                  type="button"
                  className="qmodal-preset-btn"
                  onClick={() => {
                    setView('Action: trends');
                    setActiveActionGoal('trends');
                  }}
                >
                  Direct Demo: Trends
                </button>
                <button
                  type="button"
                  className="qmodal-preset-btn"
                  onClick={() => {
                    setView('Action: compare_groups');
                    setActiveActionGoal('compare_groups');
                  }}
                >
                  Direct Demo: Groups (ANOVA)
                </button>
              </div>
            </div>

            <TaskRail selected={selected} onSelect={setSelected} reduced={reduced}/>

            <div
              aria-hidden={selected===null}
              className={'upload-dock '+(selected!==null?'revealed':'')+(drag?' dragover':'')}
              onDragOver={e=>{e.preventDefault();setDrag(true);}}
              onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);accept(e.dataTransfer.files[0]);}}
            >
              <button className="upload-target" tabIndex={selected===null?-1:0} onClick={()=>input.current?.click()}>
                <Upload size={16}/>
                <span>
                  {file?<><strong>{file.name}</strong><span className="upload-formats"> · {fmt(file.size/1024)} KB</span></>:<><strong>Drop your dataset here</strong><span className="upload-formats"> or browse files</span></>}
                </span>
                <span className="formats">CSV · JSON · XLSX · PARQUET</span>
              </button>
              <span className="dock-divider"/>
              <button className="sample-button" tabIndex={selected===null?-1:0} onClick={()=>execute(true)} disabled={busy}>
                Try sample <ArrowRight size={13}/>
              </button>
            </div>

            <input ref={input} type="file" hidden accept=".csv,.json,.xlsx,.parquet" onChange={e=>accept(e.target.files[0])}/>
            {error&&<div role="alert" className="error-message">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={13}/></button></div>}
          </section>

          <section className={'telemetry '+(expanded?'expanded':'')}>
            <div className="telemetry-head">
              <div>
                <div className="live-label"><span className={reduced?'live-dot still':'live-dot'}/>LIVE TELEMETRY FEED<span className="sample-badge">{result&&!sampleResult?'DATASET ANALYSIS':'SAMPLE DATA'}</span></div>
                <h2>{stageMode===1?'Statistical profile':stageMode===2?'Intelligence brief':result?'Dataset visualization':'3D Holographic Spatial Mapping'}</h2>
              </div>
              <div className="chart-actions">
                <span className="chart-type">{stageMode===0?'SPATIAL VIEW':stageMode===1?'STATISTICS':'SUMMARY'}</span>
                <button className="icon-button" title="Visualization settings" aria-label="Visualization settings" onClick={()=>setModal('settings')}><SlidersHorizontal size={16}/></button>
                <button className="icon-button" title="Reset view" aria-label="Reset chart view" onClick={()=>setChartKey(k=>k+1)}><RotateCcw size={15}/></button>
                <button className="icon-button" title={expanded?'Exit expanded view':'Expand visualization'} aria-label={expanded?'Exit expanded view':'Expand visualization'} onClick={()=>setExpanded(!expanded)}>{expanded?<X size={17}/>:<Expand size={16}/>}</button>
              </div>
            </div>

            <div className="stage">
              <div className="stage-coordinate">{stageMode===0?'X / Y / Z COORDINATE SPACE':'ANALYSIS OUTPUT'}<span>{result?(sampleResult?'Sample dataset':file?.name):'synthetic_spatial_sample'}</span></div>
              {busy?<div className="empty-state"><LoaderCircle size={30} className="spin"/><h3>Analyzing your dataset</h3><p>Cleaning, profiling, and mapping the results.</p></div>:stageMode===0?<Suspense fallback={<div className="empty-state"><LoaderCircle className="spin" size={25}/><p>Initializing spatial renderer…</p></div>}><Plot key={chartKey} data={c.data} layout={chartLayout} config={{displayModeBar:false,responsive:true,scrollZoom:false,displaylogo:false}} style={{width:'100%',height:'100%'}} useResizeHandler/></Suspense>:!result?<div className="empty-state"><Database size={27}/><h3>Your data, a clearer perspective.</h3><p>Select a task and upload a dataset to see {stageMode===1?'its statistical profile':'an intelligence brief'}.</p><button className="outline-button" onClick={()=>{setSelected(stageMode===1?3:4);}}>Choose {stageMode===1?'Check Statistics':'Intelligence Brief'} <ArrowRight size={14}/></button></div>:stageMode===1?<div className="statistics"><table><thead><tr><th>FIELD</th><th>TYPE</th><th>MEAN</th><th>STD DEV</th><th>MIN</th><th>MAX</th><th>MISSING</th></tr></thead><tbody>{result.stats.profiles.map(p=><tr key={p.name}><td>{p.name}</td><td>{p.type}</td><td>{fmt(p.mean)}</td><td>{fmt(p.std)}</td><td>{fmt(p.min)}</td><td>{fmt(p.max)}</td><td>{p.missing}</td></tr>)}</tbody></table></div>:<article className="brief"><span className="brief-label"><Sparkles size={16}/>{result.summary_source==='gemini'?'GEMINI INTELLIGENCE':'AUTOMATED STATISTICAL BRIEF'}</span><p>{result.ai_summary}</p>{result.summary_source!=='gemini'&&<small>Generated from measured statistics. Connect the Gemini backend for an AI narrative.</small>}<button className="outline-button" onClick={download}><Download size={14}/>Export results</button></article>}
              <div className="axis-key"><i/>X AXIS <i/>Y AXIS <i/>Z AXIS</div>
              <div className="stage-watermark"><Hexagon size={16}/>OMNISIGHT ENGINE</div>
            </div>

            <div className="telemetry-footer">
              <div className="metric"><span>DATA POINTS</span><strong>{fmt(result?.stats.cleaned_rows??sample.length)}<small>records</small></strong></div>
              <div className="metric"><span>{result?'FLAGGED VALUES':'DIMENSIONS'}</span><strong>{result?fmt(result.anomalies.length):'03'}<small>{result?'outliers':'axes'}</small></strong></div>
              <div className="metric optional"><span>{result?'MISSING VALUES':'DATA SOURCE'}</span><strong>{result?fmt(result.stats.missing):'Synthetic'}<small>{result?'filled':'sample'}</small></strong></div>
              <div className="stage-pagination">{['Spatial view','Statistics','Intelligence brief'].map((v,i)=><button key={v} className={stageMode===i?'active':''} aria-label={v} title={v} onClick={()=>setStageMode(i)}/>)}</div>
              <span className="interaction-hint">{stageMode===0?'DRAG TO ROTATE · PINCH TO ZOOM':'EXPLORE YOUR RESULTS'}</span>
            </div>
          </section>
        </>
      ) : (
        <section className="secondary-page">
          <span className="eyebrow">OMNISIGHT / {view.toUpperCase()}</span>
          <h1>{view}</h1>
          {view==='AI Pipeline'?<>
            <p>The analysis path from source data to a structured result.</p>
            <div className="pipeline">
              {[['Ingest','CSV, JSON, XLSX, Parquet'],['Questionnaire','Map Topic, Goal, Target, Date & Group'],['Action Pages','Dedicated views with recommended chart matrix'],['Profile','Descriptive statistics and anomaly screening'],['Summarize','Statistical brief or Gemini narrative']].map(([name,detail],i)=><div className="pipeline-step" key={name}><span>0{i+1}</span><div><h3>{name}</h3><p>{detail}</p></div>{result?<Check size={18}/>:<div className="step-ready">READY</div>}</div>)}
            </div>
          </>:view==='Model Registry'?<>
            <p>Analysis engines available to this workspace.</p>
            <div className="model-grid">
              {[['Statistical profiler','Descriptive statistics · Median imputation','Available locally'],['Anomaly screening','Interquartile range · Z-score','Available locally'],['Gemini','Executive intelligence narratives',import.meta.env.VITE_API_URL?'Backend configured':'Requires backend API key']].map(([name,desc,status])=><article key={name}><Boxes size={23}/><h3>{name}</h3><p>{desc}</p><span>{status}</span></article>)}
            </div>
          </>:<>
            <p>Execution events from the current session.</p>
            <LogList logs={logs}/>
            {result&&<button className="outline-button" onClick={download}><Download size={16}/>Export latest analysis</button>}
          </>}
        </section>
      )}

      <footer className="statusbar">
        <span><ShieldCheck size={12}/>{import.meta.env.VITE_API_URL?'CONNECTED ANALYSIS API':'LOCAL PROCESSING · DATA STAYS IN YOUR BROWSER'}</span>
        <span>OMNISIGHT <b>/</b> INTELLIGENCE, IN FOCUS.</span>
      </footer>
    </main>

    {/* ── MODALS ── */}
    {modal&& (
      modal === 'questionnaire' ? (
        <QuestionnaireModal
          columns={activeColumns}
          initialValues={questionConfig}
          datasetName={activeDatasetName}
          onClose={() => setModal(null)}
          onSubmit={(cfg) => {
            setQuestionConfig(cfg);
            setActiveActionGoal(cfg.goal);
            setView('Action: ' + cfg.goal);
            setModal(null);
            addLog(`Directing to Action Page for goal: ${cfg.goal}`);
          }}
          onLoadPreset={(pKey) => loadPresetData(pKey)}
        />
      ) : (
        <Modal title={{logs:'Execution logs',settings:'Visualization settings',help:'Quick start',profile:'Workspace profile'}[modal]} onClose={()=>setModal(null)}>
          {modal==='clean'?<div className="settings clean-wizard"><p>Select columns, rename them, and specify how to handle missing values.</p><div className="clean-grid">{cleanConfig?.peek.fields.map(f=>{const isSelected=cleanConfig.config.selectedColumns.includes(f);const isMissing=cleanConfig.peek.missing[f]>0;const strat=cleanConfig.config.missingStrategies[f]||{type:''};return <div key={f} className="clean-row"><label><input type="checkbox" checked={isSelected} onChange={e=>{const s=new Set(cleanConfig.config.selectedColumns);if(e.target.checked)s.add(f);else s.delete(f);setCleanConfig({...cleanConfig,config:{...cleanConfig.config,selectedColumns:Array.from(s)}});}}/> {f}</label><input type="text" placeholder="Rename to..." value={cleanConfig.config.renameMap[f]||''} onChange={e=>{setCleanConfig({...cleanConfig,config:{...cleanConfig.config,renameMap:{...cleanConfig.config.renameMap,[f]:e.target.value}}});}} disabled={!isSelected}/>{isMissing&&isSelected&&<div className="strat-group"><span className="warning-text">{cleanConfig.peek.missing[f]} missing</span><select value={strat.type} onChange={e=>{setCleanConfig({...cleanConfig,config:{...cleanConfig.config,missingStrategies:{...cleanConfig.config.missingStrategies,[f]:{type:e.target.value,value:''}}}});}}><option value="">Do nothing</option><option value="drop">Drop rows</option><option value="fill">Fill with value</option>{cleanConfig.peek.types[f]==='numeric'&&<option value="mean">Fill with mean</option>}{cleanConfig.peek.types[f]==='numeric'&&<option value="max">Fill with max</option>}{cleanConfig.peek.types[f]==='numeric'&&<option value="min">Fill with min</option>}</select>{strat.type==='fill'&&<input type="text" placeholder="Value" value={strat.value||''} onChange={e=>{setCleanConfig({...cleanConfig,config:{...cleanConfig.config,missingStrategies:{...cleanConfig.config.missingStrategies,[f]:{...strat,value:e.target.value}}}});}}/>}</div>}</div>;})}</div><button className="execute-button" style={{marginTop:15,width:'100%'}} onClick={()=>{setModal(null);execute(false,true);}}>Apply & Execute</button></div>:modal==='logs'?<LogList logs={logs}/>:modal==='settings'?<div className="settings"><label>Sample point size <output>{pointSize}</output><input type="range" min="1" max="5" step=".5" value={pointSize} onChange={e=>setPointSize(Number(e.target.value))}/></label><label className="check-label"><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/> Show coordinate grid</label><p>Drag the spatial view to rotate. Pinch to zoom. Reset restores the original camera.</p></div>:modal==='profile'?<div className="modal-body"><div className="avatar">EV</div><h3>Dr. Elena Vance</h3><p>Lead Architect · Demo workspace profile</p><small>This is the profile provided in the OmniSight specification.</small></div>:<div className="modal-body"><ol><li>Select an analysis task in the moving rail.</li><li>Drop a CSV, JSON, XLSX, or Parquet dataset (up to 20 MB), or choose Try sample.</li><li>Press Execute to clean and analyze the dataset.</li><li>Use the three dots below the chart to view statistics and the intelligence brief.</li></ol><p>Keyboard: Tab to a task, Enter to select, Escape to deselect. Carousel motion pauses on hover and focus.</p><small>Charts display up to 10,000 records. Statistics use the full dataset. Browser analysis is local; Gemini requires the supplied backend.</small></div>}
        </Modal>
      )
    )}
  </div>
 );
}

function LogList({logs}){return <div className="log-list" role="log">{logs.map((log,i)=><div key={i}><time>{log.time}</time><span>{log.text}</span></div>)}</div>;}

createRoot(document.getElementById('root')).render(<App/>);
