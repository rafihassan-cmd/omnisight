import Papa from 'papaparse';

export const taskNames = ['Clean Data','Visualize Data','Plot Results','Check Statistics','Intelligence Brief'];
export async function readDataset(file) {
  if(file.size>20*1024*1024) throw new Error('Please choose a dataset smaller than 20 MB.');
  const ext=file.name.split('.').pop().toLowerCase();
  let rows;
  if(ext==='csv') {
    const p=Papa.parse(await file.text(),{header:true,skipEmptyLines:'greedy',dynamicTyping:true});
    if(p.errors.length) throw new Error(`CSV could not be read: ${p.errors[0].message}`);
    rows=p.data;
  } else if(ext==='json') {
    const j=JSON.parse(await file.text()); rows=Array.isArray(j)?j:j.data;
  } else if(ext==='xlsx') {
    const XLSX=await import('xlsx'); const book=XLSX.read(await file.arrayBuffer());
    rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:null});
  } else if(ext==='parquet') {
    const {parquetReadObjects}=await import('hyparquet');
    rows=await parquetReadObjects({file:await file.arrayBuffer()});
  } else throw new Error('Choose a CSV, JSON, XLSX, or Parquet file.');
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r))) throw new Error('The dataset must contain a nonempty array of row objects.');
  return rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v])));
}
export function peekDataset(rows) {
  const fields = [...new Set(rows.flatMap(Object.keys))];
  const missing = {};
  const types = {};
  fields.forEach(f => {
    let mis = 0, isNum = true, hasVal = false;
    rows.forEach(r => {
      const v = r[f];
      if (v === null || v === undefined || v === '') mis++;
      else {
        hasVal = true;
        if (typeof v !== 'number' && isNaN(Number(v))) isNum = false;
      }
    });
    missing[f] = mis;
    types[f] = (hasVal && isNum) ? 'numeric' : 'text';
  });
  return { fields, missing, types, totalRows: rows.length };
}
const quantile=(sorted,q)=>{const pos=(sorted.length-1)*q,base=Math.floor(pos);return sorted[base]+(sorted[base+1]===undefined?0:(sorted[base+1]-sorted[base])*(pos-base));};
export function analyzeRows(rows,task,config=null) {
  if (config) {
    const { selectedColumns, renameMap, missingStrategies } = config;
    for (const [col, strat] of Object.entries(missingStrategies)) {
      if (['mean', 'min', 'max'].includes(strat.type)) {
        const nums = rows.map(r => Number(r[col])).filter(n => !isNaN(n));
        if (nums.length > 0) {
          if (strat.type === 'mean') strat.calculatedValue = nums.reduce((a,b)=>a+b,0) / nums.length;
          if (strat.type === 'min') strat.calculatedValue = Math.min(...nums);
          if (strat.type === 'max') strat.calculatedValue = Math.max(...nums);
        } else strat.calculatedValue = 0;
      }
    }
    const dropCols = Object.keys(missingStrategies).filter(c => missingStrategies[c].type === 'drop');
    if (dropCols.length > 0) rows = rows.filter(r => !dropCols.some(c => r[c] === null || r[c] === undefined || r[c] === ''));
    rows = rows.map(r => {
      const newRow = {};
      selectedColumns.forEach(c => {
        let v = r[c];
        if (v === null || v === undefined || v === '') {
          const strat = missingStrategies[c];
          if (strat) {
            if (strat.type === 'fill') v = strat.value;
            else if (['mean', 'min', 'max'].includes(strat.type)) v = strat.calculatedValue;
          }
        }
        newRow[renameMap[c] || c] = v;
      });
      return newRow;
    });
  }
  const fields=[...new Set(rows.flatMap(Object.keys))];
  let missing=0; const seen=new Set();
  const unique=rows.filter(row=>{fields.forEach(k=>{if(row[k]===null||row[k]===undefined||row[k]==='') missing++;});const key=JSON.stringify(fields.map(k=>row[k]??null));if(seen.has(key))return false;seen.add(key);return true;});
  const columns=fields.map(name=>{
    const values=unique.map(r=>r[name]).filter(v=>v!==null&&v!==undefined&&v!=='');
    const numeric=values.length>0&&values.every(v=>typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)));
    if(!numeric)return{name,type:'text',missing:unique.length-values.length};
    const ns=values.map(Number).sort((a,b)=>a-b),mean=ns.reduce((a,b)=>a+b,0)/ns.length;
    const std=Math.sqrt(ns.reduce((s,n)=>s+(n-mean)**2,0)/ns.length),q1=quantile(ns,.25),q3=quantile(ns,.75);
    return{name,type:'numeric',missing:unique.length-values.length,count:ns.length,mean,std,min:ns[0],max:ns.at(-1),median:quantile(ns,.5),q1,q3};
  });
  const numeric=columns.filter(c=>c.type==='numeric' && !c.name.toLowerCase().match(/^(index|id|.*_id)$/));
  const anomalies=[];
  unique.forEach((row,i)=>numeric.forEach(c=>{const raw=row[c.name];if(raw==null||raw==='')return;const n=Number(raw);if(n<c.q1-1.5*(c.q3-c.q1)||n>c.q3+1.5*(c.q3-c.q1)||c.std>0&&Math.abs((n-c.mean)/c.std)>3) anomalies.push({row:i+1,column:c.name,value:n});}));
  const cleaned=unique.map(row=>Object.fromEntries(columns.map(c=>[c.name,row[c.name]==null||row[c.name]===''?(c.type==='numeric'?c.median:'Unknown'):(c.type==='numeric'?Number(row[c.name]):row[c.name])])));
  const stats={rows:rows.length,cleaned_rows:cleaned.length,columns:fields.length,missing,duplicates:rows.length-unique.length,numeric_columns:numeric.length,profiles:columns};
  const chartRows=cleaned.slice(0,10000),x=numeric[0]?.name,y=numeric[1]?.name,z=numeric[2]?.name;
  let chart;
  if(task==='Check Statistics'&&numeric.length) chart={data:numeric.map(c=>({type:'box',name:c.name,y:chartRows.map(r=>r[c.name]),marker:{color:'#38BDF8'}})),layout:{yaxis:{title:{text:'Value'}}}};
  else {
    const col = (...names) => fields.find(f => names.some(n => f.toLowerCase().includes(n)));
    
    const tDate = col('date', 'time', 'month');
    const tRev = col('revenue', 'income');
    const tExp = col('expense', 'cost', 'spend');
    
    const pProd = col('product', 'service', 'item');
    const pQty = col('quantity', 'sold', 'sales');
    
    const cChan = col('channel', 'source', 'campaign');
    const cCac = col('cac', 'acquisition');
    const cLtv = col('ltv', 'lifetime');
    
    const hCust = col('customer', 'client', 'user');
    const dCat = col('category', 'department', 'type');
    
    if (tDate && tRev && tExp) {
      const agg = {};
      cleaned.forEach(r => {
        let dt = new Date(r[tDate]);
        let dStr = !isNaN(dt) ? dt.toISOString().split('T')[0] : String(r[tDate]).split(' ')[0];
        if (!agg[dStr]) agg[dStr] = {rev: 0, exp: 0};
        agg[dStr].rev += Number(r[tRev]) || 0;
        agg[dStr].exp += Number(r[tExp]) || 0;
      });
      const sorted = Object.entries(agg).sort((a,b) => a[0].localeCompare(b[0]));
      const dx = sorted.map(s => s[0]);
      const dr = sorted.map(s => s[1].rev);
      const de = sorted.map(s => s[1].exp);
      const hover = sorted.map(s => `Net Profit: $${(s[1].rev - s[1].exp).toFixed(2)}`);
      
      chart = {
        data: [
          {type: 'scatter', mode: 'lines+markers', name: tRev, x: dx, y: dr, marker: {color: '#00e676'}, text: hover, hoverinfo: 'x+y+text'},
          {type: 'scatter', mode: 'lines+markers', name: tExp, x: dx, y: de, marker: {color: '#ff5c5c'}, text: hover, hoverinfo: 'x+y+text'}
        ],
        layout: { title: 'Cumulative Revenue vs. Expense', xaxis: {title: {text: tDate}}, yaxis: {title: {text: 'Amount ($)'}}, showlegend: true }
      };
    } else if (pProd && pQty) {
      const agg = {};
      cleaned.forEach(r => {
        const p = String(r[pProd]);
        agg[p] = (agg[p] || 0) + (Number(r[pQty]) || 0);
      });
      const sorted = Object.entries(agg).sort((a,b) => b[1] - a[1]).slice(0, 20);
      chart = {
        data: [{type: 'bar', x: sorted.map(s => s[0]), y: sorted.map(s => s[1]), marker: {color: '#38BDF8'}}],
        layout: { title: 'Top Performers (Pareto)', xaxis: {title: {text: pProd}, automargin: true, tickangle: -45}, yaxis: {title: {text: pQty}} }
      };
    } else if (cChan && cCac && cLtv) {
      const cx = cleaned.map(r => Number(r[cCac]) || 0);
      const cy = cleaned.map(r => Number(r[cLtv]) || 0);
      const ct = cleaned.map(r => String(r[cChan]));
      const avgX = cx.reduce((a,b)=>a+b,0) / (cx.length||1);
      const avgY = cy.reduce((a,b)=>a+b,0) / (cy.length||1);
      chart = {
        data: [{type: 'scatter', mode: 'markers+text', x: cx, y: cy, text: ct, textposition: 'top center', marker: {color: '#38BDF8', size: 10}}],
        layout: {
          title: 'CAC vs. LTV by Channel', xaxis: {title: {text: cCac}}, yaxis: {title: {text: cLtv}},
          shapes: [
            {type: 'line', x0: avgX, x1: avgX, y0: 0, y1: Math.max(...cy), line: {color: '#f5b400', dash: 'dash'}},
            {type: 'line', x0: 0, x1: Math.max(...cx), y0: avgY, y1: avgY, line: {color: '#f5b400', dash: 'dash'}}
          ]
        }
      };
    } else if (hCust && tDate) {
      const formatMonth = (d) => {
        let dt = new Date(d);
        if (!isNaN(dt)) {
            // Adjust for local timezone to prevent month shifting
            dt = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
            return dt.toISOString().substring(0,7);
        }
        return String(d).substring(0,7);
      };
      
      const first = {};
      cleaned.forEach(r => {
        const c = String(r[hCust]);
        let dStr = formatMonth(r[tDate]);
        if (!first[c] || dStr < first[c]) first[c] = dStr;
      });
      const cohorts = {};
      cleaned.forEach(r => {
        const c = String(r[hCust]);
        let dStr = formatMonth(r[tDate]);
        const start = first[c];
        const sy = parseInt(start.substring(0,4))||0, sm = parseInt(start.substring(5,7))||0;
        const dy = parseInt(dStr.substring(0,4))||0, dm = parseInt(dStr.substring(5,7))||0;
        const mDiff = (dy - sy) * 12 + (dm - sm);
        if (mDiff >= 0) {
          if (!cohorts[start]) cohorts[start] = {};
          if (!cohorts[start][mDiff]) cohorts[start][mDiff] = new Set();
          cohorts[start][mDiff].add(c);
        }
      });
      const cKeys = Object.keys(cohorts).sort();
      const maxM = Math.max(...cKeys.flatMap(k => Object.keys(cohorts[k]).map(Number)));
      if (maxM > 0) {
        const z = cKeys.map(k => {
          const base = cohorts[k][0]?.size || 1;
          return Array.from({length: maxM + 1}, (_, i) => (cohorts[k][i] ? cohorts[k][i].size / base * 100 : 0));
        });
        chart = {
          data: [{ type: 'heatmap', x: Array.from({length: maxM + 1}, (_, i) => `Month ${i}`), y: cKeys, z: z, colorscale: 'Blues', hovertemplate: 'Cohort: %{y}<br>Month: %{x}<br>Retention: %{z:.1f}%<extra></extra>' }],
          layout: { title: 'Repeat Customer Cohort Retention', yaxis: {title: {text: 'Cohort Start Month'}, autorange: 'reversed'} }
        };
      }
    } else if (dCat && tExp) {
      const agg = {};
      cleaned.forEach(r => {
        const c = String(r[dCat]);
        agg[c] = (agg[c] || 0) + (Number(r[tExp]) || 0);
      });
      const sorted = Object.entries(agg).sort((a,b) => b[1] - a[1]);
      chart = {
        data: [{ type: 'pie', labels: sorted.map(s => s[0]), values: sorted.map(s => s[1]), hole: 0.5, marker: {colors: ['#00e676', '#38bdf8', '#f5b400', '#ff5c5c', '#60836c']} }],
        layout: { title: 'Expense Breakdown' }
      };
    }
    
    if (!chart) {
      if(x&&y&&z&&task!=='Plot Results')chart={data:[{type:'scatter3d',mode:'markers',x:chartRows.map(r=>r[x]),y:chartRows.map(r=>r[y]),z:chartRows.map(r=>r[z]),marker:{size:2.5,color:chartRows.map(r=>r[z]),colorscale:[[0,'#12506a'],[.5,'#38BDF8'],[1,'#c6f2ff']],opacity:.8}}],layout:{scene:{xaxis:{title:{text:x}},yaxis:{title:{text:y}},zaxis:{title:{text:z}}}}};
      else if(x)chart={data:[{type:y?'scattergl':'histogram',mode:'markers',x:chartRows.map(r=>r[x]),...(y?{y:chartRows.map(r=>r[y])}:{}),marker:{color:'#38BDF8',size:5}}],layout:{xaxis:{title:{text:x}},yaxis:{title:{text:y||'Count'}}}};
      else {
        let bestCol = fields[0];
        let minUniq = Infinity;
        fields.forEach(f => {
          const uniq = new Set(cleaned.map(r => r[f])).size;
          if (uniq > 1 && uniq < cleaned.length && uniq < minUniq) {
            minUniq = uniq;
            bestCol = f;
          }
        });
        const counts={};cleaned.forEach(r=>{const s=String(r[bestCol]);counts[s]=(counts[s]||0)+1;});
        const pairs=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20);
        chart={data:[{type:'bar',x:pairs.map(p=>p[0]),y:pairs.map(p=>p[1]),marker:{color:'#38BDF8'}}],layout:{title: `Distribution by ${bestCol}`, xaxis:{title:{text:bestCol}, automargin: true, tickangle: -45}, yaxis:{title:{text:'Count'}}}}
      }
    }
  }
  return{status:'success',stats,anomalies,cleaned,chart_json:chart,summary_source:'local',ai_summary:`Analyzed ${rows.length.toLocaleString()} records across ${fields.length} fields. Found ${missing.toLocaleString()} missing values and removed ${stats.duplicates.toLocaleString()} duplicate rows. Numeric gaps were filled with column medians; text gaps use “Unknown”. ${anomalies.length.toLocaleString()} values were flagged by IQR or Z-score screening. ${numeric.length?`The dataset contains ${numeric.length} numeric fields suitable for statistical comparison.`:'No numeric fields were detected; the chart shows category frequencies.'} Outlier flags are screening results, not confirmed errors.`};
}
export function makeSample(){return Array.from({length:2400},(_,i)=>{const a=i*2.3999632297,r=Math.sqrt(i/2400)*11;return{x:+(Math.cos(a)*r).toFixed(3),y:+(Math.sin(a)*r).toFixed(3),z:+(Math.sin(r*.8)*2.8+Math.cos(a*3)*.7+Math.sin(i*17.31)*.3).toFixed(3)};});}
