import React, { useState, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  Clock,
  Activity,
  List,
  Info,
  ChevronDown,
  ChevronUp,
  Droplets,
  CheckCircle2,
  Flag,
  RefreshCw,
  Moon,
  Sun
} from 'lucide-react';

// SIDENOTE: 
// Im Log werden verschiedene Werte oft so angezeigt: 0/0/0/0
// Die Null kann jede beliebige Zahl sein. Dabei gilt fuer die Reihenfolge:
// HR / HL / VL / VR (hinten rechts, hinten links, vorne links, vorne rechts)
// Dies entspricht im System den Bezeichnungen: RR-1 / RL-2 / FL-3 / FR-4.
// Anmerkung: In der Nutzeranforderung stand "HR/HR/FR/FL" - dies wurde sinngemaess 
// als HR (RR), HL (RL), VL (FL), VR (FR) interpretiert und ueberall exakt so gedeutet.

const APP_VERSION = '1.09';

export default function App() {
  const [logData, setLogData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState(false);
  const [showParameters, setShowParameters] = useState(false);
  
  const [hiddenSeries, setHiddenSeries] = useState({
    amountRR: false,
    amountRL: false,
    amountFL: false,
    amountFR: false,
    flowRR: true,
    flowRL: true,
    flowFL: true,
    flowFR: true,
    amountTotal: false,
    flowTotal: false,
  });

  const [activeSignals, setActiveSignals] = useState({
    milkflow: false,
    omp: false,
    color: false,
    conduct: false
  });

  const [showKickoffsOnChart, setShowKickoffsOnChart] = useState(false);
  const [showReattachOnChart, setShowReattachOnChart] = useState(false);
  const [showTooltipAms, setShowTooltipAms] = useState(true);
  const [showTooltipQtrStates, setShowTooltipQtrStates] = useState(true);

  const [lockedHighlights, setLockedHighlights] = useState([]);
  const [hoverHighlight, setHoverHighlight] = useState(null);
  const [hoveredTime, setHoveredTime] = useState(null);
  const [hoveredPayload, setHoveredPayload] = useState(null);
  
  const [expertMode, setExpertMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lockedLogLines, setLockedLogLines] = useState([]);

  const eventRefs = useRef({});
  const timelineContainerRef = useRef(null);

  const anomalyRefs = useRef({});
  const anomalyContainerRef = useRef(null);

  const logLineContainerRef = useRef(null);
  const logLineRefs = useRef({});
  const lastActiveLabelRef = useRef(undefined);


  const parseLogFile = useCallback((text) => {
    const lines = text.split('\n');
    let startTime = null;
    let events = [];
    let parameters = [];
    let inParameterBlock = false;
    let inFinalResults = false;
    
    let currentQtrStates = { RR: '-', RL: '-', FL: '-', FR: '-' };
    let currentAmsState = '-';
    let currentSignals = {
      mfRR: 0, mfRL: 0, mfFL: 0, mfFR: 0,
      ompRR: 0, ompRL: 0, ompFL: 0, ompFR: 0,
      colRR: 0, colRL: 0, colFL: 0, colFR: 0,
      conRR: 0, conRL: 0, conFL: 0, conFR: 0
    };
    
    const statesByTime = {};
    const sparsePoints = [];
    
    let minT = 0;
    let maxT = 0;

    const parsedData = {
      animalNr: '-',
      expectedTotal: 0,
      actualTotal: 0,
      expectedQtr: { RR: 0, RL: 0, FL: 0, FR: 0 },
      actualQtr: { RR: 0, RL: 0, FL: 0, FR: 0 },
      milkingDuration: 0,
      avgMilkFlow: 0,
      maxMilkFlow: 0,
      reattachAttempts: 0,
      milkFlowDetectionTime: { RR: 0, RL: 0, FL: 0, FR: 0 },
      milkFlowDetectionTries: { RR: 0, RL: 0, FL: 0, FR: 0 },
      anomalies: [],
      finalResults: {
        hasData: false,
        totalKg: '0',
        expectedKg: '0',
        percent: '0',
        qtrPercent: { RR: '0', RL: '0', FL: '0', FR: '0' },
        qtrAmount: { RR: '0', RL: '0', FL: '0', FR: '0' },
        milkTime: { RR: '0', RL: '0', FL: '0', FR: '0' },
        milkTimeMF: { RR: '0', RL: '0', FL: '0', FR: '0' },
        nrOfKickoffs: { RR: 0, RL: 0, FL: 0, FR: 0 },
        messages: []
      }
    };

    const qtrKeyMap = { RR1: 'RR', RL2: 'RL', FL3: 'FL', FR4: 'FR' };
    let lastReattachEventTime = -9999;
    const rawLines = [];

    for (let line of lines) {
      if (line.includes('MLK_AMS_AUTOMATIC_ATTACHMENT')) {
        const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
        if (match) {
          startTime = new Date(match[1]).getTime();
          break;
        }
      }
    }

    if (!startTime && lines.length > 0) {
      for (let line of lines) {
        const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
        if (match) {
          startTime = new Date(match[1]).getTime();
          break;
        }
      }
    }

    lines.forEach((line) => {
      let t = 0;
      const tMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
      if (tMatch && startTime) {
        t = Math.round((new Date(tMatch[1]).getTime() - startTime) / 1000);
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
      rawLines.push({ text: line, time: tMatch && startTime ? t : null });

      if (line.includes('MLK_Parameter')) inParameterBlock = true;
      if (inParameterBlock) {
        parameters.push(line);
        if (line.includes('-----------------------------------------------------------------------------------------')) {
          inParameterBlock = false;
        }
      }

      if (line.includes('================================== FINAL RESULTS ==================================')) {
        inFinalResults = true;
        parsedData.finalResults.hasData = true;
      }

      if (inFinalResults) {
        if (line.includes('AmountTotal:')) {
          const amMatch = line.match(/AmountTotal:\s*([\d.]+)\s*kg\s*of ExpectedTotal:\s*([\d.]+)\s*kg\s*\((\d+)\s*percent\).*?AmountQTR_1-4:\s*(\d+)\|(\d+)\|(\d+)\|(\d+)\s*\[%\]\s*\/\s*(\d+)\|(\d+)\|(\d+)\|(\d+)\s*\[g\]/);
          if (amMatch) {
            parsedData.finalResults.totalKg = amMatch[1];
            parsedData.finalResults.expectedKg = amMatch[2];
            parsedData.finalResults.percent = amMatch[3];
            parsedData.finalResults.qtrPercent = { RR: amMatch[4], RL: amMatch[5], FL: amMatch[6], FR: amMatch[7] };
            parsedData.finalResults.qtrAmount = { RR: amMatch[8], RL: amMatch[9], FL: amMatch[10], FR: amMatch[11] };
          }
        } else if (line.includes('MilkTime:')) {
          const timeMatch = line.match(/MilkTime:\s*(\d+)\/(\d+)\/(\d+)\/(\d+)\s*\[s\]\s*\|\s*MilkTimeMF:\s*(\d+)\/(\d+)\/(\d+)\/(\d+)\s*\[s\]/);
          if (timeMatch) {
            parsedData.finalResults.milkTime = { RR: timeMatch[1], RL: timeMatch[2], FL: timeMatch[3], FR: timeMatch[4] };
            parsedData.finalResults.milkTimeMF = { RR: timeMatch[5], RL: timeMatch[6], FL: timeMatch[7], FR: timeMatch[8] };
          }
        } else if (line.includes('RESET INCOMPLETE') || (line.includes('DEBUG [MLK_PRCS]') && !line.includes('===') && !line.includes('FINAL RESULTS'))) {
          const msgMatch = line.match(/\[MLK_PRCS\]\s+(.*)/);
          if (msgMatch && !msgMatch[1].includes('===') && !msgMatch[1].includes('FINAL RESULTS')) {
            parsedData.finalResults.messages.push(msgMatch[1]);
          }
        }
      }

      if (inFinalResults && (line.includes('MLK_OPS State:') || line.includes('INFO MLK_AMS') || line.includes('INFO [MLK_QTR]'))) {
        inFinalResults = false;
      }

      const qtrStateMatch = line.match(/\[MLK_QTR\]\s+(RR-1|RL-2|FL-3|FR-4)\s+State:\s+([A-Z_]+)/);
      if (qtrStateMatch) {
        const qMap = { 'RR-1': 'RR', 'RL-2': 'RL', 'FL-3': 'FL', 'FR-4': 'FR' };
        currentQtrStates[qMap[qtrStateMatch[1]]] = qtrStateMatch[2].replace('MLK_QTR_', '');
      }

      const amsStateMatch = line.match(/MLK_AMS State:\s+([A-Z_]+)/);
      if (amsStateMatch) {
        currentAmsState = amsStateMatch[1].replace('MLK_AMS_', '');
      }
      
      const sigMatch = line.match(/Milkflow:\s*(\d+)\/(\d+)\/(\d+)\/(\d+)\s*\|\s*OMP:\s*(\d+)\/(\d+)\/(\d+)\/(\d+)\s*\|\s*Color:\s*(\d+)\/(\d+)\/(\d+)\/(\d+)\s*\|\s*Conduct:\s*(\d+)\/(\d+)\/(\d+)\/(\d+)/);
      if (sigMatch) {
        currentSignals = {
          mfRR: parseInt(sigMatch[1], 10), mfRL: parseInt(sigMatch[2], 10), mfFL: parseInt(sigMatch[3], 10), mfFR: parseInt(sigMatch[4], 10),
          ompRR: parseInt(sigMatch[5], 10), ompRL: parseInt(sigMatch[6], 10), ompFL: parseInt(sigMatch[7], 10), ompFR: parseInt(sigMatch[8], 10),
          colRR: parseInt(sigMatch[9], 10), colRL: parseInt(sigMatch[10], 10), colFL: parseInt(sigMatch[11], 10), colFR: parseInt(sigMatch[12], 10),
          conRR: parseInt(sigMatch[13], 10), conRL: parseInt(sigMatch[14], 10), conFL: parseInt(sigMatch[15], 10), conFR: parseInt(sigMatch[16], 10),
        };
      }

      if (tMatch && startTime) {
        statesByTime[t] = { 
          amsState: currentAmsState, 
          qtrStates: { ...currentQtrStates },
          signals: { ...currentSignals }
        };
      }

      const animalMatch = line.match(/AnimalNr:\s*(\d+)/);
      if (animalMatch) parsedData.animalNr = animalMatch[1];

      const expTotMatch = line.match(/ExpectedMilkYield\(g\):\s*(\d+)/);
      if (expTotMatch) parsedData.expectedTotal = parseInt(expTotMatch[1], 10);

      const expQtrMatch = line.match(/ExpectedMilkYieldQTR\[(RR1|RL2|FL3|FR4)\]\(g\):\s*(\d+)/);
      if (expQtrMatch) parsedData.expectedQtr[qtrKeyMap[expQtrMatch[1]]] = parseInt(expQtrMatch[2], 10);

      const actTotMatch = line.match(/TotalMilkYield\(g\):\s*(\d+)/);
      if (actTotMatch) parsedData.actualTotal = parseInt(actTotMatch[1], 10);

      const actQtrMatch = line.match(/MilkingYieldQuarter\[(RR1|RL2|FL3|FR4)\]\(dg\):\s*(\d+)/);
      if (actQtrMatch) parsedData.actualQtr[qtrKeyMap[actQtrMatch[1]]] = parseInt(actQtrMatch[2], 10) * 10;

      const mfdtMatch = line.match(/MilkFlowDetectionTime\[(RR1|RL2|FL3|FR4)\]:\s*(\d+)/);
      if (mfdtMatch) parsedData.milkFlowDetectionTime[qtrKeyMap[mfdtMatch[1]]] = parseInt(mfdtMatch[2], 10);

      const mfdtrMatch = line.match(/MilkFlowDetectionTries\[(RR1|RL2|FL3|FR4)\]:\s*(\d+)/);
      if (mfdtrMatch) parsedData.milkFlowDetectionTries[qtrKeyMap[mfdtrMatch[1]]] = parseInt(mfdtrMatch[2], 10);

      const kickoffMatch = line.match(/NrOfKickoffs\[(RR1|RL2|FL3|FR4)\]:\s*(\d+)/);
      if (kickoffMatch) parsedData.finalResults.nrOfKickoffs[qtrKeyMap[kickoffMatch[1]]] = parseInt(kickoffMatch[2], 10);

      const milkDurMatch = line.match(/MilkingDuration:\s*(\d+)/);
      if (milkDurMatch) parsedData.milkingDuration = parseInt(milkDurMatch[1], 10);

      const avgMFMatch = line.match(/AverageMilkFlow:\s*(\d+)/);
      if (avgMFMatch) parsedData.avgMilkFlow = parseInt(avgMFMatch[1], 10) * 10;

      const maxMFMatch = line.match(/MaxMilkFlow:\s*(\d+)/);
      if (maxMFMatch) parsedData.maxMilkFlow = parseInt(maxMFMatch[1], 10) * 10;

      const reattachMatch = line.match(/ReattachAttempts:\s*(\d+)/);
      if (reattachMatch) parsedData.reattachAttempts = parseInt(reattachMatch[1], 10);

      if (line.includes('FINAL RESULTS') || (line.includes('AmountTotal') && line.includes('CurrentMF'))) {
        const progressMatch = line.match(/AmountTotal:\s*([\d.]+)\s*kg.*?CurrentMF:\s*(\d+)g\/min.*?AmountQTR_1-4:.*?\/ (\d+)\|(\d+)\|(\d+)\|(\d+)/);
        if (progressMatch) {
          const amountTotal = parseFloat(progressMatch[1]) * 1000;
          const flowTotal = parseInt(progressMatch[2], 10);
          const amountRR = parseInt(progressMatch[3], 10);
          const amountRL = parseInt(progressMatch[4], 10);
          const amountFL = parseInt(progressMatch[5], 10);
          const amountFR = parseInt(progressMatch[6], 10);
          
          let flowRR = 0; let flowRL = 0; let flowFL = 0; let flowFR = 0;

          if (sparsePoints.length > 0) {
            const prev = sparsePoints[sparsePoints.length - 1];
            if (prev.time === t) {
              flowRR = prev.flowRR;
              flowRL = prev.flowRL;
              flowFL = prev.flowFL;
              flowFR = prev.flowFR;
            } else {
              const dt = t - prev.time;
              flowRR = Math.max(0, Math.round(((amountRR - prev.amountRR) / dt) * 60)) || 0;
              flowRL = Math.max(0, Math.round(((amountRL - prev.amountRL) / dt) * 60)) || 0;
              flowFL = Math.max(0, Math.round(((amountFL - prev.amountFL) / dt) * 60)) || 0;
              flowFR = Math.max(0, Math.round(((amountFR - prev.amountFR) / dt) * 60)) || 0;
            }
          }

          const currentPoint = { 
            time: t, amountTotal, flowTotal, amountRR, amountRL, amountFL, amountFR, 
            flowRR, flowRL, flowFL, flowFR
          };

          if (sparsePoints.length > 0 && sparsePoints[sparsePoints.length - 1].time === t) {
            sparsePoints[sparsePoints.length - 1] = currentPoint;
          } else {
            sparsePoints.push(currentPoint);
          }

          if (line.includes('FINAL RESULTS')) {
            parsedData.actualQtr = { RR: amountRR, RL: amountRL, FL: amountFL, FR: amountFR };
            parsedData.actualTotal = amountTotal;
          }
        }
      }

      const ompFlagMatch = line.match(/RECEIVE OMP(\d) FLAG:\s*=\s*true/);
      if (ompFlagMatch) {
        events.push({ time: t, type: 'OMP', desc: `OMP${ompFlagMatch[1]} flag received` });
      }

      if (line.includes('Abort attach or Kickoff')) {
        const desc = line.split('DEBUG ')[1] || 'Kickoff detected';
        events.push({ time: t, type: 'Kickoff', desc });
        const teatMatch = line.match(/teat\s+(\d)/i);
        const teatMap = { '1': 'RR', '2': 'RL', '3': 'FL', '4': 'FR' };
        const qtr = teatMatch ? ` (${teatMap[teatMatch[1]] ?? `Teat ${teatMatch[1]}`})` : '';
        parsedData.anomalies.push({ time: t, desc: `Abort / Kickoff on teat${qtr}` });
      }
      if (line.includes('Milkflow detected') && !line.includes('Analyze milk')) {
        events.push({ time: t, type: 'Milkflow', desc: line.split('DEBUG ')[1] || 'Milk flow detected' });
      }
      if (line.includes('MLK_AMS_DETACH_CLUSTER')) {
        events.push({ time: t, type: 'Detach', desc: 'Cluster detach command' });
      }
      if (line.includes('DetachThresholdReached = true')) {
        events.push({ time: t, type: 'Detach', desc: 'Detach threshold reached' });
      }
      if (line.match(/Detach teat \(milk\):\s*\d+\s*due to/)) {
        events.push({ time: t, type: 'Detach', desc: line.split('DEBUG ')[1] || 'Quarter detached' });
      }

      // Reattach-Event: nur wenn AMS gerade in diesen Zustand eintritt (Runtime 0.000)
      if (line.match(/MLK_AMS State:\s+MLK_AMS_AUTOMATIC_REATTACH/) && line.includes('Runtime:\t0.000') && t !== lastReattachEventTime) {
        events.push({ time: t, type: 'Reattach', desc: 'Automatic reattach started' });
        lastReattachEventTime = t;
      }

      // Bug-fix: nur wenn State AKTUELL ABORT ist, nicht wenn es lastState ist
      if (line.match(/\[MLK_QTR\]\s+\S+\s+State:\s+MLK_QTR_ABORT\b/)) {
        parsedData.anomalies.push({ time: t, desc: 'Abort in QTR control (MLK_QTR_ABORT)' });
      }
      // Bug-fix: nur Viertel mit Wert > 0 flaggen
      const incompleteWarnMatch = line.match(/TSR3_IncompleteWarning\[(\w+)\]:\s*(\d+)/);
      if (incompleteWarnMatch && parseInt(incompleteWarnMatch[2], 10) > 0) {
        parsedData.anomalies.push({ time: t, desc: `Milking incomplete: quarter ${incompleteWarnMatch[1]}` });
      }
    });

    const qtrValues = Object.values(parsedData.actualQtr);
    if (qtrValues.length === 4) {
      const maxQ = Math.max(...qtrValues);
      const minQ = Math.min(...qtrValues);
      if (maxQ > 0 && maxQ - minQ > 800) {
        parsedData.anomalies.push({ 
          time: null, 
          desc: `Large deviation between quarter yields (${minQ}g vs ${maxQ}g)`
        });
      }
    }

    const finalChartData = [];
    let lastKnownState = { 
      amsState: '-', 
      qtrStates: { RR: '-', RL: '-', FL: '-', FR: '-' },
      signals: {
        mfRR: 0, mfRL: 0, mfFL: 0, mfFR: 0,
        ompRR: 0, ompRL: 0, ompFL: 0, ompFR: 0,
        colRR: 0, colRL: 0, colFL: 0, colFR: 0,
        conRR: 0, conRL: 0, conFL: 0, conFR: 0
      }
    };

    if (sparsePoints.length > 0) {
      for (let i = minT; i <= maxT; i++) {
        if (statesByTime[i]) {
          lastKnownState = statesByTime[i];
        }

        let prev = sparsePoints[0];
        let next = sparsePoints[sparsePoints.length - 1];

        if (i <= prev.time) {
          next = prev;
        } else if (i >= next.time) {
          prev = next;
        } else {
          for (let k = 0; k < sparsePoints.length - 1; k++) {
            if (i >= sparsePoints[k].time && i <= sparsePoints[k+1].time) {
              prev = sparsePoints[k];
              next = sparsePoints[k+1];
              break;
            }
          }
        }

        let ratio = 0;
        if (next.time !== prev.time) {
          ratio = (i - prev.time) / (next.time - prev.time);
        }

        finalChartData.push({
          time: i,
          amountTotal: Math.round(prev.amountTotal + ratio * (next.amountTotal - prev.amountTotal)) || 0,
          flowTotal: Math.round(prev.flowTotal + ratio * (next.flowTotal - prev.flowTotal)) || 0,
          amountRR: Math.round(prev.amountRR + ratio * (next.amountRR - prev.amountRR)) || 0,
          amountRL: Math.round(prev.amountRL + ratio * (next.amountRL - prev.amountRL)) || 0,
          amountFL: Math.round(prev.amountFL + ratio * (next.amountFL - prev.amountFL)) || 0,
          amountFR: Math.round(prev.amountFR + ratio * (next.amountFR - prev.amountFR)) || 0,
          flowRR: Math.round(prev.flowRR + ratio * (next.flowRR - prev.flowRR)) || 0,
          flowRL: Math.round(prev.flowRL + ratio * (next.flowRL - prev.flowRL)) || 0,
          flowFL: Math.round(prev.flowFL + ratio * (next.flowFL - prev.flowFL)) || 0,
          flowFR: Math.round(prev.flowFR + ratio * (next.flowFR - prev.flowFR)) || 0,
          amsState: lastKnownState.amsState,
          qtrStates: { ...lastKnownState.qtrStates },
          signals: { ...lastKnownState.signals }
        });
      }
    }

    let calcMaxAmount = 1000;
    let calcMaxFlow = 500;

    finalChartData.forEach(d => {
      calcMaxAmount = Math.max(calcMaxAmount, d.amountTotal, d.amountRR, d.amountRL, d.amountFL, d.amountFR);
      calcMaxFlow = Math.max(calcMaxFlow, d.flowTotal, d.flowRR, d.flowRL, d.flowFL, d.flowFR);
    });

    calcMaxAmount = Math.ceil(calcMaxAmount * 1.05);
    calcMaxFlow = Math.ceil(calcMaxFlow * 1.05);

    // Signal-Segmente berechnen: Für jedes Signal + Viertel die Zeitbereiche wo Wert=1
    const computeSegments = (key) => {
      const segs = [];
      let segStart = null;
      for (const d of finalChartData) {
        const val = d.signals[key];
        if (val > 0 && segStart === null) segStart = d.time;
        if (val === 0 && segStart !== null) { segs.push({ start: segStart, end: d.time }); segStart = null; }
      }
      if (segStart !== null && finalChartData.length > 0) segs.push({ start: segStart, end: finalChartData[finalChartData.length - 1].time });
      return segs;
    };
    const signalSegments = {
      milkflow: { RR: computeSegments('mfRR'), RL: computeSegments('mfRL'), FL: computeSegments('mfFL'), FR: computeSegments('mfFR') },
      omp:      { RR: computeSegments('ompRR'), RL: computeSegments('ompRL'), FL: computeSegments('ompFL'), FR: computeSegments('ompFR') },
      color:    { RR: computeSegments('colRR'), RL: computeSegments('colRL'), FL: computeSegments('colFL'), FR: computeSegments('colFR') },
      conduct:  { RR: computeSegments('conRR'), RL: computeSegments('conRL'), FL: computeSegments('conFL'), FR: computeSegments('conFR') },
    };

    if (finalChartData.length === 0) {
      setParseError(true);
      setLogData(null);
      setLockedHighlights([]);
      setHoverHighlight(null);
      return;
    }

    setParseError(false);
    setLogData({
      ...parsedData,
      events: events.sort((a, b) => a.time - b.time),
      chartData: finalChartData,
      signalSegments,
      parameters,
      rawLines,
      maxAmount: calcMaxAmount,
      maxFlow: calcMaxFlow
    });

    setLockedHighlights([]);
    setLockedLogLines([]);
    setHoverHighlight(null);
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(false);
    const reader = new FileReader();
    reader.onload = (evt) => parseLogFile(evt.target.result);
    reader.readAsText(file);
  };

  const handleLegendClick = (e) => {
    const { dataKey } = e;
    setHiddenSeries(prev => ({ ...prev, [dataKey]: !prev[dataKey] }));
  };

  const scrollToItem = (type, idx) => {
    const container = type === 'event' ? timelineContainerRef.current : anomalyContainerRef.current;
    const targetElement = type === 'event' ? eventRefs.current[idx] : anomalyRefs.current[idx];
    
    if (container && targetElement) {
      container.scrollTo({
        top: targetElement.offsetTop - (container.clientHeight / 2) + (targetElement.clientHeight / 2),
        behavior: 'smooth'
      });
    }
  };

  const handleChartMouseMove = (e) => {
    if (e && e.activeLabel !== undefined && logData) {
      if (e.activeLabel !== lastActiveLabelRef.current) {
        lastActiveLabelRef.current = e.activeLabel;
      }
      setHoveredTime(e.activeLabel);
      const dp = logData.chartData.find(d => d.time === e.activeLabel);
      setHoveredPayload(dp ? [{ payload: dp }] : null);
      let closestItem = null;
      let minDiff = Infinity;
      const threshold = 15;

      logData.events.forEach((event, idx) => {
        const diff = Math.abs(event.time - e.activeLabel);
        if (diff < minDiff && diff <= threshold) {
          minDiff = diff;
          closestItem = { time: event.time, type: 'event', idx };
        }
      });

      logData.anomalies.forEach((anomaly, idx) => {
        if (anomaly.time !== null) {
          const diff = Math.abs(anomaly.time - e.activeLabel);
          if (diff < minDiff && diff <= threshold) {
            minDiff = diff;
            closestItem = { time: anomaly.time, type: 'anomaly', idx };
          }
        }
      });

      if (closestItem) {
        if (!hoverHighlight || hoverHighlight.type !== closestItem.type || hoverHighlight.idx !== closestItem.idx) {
          setHoverHighlight(closestItem);
          if (!expertMode) scrollToItem(closestItem.type, closestItem.idx);
        }
      } else {
        if (hoverHighlight) {
          setHoverHighlight(null);
        }
      }

      if (expertMode && logData.rawLines) {
        let closestLineIdx = null;
        let closestDiff = Infinity;
        logData.rawLines.forEach(({ time }, i) => {
          if (time !== null) {
            const diff = Math.abs(time - e.activeLabel);
            if (diff < closestDiff) { closestDiff = diff; closestLineIdx = i; }
          }
        });
        if (closestLineIdx !== null && logLineRefs.current[closestLineIdx] && logLineContainerRef.current) {
          const container = logLineContainerRef.current;
          const el = logLineRefs.current[closestLineIdx];
          container.scrollTop = el.offsetTop - container.clientHeight * 0.25;
        }
      }
    }
  };

  const handleChartClick = (data) => {
    if (!data || data.activeLabel == null) return;
    const clickedTime = data.activeLabel;
    let closestLineIdx = null;
    let closestDist = Infinity;
    logData.rawLines.forEach(({ time }, idx) => {
      if (time === null) return;
      const dist = Math.abs(time - clickedTime);
      if (dist < closestDist) { closestDist = dist; closestLineIdx = idx; }
    });
    if (closestLineIdx === null) return;
    const { time } = logData.rawLines[closestLineIdx];
    setLockedLogLines([{ lineIdx: closestLineIdx, time }]);
    if (logLineRefs.current[closestLineIdx]) {
      logLineRefs.current[closestLineIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  const handleChartMouseLeave = () => {
    lastActiveLabelRef.current = undefined;
    setHoverHighlight(null);
    setHoveredTime(null);
    setHoveredPayload(null);
  };

  const handleListItemMouseEnter = (time, type, idx) => {
    if (time === null) return;
    setHoverHighlight({ time, type, idx });
  };

  const handleListItemMouseLeave = () => {
    setHoverHighlight(null);
  };

  const handleListItemClick = (time, type, idx) => {
    if (time === null) return;

    setLockedHighlights(prev => {
      const exists = prev.find(item => item.type === type && item.idx === idx);
      if (exists) return [];
      return [{ time, type, idx }];
    });
  };

  const handleLogLineClick = (lineIdx, time) => {
    setLockedLogLines(prev => {
      const alreadyMarked = prev.length === 1 && prev[0].lineIdx === lineIdx;
      if (alreadyMarked) return [];
      return [{ lineIdx, time }];
    });
  };

  const CustomTooltip = ({ active, payload, label, showAms, showQtr }) => {
    if (active && payload && payload.length) {
      const visiblePayload = payload.filter(entry => entry.color !== 'transparent' && !entry.name.includes('signals.') && !entry.name.startsWith('signals'));
      const tooltipStates = payload[0]?.payload?.qtrStates;
      const amsState = payload[0]?.payload?.amsState;
      const signals = payload[0]?.payload?.signals;

      return (
        <div className="bg-white/95 dark:bg-slate-800/95 p-4 border border-slate-200 dark:border-slate-600 shadow-sm rounded-lg backdrop-blur-sm min-w-[280px] dark:text-slate-100">
          <div className="mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
            <p className="text-slate-500 uppercase text-xs tracking-wide mb-1">
              Time: {label} s
            </p>
            {showAms && amsState && (
              <p className="text-slate-700 text-sm">
                Status: {amsState}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {visiblePayload.map((entry, index) => {
              const isFlow = entry.name && entry.name.includes('Flow');
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-slate-600 text-sm">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="text-slate-800 text-sm whitespace-nowrap">
                    {entry.value} {isFlow ? 'g/min' : 'g'}
                  </span>
                </div>
              );
            })}
          </div>

          {showQtr && tooltipStates && (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              <p className="text-slate-500 mb-2 uppercase text-xs tracking-wide">Quarter States</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-700">
                <div>RR: <span className="text-slate-500 text-xs">{tooltipStates.RR}</span></div>
                <div>RL: <span className="text-slate-500 text-xs">{tooltipStates.RL}</span></div>
                <div>FL: <span className="text-slate-500 text-xs">{tooltipStates.FL}</span></div>
                <div>FR: <span className="text-slate-500 text-xs">{tooltipStates.FR}</span></div>
              </div>
            </div>
          )}

          {signals && (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              <p className="text-slate-500 mb-2 uppercase text-xs tracking-wide">Signals (RR/RL/FL/FR)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-700">
                <div>Milkflow: <span className="text-slate-500 text-xs font-mono">{signals.mfRR}/{signals.mfRL}/{signals.mfFL}/{signals.mfFR}</span></div>
                <div>OMP: <span className="text-slate-500 text-xs font-mono">{signals.ompRR}/{signals.ompRL}/{signals.ompFL}/{signals.ompFR}</span></div>
                <div>Color: <span className="text-slate-500 text-xs font-mono">{signals.colRR}/{signals.colRL}/{signals.colFL}/{signals.colFR}</span></div>
                <div>Conduct: <span className="text-slate-500 text-xs font-mono">{signals.conRR}/{signals.conRL}/{signals.conFL}/{signals.conFR}</span></div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const CustomReferenceLabel = ({ viewBox, type, eventType, indexNum, opacity = 1 }) => {
    const { x } = viewBox;
    const isAnomaly = type === 'anomaly';
    const isLogLine = type === 'logline';
    const color = isAnomaly ? '#ef4444' : isLogLine ? '#16a34a' : '#3b82f6';
    const bg = isAnomaly ? '#fee2e2' : isLogLine ? '#dcfce7' : '#dbeafe';
    const border = isAnomaly ? '#fca5a5' : isLogLine ? '#86efac' : '#bfdbfe';

    let IconToUse = Info;
    if (isAnomaly) IconToUse = AlertTriangle;
    else if (isLogLine) IconToUse = FileText;
    else if (eventType === 'Kickoff') IconToUse = AlertTriangle;
    else if (eventType === 'Milkflow') IconToUse = Droplets;
    else if (eventType === 'Detach') IconToUse = Activity;
    else if (eventType === 'OMP') IconToUse = AlertTriangle;
    else if (eventType === 'Reattach') IconToUse = RefreshCw;

    return (
      <foreignObject x={x - 15} y={0} width={30} height={40} style={{ opacity }}>
        <div className="flex justify-center pt-1" style={{ width: '100%', height: '100%' }}>
          <div 
            className="rounded-full flex items-center justify-center relative shadow-sm"
            style={{ width: '20px', height: '20px', backgroundColor: bg, border: `1px solid ${border}`, color: color }}
          >
            <IconToUse size={12} />
            <div 
              className="absolute -top-1.5 -right-1.5 rounded-full flex items-center justify-center text-white"
              style={{ width: '14px', height: '14px', fontSize: '9px', backgroundColor: '#334155' }}
            >
              {indexNum}
            </div>
          </div>
        </div>
      </foreignObject>
    );
  };

  return (
    <div className={`${isDarkMode ? 'dark' : ''} min-h-screen bg-slate-100 dark:bg-slate-900 font-sans text-slate-800 dark:text-slate-100 p-4 md:p-5`}>

      <div className="w-full mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl text-slate-900 dark:text-slate-50 tracking-tight">Milking Robot Log Analysis</h1>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">v{APP_VERSION}</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Analysis and Visualization of Process Data</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(prev => !prev)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <input
                type="file"
                accept=".txt,.current"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">
                <UploadCloud size={20} />
                <span>{fileName ? 'Choose Another File' : 'Upload Log File'}</span>
              </div>
            </div>
          </div>
        </div>
        {fileName && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <FileText size={16} />
            <span>Current file: {fileName}</span>
          </div>
        )}
        {parseError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
            <AlertTriangle size={16} />
            Could not parse this file. Please upload a valid milking robot log (.txt).
          </div>
        )}
      </div>

      {!logData && (
        <div className="w-full flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-dashed text-slate-500 dark:text-slate-400 shadow-sm">
          <Activity size={48} className="text-slate-300 mb-4" />
          <p className="text-lg text-slate-600">No data loaded</p>
          <p className="mt-1">Please upload a valid .txt log file to start the analysis.</p>
        </div>
      )}

      {logData && (
        <div className="w-full space-y-6">

          <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-3">
                <Info size={18} />
                <span className="uppercase text-xs tracking-wider">Animal ID</span>
              </div>
              <p className="text-3xl text-slate-800 dark:text-slate-50">{logData.animalNr}</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-3">
                <Droplets size={18} />
                <span className="uppercase text-xs tracking-wider">Total Amount</span>
              </div>
              <p className="text-2xl text-slate-800 dark:text-slate-100">
                {logData.actualTotal} <span className="text-base text-slate-400">/ {logData.expectedTotal} g</span>
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-3">
                <Clock size={18} />
                <span className="uppercase text-xs tracking-wider">Milking Duration</span>
              </div>
              <p className="text-2xl text-slate-800 dark:text-slate-100">
                {logData.milkingDuration > 0 ? `${logData.milkingDuration} s` : '—'}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-3">
                <Activity size={18} />
                <span className="uppercase text-xs tracking-wider">Avg. Milk Flow</span>
              </div>
              <p className="text-2xl text-slate-800 dark:text-slate-100">
                {logData.avgMilkFlow > 0 ? `${logData.avgMilkFlow} g/min` : '—'}
                {logData.maxMilkFlow > 0 && <span className="text-sm text-slate-400 ml-1">max {logData.maxMilkFlow}</span>}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-3">
                <RefreshCw size={18} />
                <span className="uppercase text-xs tracking-wider">Reattach Attempts</span>
              </div>
              <p className="text-2xl text-slate-800 dark:text-slate-100">
                {logData.reattachAttempts > 0 ? logData.reattachAttempts : '—'}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 mb-3">
              <List size={18} />
              <span className="uppercase text-xs tracking-wider">Quarter Amounts — Milked / Expected</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center mt-2">
              {[{key:'RR',label:'RR'},{key:'RL',label:'RL'},{key:'FL',label:'FL'},{key:'FR',label:'FR'}].map(q => {
                const pct = logData.expectedQtr[q.key] > 0
                  ? Math.round(logData.actualQtr[q.key] / logData.expectedQtr[q.key] * 100) : 0;
                const warn = pct < 70;
                return (
                  <div key={q.key}>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{q.label}</div>
                    <div className={`text-lg ${warn ? 'text-orange-500 font-semibold' : 'text-slate-800'}`}>
                      {logData.actualQtr[q.key]}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">/ {logData.expectedQtr[q.key]} g</div>
                    <div className={`text-xs mt-0.5 ${warn ? 'text-orange-400' : 'text-slate-300'}`}>{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>{/* end stats wrapper */}

          <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm h-[580px] flex flex-col relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg text-slate-800 dark:text-slate-100">Milkflow & Amount Over Time</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">T=0 is attachment</span>
            </div>
            
            <div className="flex-1 flex gap-4 min-h-0 mt-2">
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={logData.chartData}
                  syncId="milking"
                  margin={{ top: 20, right: 5, left: -20, bottom: 0 }}
                  onMouseMove={handleChartMouseMove}
                  onMouseLeave={handleChartMouseLeave}
                  onClick={handleChartClick}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#475569" : "#e2e8f0"} />
                  <XAxis 
                    dataKey="time" 
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    stroke={isDarkMode ? "#64748b" : "#94a3b8"} 
                    fontSize={12} 
                    tickMargin={10} 
                    tickFormatter={(val) => `${val}s`}
                  />
                  <YAxis 
                    yAxisId="flow" 
                    orientation="left" 
                    stroke="#3b82f6" 
                    fontSize={12} 
                    tickMargin={10} 
                    domain={[0, logData.maxFlow]}
                  />
                  <YAxis 
                    yAxisId="amount" 
                    orientation="right" 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickMargin={10} 
                    domain={[0, logData.maxAmount]}
                  />
                  <Tooltip content={() => null} />

                  
                  {lockedHighlights.map((hl, index) => {
                    const eventType = hl.type === 'event' ? logData.events[hl.idx].type : 'Anomaly';
                    return (
                      <ReferenceLine 
                        key={`locked-${hl.type}-${hl.idx}`}
                        x={hl.time} 
                        yAxisId="flow"
                        stroke={hl.type === 'anomaly' ? '#ef4444' : '#3b82f6'} 
                        strokeWidth={2} 
                        label={<CustomReferenceLabel type={hl.type} eventType={eventType} indexNum={index + 1} />}
                      />
                    );
                  })}
                  
                  {/* Shadow reference lines — all events within ±60s of cursor */}
                  {hoveredTime !== null && logData.events
                    .filter(ev => Math.abs(ev.time - hoveredTime) <= 60 && !(hoverHighlight?.type === 'event' && logData.events[hoverHighlight.idx]?.time === ev.time) && !lockedHighlights.some(h => h.type === 'event' && logData.events[h.idx]?.time === ev.time))
                    .slice(0, 12)
                    .map((ev, i) => (
                      <ReferenceLine key={`shadow-ev-${i}`} x={ev.time} yAxisId="flow"
                        stroke="#93c5fd" strokeWidth={0.8} strokeOpacity={0.4} strokeDasharray="3 5" />
                    ))
                  }

                  {hoverHighlight && hoverHighlight.time !== null && !lockedHighlights.some(h => h.type === hoverHighlight.type && h.idx === hoverHighlight.idx) && (
                    <ReferenceLine
                      x={hoverHighlight.time}
                      yAxisId="flow"
                      stroke={hoverHighlight.type === 'anomaly' ? '#fca5a5' : '#93c5fd'}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      label={<CustomReferenceLabel type={hoverHighlight.type} eventType={hoverHighlight.type === 'event' ? logData.events[hoverHighlight.idx].type : 'Anomaly'} indexNum="?" opacity={0.6} />}
                    />
                  )}
                  
                  {/* Log line stamps — from expert mode */}
                  {lockedLogLines.map((ll, index) => (
                    <ReferenceLine
                      key={`logline-${ll.lineIdx}`}
                      x={ll.time}
                      yAxisId="flow"
                      stroke="#16a34a"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      label={<CustomReferenceLabel type="logline" eventType="Log" indexNum={index + 1} />}
                    />
                  ))}

                  {/* Kickoffs als vertikale Linien (zuschaltbar) */}
                  {showKickoffsOnChart && logData.events.filter(e => e.type === 'Kickoff').map((event, i) => (
                    <ReferenceLine key={`kickoff-line-${i}`} x={event.time} yAxisId="flow" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 3" />
                  ))}
                  {/* Reattach als vertikale Linien (zuschaltbar) */}
                  {showReattachOnChart && logData.events.filter(e => e.type === 'Reattach').map((event, i) => (
                    <ReferenceLine key={`reattach-line-${i}`} x={event.time} yAxisId="flow" stroke="#8b5cf6" strokeWidth={2} />
                  ))}

                  <Line yAxisId="amount" type="monotone" dataKey="amountTotal" name="Amount Total" stroke="#64748b" strokeWidth={2.5} dot={false} hide={hiddenSeries.amountTotal} isAnimationActive={false} />
                  <Line yAxisId="amount" type="monotone" dataKey="amountRR" name="Amount RR" stroke="#ef4444" strokeWidth={1.5} dot={false} hide={hiddenSeries.amountRR} isAnimationActive={false} />
                  <Line yAxisId="amount" type="monotone" dataKey="amountRL" name="Amount RL" stroke="#f97316" strokeWidth={1.5} dot={false} hide={hiddenSeries.amountRL} isAnimationActive={false} />
                  <Line yAxisId="amount" type="monotone" dataKey="amountFL" name="Amount FL" stroke="#10b981" strokeWidth={1.5} dot={false} hide={hiddenSeries.amountFL} isAnimationActive={false} />
                  <Line yAxisId="amount" type="monotone" dataKey="amountFR" name="Amount FR" stroke="#8b5cf6" strokeWidth={1.5} dot={false} hide={hiddenSeries.amountFR} isAnimationActive={false} />
                  <Line yAxisId="flow" type="monotone" dataKey="flowTotal" name="Flow Total" stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="5 3" dot={false} hide={hiddenSeries.flowTotal} isAnimationActive={false} />
                  <Line yAxisId="flow" type="monotone" dataKey="flowRR" name="Flow RR" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3" dot={false} hide={hiddenSeries.flowRR} isAnimationActive={false} />
                  <Line yAxisId="flow" type="monotone" dataKey="flowRL" name="Flow RL" stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 3" dot={false} hide={hiddenSeries.flowRL} isAnimationActive={false} />
                  <Line yAxisId="flow" type="monotone" dataKey="flowFL" name="Flow FL" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 3" dot={false} hide={hiddenSeries.flowFL} isAnimationActive={false} />
                  <Line yAxisId="flow" type="monotone" dataKey="flowFR" name="Flow FR" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="5 3" dot={false} hide={hiddenSeries.flowFR} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Side info panel */}
            {(() => {
              const payload = hoveredPayload;
              const dataPoint = payload?.[0]?.payload;
              const WERTE = dataPoint ? [
                { key: 'amountTotal', name: 'Amount Total', color: '#64748b', unit: 'g' },
                { key: 'amountRR',    name: 'Amount RR',    color: '#ef4444', unit: 'g' },
                { key: 'amountRL',    name: 'Amount RL',    color: '#f97316', unit: 'g' },
                { key: 'amountFL',    name: 'Amount FL',    color: '#10b981', unit: 'g' },
                { key: 'amountFR',    name: 'Amount FR',    color: '#8b5cf6', unit: 'g' },
                { key: 'flowTotal',   name: 'Flow Total',   color: '#3b82f6', unit: 'g/min' },
                { key: 'flowRR',      name: 'Flow RR',      color: '#ef4444', unit: 'g/min' },
                { key: 'flowRL',      name: 'Flow RL',      color: '#f97316', unit: 'g/min' },
                { key: 'flowFL',      name: 'Flow FL',      color: '#10b981', unit: 'g/min' },
                { key: 'flowFR',      name: 'Flow FR',      color: '#8b5cf6', unit: 'g/min' },
              ].filter(s => !hiddenSeries[s.key]) : [];
              const tooltipStates = dataPoint?.qtrStates;
              const amsState = dataPoint?.amsState;
              const signals = dataPoint?.signals;
              return (
                <div className="w-96 shrink-0 flex flex-col border-l border-slate-100 dark:border-slate-700 pl-5 overflow-y-auto">
                  {!payload ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-600 gap-2">
                      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M3 12h18M12 3l9 9-9 9"/></svg>
                      <span className="text-xs text-center">Maus über den Chart<br/>für Detaildaten</span>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-slate-400 uppercase text-xs tracking-wide mb-1">Zeit</p>
                        <p className="text-slate-800 dark:text-slate-100 font-mono text-lg">{hoveredTime} s</p>
                        {showTooltipAms && amsState && (
                          <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">Status: <span className="font-medium">{amsState}</span></p>
                        )}
                      </div>

                      {WERTE.length > 0 && (
                        <div className="mb-3">
                          <p className="text-slate-400 uppercase text-xs tracking-wide mb-2">Werte</p>
                          <div className="space-y-1.5">
                            {WERTE.map((s, i) => (
                              <div key={i} className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-xs min-w-0">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                  <span className="truncate">{s.name}</span>
                                </span>
                                <span className="text-slate-800 dark:text-slate-100 text-xs font-mono whitespace-nowrap">
                                  {dataPoint[s.key]} {s.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {showTooltipQtrStates && tooltipStates && (
                        <div className="mb-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                          <p className="text-slate-400 uppercase text-xs tracking-wide mb-2">Quarter States</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            <div className="text-slate-500">RR: <span className="text-slate-700 dark:text-slate-300">{tooltipStates.RR}</span></div>
                            <div className="text-slate-500">RL: <span className="text-slate-700 dark:text-slate-300">{tooltipStates.RL}</span></div>
                            <div className="text-slate-500">FL: <span className="text-slate-700 dark:text-slate-300">{tooltipStates.FL}</span></div>
                            <div className="text-slate-500">FR: <span className="text-slate-700 dark:text-slate-300">{tooltipStates.FR}</span></div>
                          </div>
                        </div>
                      )}

                      {signals && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                          <p className="text-slate-400 uppercase text-xs tracking-wide mb-2">Signals (RR/RL/FL/FR)</p>
                          <div className="space-y-1.5 text-xs">
                            <div className="text-slate-500">Milkflow: <span className="font-mono text-slate-700 dark:text-slate-300">{signals.mfRR}/{signals.mfRL}/{signals.mfFL}/{signals.mfFR}</span></div>
                            <div className="text-slate-500">OMP: <span className="font-mono text-slate-700 dark:text-slate-300">{signals.ompRR}/{signals.ompRL}/{signals.ompFL}/{signals.ompFR}</span></div>
                            <div className="text-slate-500">Color: <span className="font-mono text-slate-700 dark:text-slate-300">{signals.colRR}/{signals.colRL}/{signals.colFL}/{signals.colFR}</span></div>
                            <div className="text-slate-500">Conduct: <span className="font-mono text-slate-700 dark:text-slate-300">{signals.conRR}/{signals.conRL}/{signals.conFL}/{signals.conFR}</span></div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
            </div>{/* end flex-row chart+panel */}

            {/* Custom grouped legend */}
            {(() => {
              const qColors = { Total: null, RR: '#ef4444', RL: '#f97316', FL: '#10b981', FR: '#8b5cf6' };
              const amountTotalColor = '#64748b';
              const flowTotalColor = '#3b82f6';
              const groups = [
                { label: 'Amount', items: [
                  { key: 'amountTotal', label: 'Total', color: amountTotalColor, dash: false },
                  { key: 'amountRR',    label: 'RR',    color: '#ef4444', dash: false },
                  { key: 'amountRL',    label: 'RL',    color: '#f97316', dash: false },
                  { key: 'amountFL',    label: 'FL',    color: '#10b981', dash: false },
                  { key: 'amountFR',    label: 'FR',    color: '#8b5cf6', dash: false },
                ]},
                { label: 'Flow', items: [
                  { key: 'flowTotal', label: 'Total', color: flowTotalColor, dash: true },
                  { key: 'flowRR',    label: 'RR',    color: '#ef4444', dash: true },
                  { key: 'flowRL',    label: 'RL',    color: '#f97316', dash: true },
                  { key: 'flowFL',    label: 'FL',    color: '#10b981', dash: true },
                  { key: 'flowFR',    label: 'FR',    color: '#8b5cf6', dash: true },
                ]},
              ];
              return (
                <div className="flex gap-6 pt-1 pb-1 justify-center flex-wrap">
                  {groups.map(g => (
                    <div key={g.label} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mr-1">{g.label}:</span>
                      {g.items.map(item => (
                        <button
                          key={item.key}
                          onClick={() => setHiddenSeries(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                          className={`flex items-center gap-1 text-sm transition-opacity cursor-pointer ${hiddenSeries[item.key] ? 'opacity-25' : 'opacity-100'}`}
                        >
                          <svg width="18" height="10" className="shrink-0">
                            <line x1="0" y1="5" x2="18" y2="5"
                              stroke={item.color} strokeWidth={item.label === 'Total' ? 2.5 : 1.8}
                              strokeDasharray={item.dash ? '5 3' : 'none'} />
                          </svg>
                          <span style={{ color: item.color }} className="font-medium text-xs">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Toolbar */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-x-6 gap-y-2 items-center">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Show signals:</span>
                {[
                  { key: 'milkflow', label: 'Milkflow', hint: 'Milk flow active (RR/RL/FL/FR)' },
                  { key: 'omp',      label: 'OMP',      hint: 'Overmilk protection active' },
                  { key: 'color',    label: 'Color',    hint: 'Color sensor alarm' },
                  { key: 'conduct',  label: 'Conduct',  hint: 'Conductivity alarm' },
                ].map(s => (
                  <label key={s.key} title={s.hint} className="flex items-center gap-1.5 text-sm cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={activeSignals[s.key]}
                      onChange={() => setActiveSignals(prev => ({...prev, [s.key]: !prev[s.key]}))}
                      className="rounded border-slate-300 text-blue-500"
                    />
                    {s.label}
                  </label>
                ))}
                {/* Mini-Legende der Viertel-Farben */}
              </div>

              <div className="flex items-center gap-3 flex-wrap border-l border-slate-200 pl-4">
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Info Panel:</span>
                {[
                  { key: 'ams', label: 'AMS Status', state: showTooltipAms, set: setShowTooltipAms },
                  { key: 'qtr', label: 'Qu. States', state: showTooltipQtrStates, set: setShowTooltipQtrStates },
                ].map(s => (
                  <label key={s.key} className="flex items-center gap-1.5 text-sm cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={s.state}
                      onChange={() => s.set(prev => !prev)}
                      className="rounded border-slate-300 text-blue-500"
                    />
                    {s.label}
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-3 flex-wrap border-l border-slate-200 pl-4 ml-auto">
                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Show in chart:</span>
                <label title="Kickoffs as orange dashed line" className="flex items-center gap-1.5 text-sm cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={showKickoffsOnChart}
                    onChange={() => setShowKickoffsOnChart(p => !p)}
                    className="rounded border-slate-300"
                  />
                  <span className="border-b-2 border-dashed border-orange-400 leading-none">Kickoffs</span>
                </label>
                <label title="Reattach events as purple line" className="flex items-center gap-1.5 text-sm cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={showReattachOnChart}
                    onChange={() => setShowReattachOnChart(p => !p)}
                    className="rounded border-slate-300"
                  />
                  <span className="border-b-2 border-purple-400 leading-none">Reattach</span>
                </label>
              </div>
            </div>
          </div>

          {/* Signal Sub-Charts — eigene Zeile je Signal-Typ, syncId verbindet mit Hauptchart */}
          {Object.values(activeSignals).some(Boolean) && logData && (
            <div className="flex gap-4">
            <div className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">Signal Traces</span>
                <div className="flex gap-3 ml-2">
                  {[['#ef4444','RR'],['#f97316','RL'],['#10b981','FL'],['#8b5cf6','FR']].map(([c,l]) => (
                    <span key={l} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="w-4 h-0.5 inline-block rounded-full" style={{background:c}}/>
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              {[
                { key: 'milkflow', label: 'Milkflow', sigKeys: ['mfRR', 'mfRL', 'mfFL', 'mfFR'] },
                { key: 'omp',      label: 'OMP',      sigKeys: ['ompRR', 'ompRL', 'ompFL', 'ompFR'] },
                { key: 'color',    label: 'Color',    sigKeys: ['colRR', 'colRL', 'colFL', 'colFR'] },
                { key: 'conduct',  label: 'Conduct',  sigKeys: ['conRR', 'conRL', 'conFL', 'conFR'] },
              ].filter(s => activeSignals[s.key]).map((sig, idx, arr) => {
                const isLast = idx === arr.length - 1;
                const colors = ['#ef4444','#f97316','#10b981','#8b5cf6'];
                return (
                  <div key={sig.key} className={`flex items-stretch ${!isLast ? 'border-b border-slate-100 dark:border-slate-700' : ''}`}>
                    <div className="w-20 flex-shrink-0 flex items-center justify-end pr-3 bg-slate-50 dark:bg-slate-900 border-r border-slate-100 dark:border-slate-700">
                      <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{sig.label}</span>
                    </div>
                    <div className="flex-1" style={{ height: isLast ? '64px' : '52px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={logData.chartData} syncId="milking" margin={{ top: 4, right: 5, left: -20, bottom: 0 }} onClick={handleChartClick}>
                          <YAxis hide={true} domain={[0, 1]} />
                          {isLast
                            ? <XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} stroke={isDarkMode ? "#64748b" : "#94a3b8"} fontSize={10} tickMargin={4} tickFormatter={val=>`${val}s`} height={18} />
                            : <XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} hide={true} />
                          }
                          {lockedHighlights.map((hl, i) => (
                            <ReferenceLine key={`sig-${sig.key}-locked-${i}`} x={hl.time} stroke={hl.type==='anomaly'?'#ef4444':'#3b82f6'} strokeWidth={2} />
                          ))}
                          {lockedLogLines.map((ll, i) => (
                            <ReferenceLine key={`sig-${sig.key}-logline-${i}`} x={ll.time} stroke="#16a34a" strokeWidth={2} strokeDasharray="4 2" />
                          ))}
                          {showKickoffsOnChart && logData.events.filter(e=>e.type==='Kickoff').map((event,i) => (
                            <ReferenceLine key={`sig-kickoff-${i}`} x={event.time} stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 3" />
                          ))}
                          {showReattachOnChart && logData.events.filter(e=>e.type==='Reattach').map((event,i) => (
                            <ReferenceLine key={`sig-reattach-${i}`} x={event.time} stroke="#8b5cf6" strokeWidth={2} />
                          ))}
                          {colors.map((color, qi) => (
                            <Line key={qi} type="stepAfter" dataKey={`signals.${sig.sigKeys[qi]}`}
                              stroke={color} strokeWidth={2.5} dot={false} isAnimationActive={false} legendType="none" />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="w-96 shrink-0" />
            </div>
          )}

          </div>{/* end chart section */}

          {/* Expert Log panel */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm h-[600px] flex flex-col overflow-hidden">
              <div className="shrink-0 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                    <Clock size={20} className="text-slate-400" />
                    <h2 className="text-lg">Process Events</h2>
                  </div>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-xs">
                    <button
                      onClick={() => setExpertMode(false)}
                      className={`px-3 py-1 transition-colors ${!expertMode ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                    >
                      Einfach
                    </button>
                    <button
                      onClick={() => setExpertMode(true)}
                      className={`px-3 py-1 transition-colors ${expertMode ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                    >
                      Experten
                    </button>
                  </div>
                </div>
                {expertMode && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Vollständiges Logfile · Klicken zum Markieren</p>
                )}
              </div>

              {/* Simple mode — event timeline */}
              {!expertMode && (
                <div ref={timelineContainerRef} className="flex-1 overflow-y-auto pr-4 pb-10 space-y-2 relative">
                  {logData.events.length === 0 && (
                    <p className="text-slate-400 text-center mt-10">No events found</p>
                  )}
                  {logData.events.map((event, idx) => {
                    const lockedIndex = lockedHighlights.findIndex(h => h.type === 'event' && h.idx === idx);
                    const isLocked = lockedIndex !== -1;
                    const highlightNum = isLocked ? lockedIndex + 1 : null;
                    const isHovered = hoverHighlight?.type === 'event' && hoverHighlight?.idx === idx;
                    const isShadow = hoveredTime !== null && !isLocked && !isHovered && Math.abs(event.time - hoveredTime) <= 60;

                    return (
                      <div
                        key={idx}
                        ref={el => eventRefs.current[idx] = el}
                        onMouseEnter={() => handleListItemMouseEnter(event.time, 'event', idx)}
                        onMouseLeave={handleListItemMouseLeave}
                        onClick={() => handleListItemClick(event.time, 'event', idx)}
                        className={`relative flex gap-4 p-3 -mx-3 rounded-xl transition-all cursor-pointer ${
                          isLocked
                            ? 'bg-blue-100 shadow-md ring-2 ring-blue-500 z-10'
                            : isHovered
                              ? 'bg-slate-100 shadow-sm ring-1 ring-slate-300 z-10'
                              : isShadow
                                ? 'bg-blue-50 ring-1 ring-blue-100 z-0'
                                : 'hover:bg-slate-50 z-0'
                        }`}
                      >
                        {idx !== logData.events.length - 1 && (
                          <div className="absolute left-7 top-12 bottom-[-16px] w-px bg-slate-200"></div>
                        )}

                        <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 border-white
                          ${event.type === 'Kickoff' ? (isHovered || isLocked ? 'bg-orange-200 text-orange-600' : 'bg-orange-100 text-orange-500') : ''}
                          ${event.type === 'OMP' ? (isHovered || isLocked ? 'bg-red-200 text-red-600' : 'bg-red-100 text-red-500') : ''}
                          ${event.type === 'Milkflow' ? (isHovered || isLocked ? 'bg-blue-200 text-blue-600' : 'bg-blue-100 text-blue-500') : ''}
                          ${event.type === 'Detach' ? (isHovered || isLocked ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-500') : ''}
                          ${event.type === 'Reattach' ? (isHovered || isLocked ? 'bg-purple-200 text-purple-700' : 'bg-purple-100 text-purple-500') : ''}
                          ${!['Kickoff', 'OMP', 'Milkflow', 'Detach', 'Reattach'].includes(event.type) ? (isHovered || isLocked ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-400') : ''}
                        `}>
                          {event.type === 'Kickoff' && <AlertTriangle size={14} />}
                          {event.type === 'OMP' && <AlertTriangle size={14} />}
                          {event.type === 'Milkflow' && <Droplets size={14} />}
                          {event.type === 'Detach' && <Activity size={14} />}
                          {event.type === 'Reattach' && <RefreshCw size={14} />}
                          {!['Kickoff', 'OMP', 'Milkflow', 'Detach', 'Reattach'].includes(event.type) && <Info size={14} />}

                          {isLocked && (
                            <div className="absolute -top-1 -right-1 rounded-full flex items-center justify-center text-white bg-slate-700" style={{ width: '16px', height: '16px', fontSize: '10px' }}>
                              {highlightNum}
                            </div>
                          )}
                        </div>

                        <div className="pt-1.5 pb-1">
                          <div className="flex items-baseline gap-2">
                            <span className={`text-sm ${isLocked ? 'text-slate-900' : 'text-slate-800'}`}>{event.type}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">t={event.time}s</span>
                          </div>
                          <p className={`text-sm mt-1 leading-relaxed ${isLocked ? 'text-slate-700' : 'text-slate-500'}`}>
                            {event.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Expert mode — raw log lines */}
              {expertMode && (
                <div ref={logLineContainerRef} className="flex-1 overflow-y-auto relative">
                  {logData.rawLines.map(({ text, time }, idx) => {
                    const isLocked = lockedLogLines.some(l => l.lineIdx === idx);
                    const isNearCursor = time !== null && hoveredTime !== null && Math.abs(time - hoveredTime) < 2;
                    return (
                      <div
                        key={idx}
                        ref={el => logLineRefs.current[idx] = el}
                        onClick={() => time !== null && handleLogLineClick(idx, time)}
                        title={time !== null ? `t=${time}s — klicken zum Markieren` : undefined}
                        className={`flex gap-1 px-2 py-0.5 font-mono text-xs leading-5 select-text ${
                          time !== null ? 'cursor-pointer' : ''
                        } ${
                          isLocked
                            ? 'bg-amber-100 dark:bg-amber-900/40 border-l-4 border-amber-500 dark:border-amber-400'
                            : isNearCursor
                              ? 'bg-blue-300 dark:bg-blue-900/60 border-l-4 border-blue-700 dark:border-blue-400'
                              : time !== null
                                ? 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                : ''
                        }`}
                      >
                        <span className="text-slate-600 dark:text-slate-400 shrink-0 w-8 text-right select-none font-medium">{idx + 1}</span>
                        <span className={`break-all ${isLocked ? 'text-amber-900 dark:text-amber-200 font-medium' : isNearCursor ? 'text-blue-950 dark:text-blue-100 font-semibold' : 'text-slate-900 dark:text-slate-100'}`}>{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          <div className="space-y-4 pb-2">
          {/* Anomalies */}
          <div className="bg-red-50 dark:bg-red-950/30 p-5 rounded-xl border border-red-100 dark:border-red-900 shadow-sm flex flex-col max-h-52">
            <div className="flex items-center gap-2 text-red-600 mb-4 shrink-0">
              <AlertTriangle size={20} />
              <h2 className="text-lg">Anomalies</h2>
            </div>
            <div ref={anomalyContainerRef} className="flex-1 overflow-y-auto pr-4 pb-6 space-y-2 relative">
              {logData.anomalies.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <CheckCircle2 size={32} className="mb-2 opacity-50 text-green-500" />
                  <p>No anomalies found</p>
                </div>
              )}
              {logData.anomalies.map((anomaly, idx) => {
                const lockedIndex = lockedHighlights.findIndex(h => h.type === 'anomaly' && h.idx === idx);
                const isLocked = lockedIndex !== -1;
                const highlightNum = isLocked ? lockedIndex + 1 : null;
                const isHovered = hoverHighlight?.type === 'anomaly' && hoverHighlight?.idx === idx;
                const canInteract = anomaly.time !== null;
                return (
                  <div
                    key={idx}
                    ref={el => anomalyRefs.current[idx] = el}
                    onMouseEnter={() => handleListItemMouseEnter(anomaly.time, 'anomaly', idx)}
                    onMouseLeave={handleListItemMouseLeave}
                    onClick={() => handleListItemClick(anomaly.time, 'anomaly', idx)}
                    className={`relative flex gap-3 p-3 -mx-3 rounded-xl transition-all ${canInteract ? 'cursor-pointer' : ''} ${
                      isLocked
                        ? 'bg-red-200 shadow-md ring-2 ring-red-400 z-10'
                        : isHovered
                          ? 'bg-red-100 shadow-sm ring-1 ring-red-300 z-10'
                          : 'bg-white border border-red-100 z-0 hover:bg-red-50'
                    }`}
                  >
                    <div className="w-16 shrink-0 pt-0.5 relative">
                      <span className={isLocked ? 'text-red-700' : 'text-red-400'}>
                        {anomaly.time !== null ? `t=${anomaly.time}s` : ''}
                      </span>
                      {isLocked && (
                        <div className="absolute top-0 right-1 rounded-full flex items-center justify-center text-white bg-slate-700" style={{ width: '16px', height: '16px', fontSize: '10px' }}>
                          {highlightNum}
                        </div>
                      )}
                    </div>
                    <span className={isLocked ? 'text-red-900' : 'text-red-800'}>{anomaly.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {logData.finalResults && logData.finalResults.hasData && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 mb-6 shrink-0">
                <Flag size={20} className="text-blue-500" />
                <h2 className="text-lg">Final Results</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Milked Amount</div>
                  <div className="text-2xl text-slate-800 dark:text-slate-100">{logData.finalResults.totalKg} kg</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Expected Amount</div>
                  <div className="text-2xl text-slate-800 dark:text-slate-100">{logData.finalResults.expectedKg} kg</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">%</div>
                  <div className="text-2xl text-slate-800 dark:text-slate-100">{logData.finalResults.percent} %</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {[{key: 'RR', label: 'RR'}, {key: 'RL', label: 'RL'}, {key: 'FL', label: 'FL'}, {key: 'FR', label: 'FR'}].map(q => {
                  const detTime = logData.milkFlowDetectionTime[q.key];
                  const detTries = logData.milkFlowDetectionTries[q.key];
                  const detectionSlow = detTime > 90;
                  return (
                  <div key={q.key} className={`border rounded-lg p-4 shadow-sm text-center ${detectionSlow ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}>
                    <div className={`text-sm mb-3 border-b pb-2 ${detectionSlow ? 'text-orange-700 border-orange-100' : 'text-slate-600 border-slate-100'}`}>{q.label}</div>
                    <div className="space-y-2.5">
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Amount</div>
                        <div className="text-lg text-slate-800 dark:text-slate-100">{logData.finalResults.qtrAmount[q.key]} g</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">%</div>
                        <div className="text-base text-slate-700">{logData.finalResults.qtrPercent[q.key]} %</div>
                      </div>
                      <div className="flex justify-center gap-4">
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">MilkTime</div>
                          <div className="text-sm text-slate-700">{logData.finalResults.milkTime[q.key]} s</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">MF-Time</div>
                          <div className="text-sm text-slate-700">{logData.finalResults.milkTimeMF[q.key]} s</div>
                        </div>
                      </div>
                      {detTime > 0 && (
                        <div className={`pt-2 border-t ${detectionSlow ? 'border-orange-100' : 'border-slate-100'}`}>
                          <div className="text-xs text-slate-500 dark:text-slate-400">Detection Time</div>
                          <div className={`text-sm font-medium ${detectionSlow ? 'text-orange-600' : 'text-slate-700'}`}>
                            {detTime} s {detTries > 1 && <span className="text-xs font-normal">({detTries}× attempt)</span>}
                            {detectionSlow && <span className="ml-1 text-xs">⚠</span>}
                          </div>
                        </div>
                      )}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Kickoffs</div>
                        <div className={`text-sm font-medium ${logData.finalResults.nrOfKickoffs[q.key] > 0 ? 'text-orange-500' : 'text-slate-700'}`}>
                          {logData.finalResults.nrOfKickoffs[q.key]}
                        </div>
                      </div>
                    </div>
                  </div>
                )})}
              </div>

              {logData.finalResults.messages.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="text-sm text-blue-800 mb-3 flex items-center gap-2">
                    <Info size={16} />
                    Status Messages (MLK_PRCS)
                  </div>
                  <ul className="space-y-2">
                    {logData.finalResults.messages.map((msg, i) => (
                      <li key={i} className="text-sm text-blue-700 bg-white px-3 py-2 rounded border border-blue-50">
                        {msg}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <button 
              onClick={() => setShowParameters(!showParameters)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="text-lg text-slate-800 dark:text-slate-100">System Parameters (MLK_Parameter)</span>
              {showParameters ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
            </button>
            
            {showParameters && (
              <div className="p-5 border-t border-slate-100 dark:border-slate-700 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <div className="h-64 overflow-y-auto font-mono text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-4 rounded border border-slate-200 dark:border-slate-700 shadow-inner">
                  {logData.parameters.map((p, i) => (
                    <div key={i} className="whitespace-pre truncate">{p}</div>
                  ))}
                  {logData.parameters.length === 0 && (
                    <div>No parameters found in log.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>{/* end scroll wrapper */}

        </div>
      )}
    </div>
  );
}