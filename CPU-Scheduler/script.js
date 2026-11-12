const colorOrder = ["violet", "cyan", "blue", "rose", "amber"];
let processes = [
  { pid: "P1", arrival: 3, burst: 1, queue: 1, color: "violet" },
  { pid: "P2", arrival: 5, burst: 6, queue: 1, color: "cyan" },
  { pid: "P3", arrival: 8, burst: 4, queue: 1, color: "blue" },
  { pid: "P4", arrival: 0, burst: 1, queue: 1, color: "rose" },
  { pid: "P5", arrival: 12, burst: 6, queue: 1, color: "amber" },
];

let timeline = [];
let currentTime = 0;
let maxTime = 0;
let playing = false;
let playTimer = null;
let metrics = {};

let prevRunningPid = null;
let prevCompletedPids = new Set();
let prevReadyPids = new Set();

let fwCanvas, fwCtx, particles = [];
let lastCompletedCount = 0;

// --- INIT ---
renderList();
resetSim();
initFireworks();
toggleMLQQuantum();

function handleAlgoChange() {
  const algo = document.getElementById('algo').value;
  const isMLQ = algo === 'MLQ';

  document.getElementById('quantum-wrap').style.display = (algo === 'RR') ? 'block' : 'none';
  document.getElementById('queue-input-wrap').style.display = isMLQ ? 'grid' : 'none';
  document.getElementById('th-q').style.display = isMLQ ? 'block' : 'none';
  
  document.getElementById('mlq-wrap').style.display = isMLQ ? 'block' : 'none';
  document.getElementById('q1-container').style.display = isMLQ ? 'flex' : 'none';
  document.getElementById('q2-container').style.display = isMLQ ? 'flex' : 'none';
  document.getElementById('q3-container').style.display = isMLQ ? 'flex' : 'none';
  document.getElementById('q4-label').innerText = isMLQ ? "Q4 (LOWEST)" : "READY QUEUE";

  if (isMLQ) toggleMLQQuantum();

  renderList();
  resetSim();
}

// Disable the Quantum input if the queue's algorithm is not RR
function toggleMLQQuantum() {
  for (let i = 1; i <= 4; i++) {
    const algoEl = document.getElementById(`mlq-q${i}-algo`);
    const inputEl = document.getElementById(`mlq-q${i}-quantum`);
    if (algoEl && inputEl) {
      if (algoEl.value === 'RR') {
        inputEl.disabled = false;
        inputEl.style.opacity = '1';
      } else {
        inputEl.disabled = true;
        inputEl.style.opacity = '0.3'; // Gray it out
      }
    }
  }
}

function addProcess(e) {
  e.preventDefault();
  const pid = document.getElementById('in-pid').value.trim().toUpperCase();
  const arrival = parseInt(document.getElementById('in-arrival').value) || 0;
  const burst = parseInt(document.getElementById('in-burst').value) || 1;
  const queue = parseInt(document.getElementById('in-queue').value) || 1;

  if (!pid || processes.some(p => p.pid === pid)) return;

  processes.push({
    pid: pid,
    arrival: Math.max(0, arrival),
    burst: Math.max(1, burst),
    queue: Math.max(1, Math.min(4, queue)),
    color: colorOrder[processes.length % colorOrder.length]
  });

  renderList();
  document.getElementById('proc-count').innerText = processes.length;
  
  document.getElementById('in-pid').value = 'P' + (processes.length + 1);
  document.getElementById('in-arrival').value = processes.length + 1;
  document.getElementById('in-burst').value = '3';
  
  resetSim();
}

function removeProcess(index) {
  processes.splice(index, 1);
  renderList();
  
  const procCount = document.getElementById('proc-count');
  if (procCount) procCount.innerText = processes.length;
  
  resetSim();
}

// Editable Inputs in List
function renderList() {
  const algo = document.getElementById('algo').value;
  const showQ = algo === 'MLQ';
  const container = document.getElementById('process-list-body');
  
  document.querySelector('.list-header').style.gridTemplateColumns = showQ ? '1fr 36px 36px 36px 20px' : '1fr 36px 36px 20px';
  
  container.innerHTML = processes.slice(0, 8).map((p, index) => `
    <div class="list-row" style="grid-template-columns: ${showQ ? '1fr 36px 36px 36px 20px' : '1fr 36px 36px 20px'}; align-items: center;">
      <div>
        <span class="mini-dot process-${p.color}"></span>
        <strong style="font-size: 10px;">${p.pid}</strong>
      </div>
      
      <!-- Editable Inputs -->
      <input type="number" min="0" value="${p.arrival}" onchange="updateProcessField(${index}, 'arrival', this.value)" class="inline-edit" />
      <input type="number" min="1" value="${p.burst}" onchange="updateProcessField(${index}, 'burst', this.value)" class="inline-edit" />
      
      ${showQ ? `<input type="number" min="1" max="4" value="${p.queue}" onchange="updateProcessField(${index}, 'queue', this.value)" class="inline-edit" />` : ''}
      
      <button class="btn-delete-row" onclick="removeProcess(${index})" title="Remove process">×</button>
    </div>
  `).join('');
}

function updateProcessField(index, field, value) {
  const val = parseInt(value);
  if (isNaN(val)) return;
  
  if (field === 'arrival') processes[index].arrival = Math.max(0, val);
  if (field === 'burst') processes[index].burst = Math.max(1, val);
  if (field === 'queue') processes[index].queue = Math.max(1, Math.min(4, val));
  
  resetSim();
}

function calculateSchedule() {
  const algo = document.getElementById('algo').value;
  const globalQuantum = parseInt(document.getElementById('in-quantum').value) || 2;
  
  let list = processes.map(p => ({ ...p, rem: p.burst, comp: false, inQueue: false, firstRun: null, lastRun: null })).sort((a,b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
  let time = 0, tl = [], done = 0, n = list.length;
  let rrQueue = [];
  
  metrics = {};
  if (n === 0) { timeline = []; maxTime = 0; return; }

  while (done < n) {
    if (algo === 'RR') {
      list.filter(p => !p.comp && !p.inQueue && p.arrival <= time).forEach(p => {
        p.inQueue = true; rrQueue.push(p);
      });
      if (rrQueue.length === 0) { tl.push({ pid: 'IDLE', start: time, end: time + 1 }); time++; continue; }
      let curr = rrQueue.shift();
      if (curr.firstRun === null) curr.firstRun = time;
      
      let run = Math.min(curr.rem, globalQuantum);
      tl.push({ pid: curr.pid, start: time, end: time + run });
      time += run; curr.rem -= run;
      
      list.filter(p => !p.comp && !p.inQueue && p.arrival <= time).forEach(p => {
        p.inQueue = true; rrQueue.push(p);
      });
      
      if (curr.rem === 0) {
        curr.comp = true; 
        metrics[curr.pid] = { ct: time, tat: time - curr.arrival, wt: time - curr.arrival - curr.burst, rt: curr.firstRun - curr.arrival }; 
        done++;
      } else { rrQueue.push(curr); }
      continue;
    }

    let avail = list.filter(p => !p.comp && p.arrival <= time);
    if (avail.length === 0) { tl.push({ pid: 'IDLE', start: time, end: time + 1 }); time++; continue; }

    let curr = null;
    
    if (algo === 'FCFS') curr = avail.sort((a,b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    else if (algo === 'SJF') curr = avail.sort((a,b) => a.burst - b.burst || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    else if (algo === 'SRTF') curr = avail.sort((a,b) => a.rem - b.rem || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    else if (algo === 'MLQ') {
      const q1Algo = document.getElementById('mlq-q1-algo').value;
      const q2Algo = document.getElementById('mlq-q2-algo').value;
      const q3Algo = document.getElementById('mlq-q3-algo').value;
      const q4Algo = document.getElementById('mlq-q4-algo').value;
      
      let q1Avail = avail.filter(p => p.queue === 1);
      let q2Avail = avail.filter(p => p.queue === 2);
      let q3Avail = avail.filter(p => p.queue === 3);
      let q4Avail = avail.filter(p => p.queue === 4);

      // lastRun is time + 0.01 so newly arrived processes always win the tie
      if (q1Avail.length > 0) {
        if (q1Algo === 'FCFS') q1Avail.sort((a,b) => a.arrival - b.arrival); else if (q1Algo === 'SJF') q1Avail.sort((a,b) => a.burst - b.burst); else if (q1Algo === 'SRTF') q1Avail.sort((a,b) => a.rem - b.rem); else if (q1Algo === 'RR') q1Avail.sort((a,b) => (a.lastRun ?? a.arrival) - (b.lastRun ?? b.arrival));
        curr = q1Avail[0];
      } else if (q2Avail.length > 0) {
        if (q2Algo === 'FCFS') q2Avail.sort((a,b) => a.arrival - b.arrival); else if (q2Algo === 'SJF') q2Avail.sort((a,b) => a.burst - b.burst); else if (q2Algo === 'SRTF') q2Avail.sort((a,b) => a.rem - b.rem); else if (q2Algo === 'RR') q2Avail.sort((a,b) => (a.lastRun ?? a.arrival) - (b.lastRun ?? b.arrival));
        curr = q2Avail[0];
      } else if (q3Avail.length > 0) {
        if (q3Algo === 'FCFS') q3Avail.sort((a,b) => a.arrival - b.arrival); else if (q3Algo === 'SJF') q3Avail.sort((a,b) => a.burst - b.burst); else if (q3Algo === 'SRTF') q3Avail.sort((a,b) => a.rem - b.rem); else if (q3Algo === 'RR') q3Avail.sort((a,b) => (a.lastRun ?? a.arrival) - (b.lastRun ?? b.arrival));
        curr = q3Avail[0];
      } else if (q4Avail.length > 0) {
        if (q4Algo === 'FCFS') q4Avail.sort((a,b) => a.arrival - b.arrival); else if (q4Algo === 'SJF') q4Avail.sort((a,b) => a.burst - b.burst); else if (q4Algo === 'SRTF') q4Avail.sort((a,b) => a.rem - b.rem); else if (q4Algo === 'RR') q4Avail.sort((a,b) => (a.lastRun ?? a.arrival) - (b.lastRun ?? b.arrival));
        curr = q4Avail[0];
      }
    }

    if (curr.firstRun === null) curr.firstRun = time;

    let run = 1;
    if (algo === 'FCFS' || algo === 'SJF') run = curr.rem;
    else if (algo === 'SRTF') {
      let nextArr = list.filter(p => !p.comp && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity);
      run = Math.min(curr.rem, nextArr - time);
    } else if (algo === 'MLQ') {
      const q1Algo = document.getElementById('mlq-q1-algo').value;
      const q2Algo = document.getElementById('mlq-q2-algo').value;
      const q3Algo = document.getElementById('mlq-q3-algo').value;
      const q4Algo = document.getElementById('mlq-q4-algo').value;

      // Get specific Quantum for each queue
      const q1Quantum = parseInt(document.getElementById('mlq-q1-quantum').value) || 2;
      const q2Quantum = parseInt(document.getElementById('mlq-q2-quantum').value) || 4;
      const q3Quantum = parseInt(document.getElementById('mlq-q3-quantum').value) || 8;
      const q4Quantum = parseInt(document.getElementById('mlq-q4-quantum').value) || 16;

      let nextQ1Arr = list.filter(p => !p.comp && p.queue === 1 && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity);
      let nextQ2Arr = list.filter(p => !p.comp && p.queue === 2 && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity);
      let nextQ3Arr = list.filter(p => !p.comp && p.queue === 3 && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity);

      if (curr.queue === 1) {
        if (q1Algo === 'FCFS' || q1Algo === 'SJF') run = curr.rem;
        else if (q1Algo === 'SRTF') { let nextArr = list.filter(p => !p.comp && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity); run = Math.min(curr.rem, nextArr - time); }
        else if (q1Algo === 'RR') run = Math.min(curr.rem, q1Quantum); // Use Q1 Quantum
      } else if (curr.queue === 2) {
        let limit = nextQ1Arr - time;
        if (q2Algo === 'FCFS' || q2Algo === 'SJF') run = Math.min(curr.rem, limit);
        else if (q2Algo === 'SRTF') { let nextArr = list.filter(p => !p.comp && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity); run = Math.min(curr.rem, nextArr - time, limit); }
        else if (q2Algo === 'RR') run = Math.min(curr.rem, q2Quantum, limit); // Use Q2 Quantum
      } else if (curr.queue === 3) {
        let limit = Math.min(nextQ1Arr, nextQ2Arr) - time;
        if (q3Algo === 'FCFS' || q3Algo === 'SJF') run = Math.min(curr.rem, limit);
        else if (q3Algo === 'SRTF') { let nextArr = list.filter(p => !p.comp && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity); run = Math.min(curr.rem, nextArr - time, limit); }
        else if (q3Algo === 'RR') run = Math.min(curr.rem, q3Quantum, limit); // Use Q3 Quantum
      } else if (curr.queue === 4) {
        let limit = Math.min(nextQ1Arr, nextQ2Arr, nextQ3Arr) - time;
        if (q4Algo === 'FCFS' || q4Algo === 'SJF') run = Math.min(curr.rem, limit);
        else if (q4Algo === 'SRTF') { let nextArr = list.filter(p => !p.comp && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity); run = Math.min(curr.rem, nextArr - time, limit); }
        else if (q4Algo === 'RR') run = Math.min(curr.rem, q4Quantum, limit); // Use Q4 Quantum
      }
    }

    tl.push({ pid: curr.pid, start: time, end: time + run });
    time += run; curr.rem -= run;
    
    if (curr.rem === 0) {
      curr.comp = true; 
      metrics[curr.pid] = { ct: time, tat: time - curr.arrival, wt: time - curr.arrival - curr.burst, rt: curr.firstRun - curr.arrival }; 
      done++;
    } else {
      if (algo === 'MLQ') {
        let qAlgo = '';
        if (curr.queue === 1) qAlgo = document.getElementById('mlq-q1-algo').value;
        else if (curr.queue === 2) qAlgo = document.getElementById('mlq-q2-algo').value;
        else if (curr.queue === 3) qAlgo = document.getElementById('mlq-q3-algo').value;
        else if (curr.queue === 4) qAlgo = document.getElementById('mlq-q4-algo').value;
        
        // ADD 0.01 TO LAST RUN TO FIX TIE-BREAKER
        if (qAlgo === 'RR') curr.lastRun = time + 0.01;
      }
    }
  }

  timeline = tl;
  maxTime = time;
}

function initGanttBars() {
  const ganttBars = document.getElementById('gantt-bars');
  if (!ganttBars) return;

  if (timeline.length === 0) {
    ganttBars.innerHTML = '<span class="timeline-empty">Timeline waiting for execution data</span>';
    return;
  }

  ganttBars.innerHTML = timeline.map((b, index) => {
    const isIdle = b.pid === 'IDLE';
    const p = processes.find(x => x.pid === b.pid);
    const colorClass = p ? `process-${p.color}` : '';
    const duration = b.end - b.start;
    
    const currentAlgo = document.getElementById('algo').value;
    let titleText = `${b.pid} (${duration}ms)`;
    
    if (currentAlgo === 'RR') {
      titleText += ` | Quantum: ${document.getElementById('in-quantum').value}`;
    } else if (currentAlgo === 'MLQ' && p) {
      if (p.queue === 1 && document.getElementById('mlq-q1-algo').value === 'RR') titleText += ` | Q1 Quantum: ${document.getElementById('mlq-q1-quantum').value}`;
      if (p.queue === 2 && document.getElementById('mlq-q2-algo').value === 'RR') titleText += ` | Q2 Quantum: ${document.getElementById('mlq-q2-quantum').value}`;
      if (p.queue === 3 && document.getElementById('mlq-q3-algo').value === 'RR') titleText += ` | Q3 Quantum: ${document.getElementById('mlq-q3-quantum').value}`;
      if (p.queue === 4 && document.getElementById('mlq-q4-algo').value === 'RR') titleText += ` | Q4 Quantum: ${document.getElementById('mlq-q4-quantum').value}`;
    }

    return `
      <div class="gantt-bar ${colorClass}" id="gantt-bar-${index}" data-index="${index}" style="width: 0%; display: none;" title="${titleText}">
        <span class="gantt-pid">${b.pid}</span>
      </div>
    `;
  }).join('');
}

function resetSim() {
  playing = false;
  clearInterval(playTimer);
  
  currentTime = 0;
  lastCompletedCount = 0;
  particles = [];
  calculateSchedule();
  initGanttBars();
  
  prevRunningPid = null;
  prevCompletedPids.clear();
  prevReadyPids.clear();
  
  document.getElementById('sys-time').innerText = `T+00ms`;
  document.getElementById('cpu-zone').classList.remove('processing');
  document.getElementById('cpu-process').innerHTML = '<span class="idle-chip">IDLE</span>';
  document.getElementById('cpu-status').innerText = 'AWAITING PROCESS';
  
  if(document.getElementById('queue-1')) document.getElementById('queue-1').innerHTML = '<span class="empty-label" style="font-size:8px;">Empty</span>';
  if(document.getElementById('queue-2')) document.getElementById('queue-2').innerHTML = '<span class="empty-label" style="font-size:8px;">Empty</span>';
  if(document.getElementById('queue-3')) document.getElementById('queue-3').innerHTML = '<span class="empty-label" style="font-size:8px;">Empty</span>';
  document.getElementById('ready-queue').innerHTML = '<span class="empty-label">Queue empty</span>';
  
  document.getElementById('completed-queue').innerHTML = '<span class="empty-label">No completed tasks</span>';
  
  // Clear the Execution Sequence Guide
  const traceList = document.getElementById('trace-guide-list');
  if (traceList) traceList.innerHTML = '';

  // Tick generation based strictly on timeline boundaries
  const ticks = document.getElementById('gantt-ticks');
  ticks.innerHTML = '';
  ticks.style.position = 'relative';
  ticks.style.height = '24px';
  ticks.style.width = '100%';
  
  if (maxTime > 0) {
    let uniqueTimes = new Set();
    timeline.forEach(b => {
        uniqueTimes.add(b.start);
        uniqueTimes.add(b.end);
    });
    const sortedTimes = Array.from(uniqueTimes).sort((a,b)=>a-b);
    
    sortedTimes.forEach(t => {
        const pct = (t / maxTime) * 100;
        ticks.innerHTML += `<span style="position: absolute; left: ${pct}%; transform: translateX(-50%); white-space: nowrap; font-size: 10px; color: #aaaaaa;">${t}ms</span>`;
    });
  }

  document.getElementById('m-wait').innerHTML = `0.00<small>ms</small>`;
  document.getElementById('m-turn').innerHTML = `0.00<small>ms</small>`;
  document.getElementById('m-util').innerHTML = `0<small>%</small>`;
  document.getElementById('m-thru').innerHTML = `0.00<small>p/ms</small>`;

  updateUI();
  updatePlayButton(); 
}

function togglePlayback() {
  if (playing) {
    playing = false;
    clearInterval(playTimer);
  } else {
    if (currentTime >= maxTime) resetSim();
    playing = true;
    playTimer = setInterval(() => {
      if (currentTime >= maxTime) {
        playing = false;
        clearInterval(playTimer);
        updatePlayButton();
        return;
      }
      currentTime++;
      updateUI();
    }, 500); 
  }
  updatePlayButton();
}

function stepForward() {
  if (playing) {
    playing = false;
    clearInterval(playTimer);
    updatePlayButton();
  }
  if (currentTime < maxTime) {
    currentTime++;
    updateUI();
  }
}

function updatePlayButton() {
  const btnText = document.getElementById('play-text');
  const icon = document.getElementById('play-icon');
  
  if (playing) {
    btnText.innerText = "Pause";
    icon.innerHTML = '<path d="M9 5v14" /><path d="M15 5v14" />';
  } else {
    btnText.innerText = currentTime >= maxTime ? "Replay" : "Run simulation";
    icon.innerHTML = '<path d="m8 5 11 7-11 7V5Z" />';
  }
}

function createProcessNode(p, active = false, compact = false, animate = false) {
  return `
    <div class="process-node process-${p.color} ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''} ${animate ? 'animate-slide' : ''}">
      <span class="node-dot"></span>
      <strong>${p.pid}</strong>
      ${!compact ? `<span>${p.burst}ms</span>` : ''}
    </div>
  `;
}

// --- PIXEL FIREWORKS CANVAS ENGINE ---
function initFireworks() {
  fwCanvas = document.getElementById('fireworks-canvas');
  if (!fwCanvas) return;
  fwCtx = fwCanvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(updateFireworks);
}

function resizeCanvas() {
  if (!fwCanvas) return;
  fwCanvas.width = fwCanvas.offsetWidth;
  fwCanvas.height = fwCanvas.offsetHeight;
}

function triggerFireworksBurst() {
  if (!fwCanvas || !fwCtx) return;
  const cx = fwCanvas.width / 2;
  const cy = fwCanvas.height / 2;
  
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1.0,
      decay: Math.random() * 0.02 + 0.015
    });
  }
}

function updateFireworks() {
  if (!fwCtx || !fwCanvas) return;
  fwCtx.clearRect(0, 0, fwCanvas.width, fwCanvas.height);

  particles.forEach((p, index) => {
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;

    if (p.alpha <= 0) {
      particles.splice(index, 1);
    } else {
      fwCtx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      fwCtx.fillRect(Math.floor(p.x), Math.floor(p.y), 3, 3);
    }
  });

  requestAnimationFrame(updateFireworks);
}

function updateUI() {
  if (currentTime > maxTime) currentTime = maxTime;

  document.getElementById('sys-time').innerText = `T+${currentTime.toString().padStart(2, '0')}ms`;

  const block = timeline.find(b => currentTime >= b.start && currentTime < b.end);
  const runningPid = block ? block.pid : null;
  
  const arrived = processes.filter(p => p.arrival <= currentTime);
  const completed = arrived.filter(p => metrics[p.pid] && metrics[p.pid].ct <= currentTime);
  const ready = arrived.filter(p => !completed.includes(p) && p.pid !== runningPid);
  const current = processes.find(p => p.pid === runningPid);

  if (completed.length > lastCompletedCount) {
    triggerFireworksBurst();
    lastCompletedCount = completed.length;
  }

  const newlyCompleted = completed.filter(p => !prevCompletedPids.has(p.pid));
  const newlyReady = ready.filter(p => !prevReadyPids.has(p.pid));

  prevRunningPid = runningPid;
  completed.forEach(p => prevCompletedPids.add(p.pid));
  prevReadyPids = new Set(ready.map(p => p.pid));

  // Update Queues
  const algo = document.getElementById('algo').value;
  
  if (algo === 'MLQ') {
    const q1Ready = ready.filter(p => p.queue === 1);
    const q2Ready = ready.filter(p => p.queue === 2);
    const q3Ready = ready.filter(p => p.queue === 3);
    const q4Ready = ready.filter(p => p.queue === 4);

    document.getElementById('q1-count').innerText = `${q1Ready.length} WAITING`;
    document.getElementById('queue-1').innerHTML = q1Ready.length ? q1Ready.map(p => createProcessNode(p, false, true, newlyReady.includes(p))).join('') : '<span class="empty-label" style="font-size: 8px;">Empty</span>';
    
    document.getElementById('q2-count').innerText = `${q2Ready.length} WAITING`;
    document.getElementById('queue-2').innerHTML = q2Ready.length ? q2Ready.map(p => createProcessNode(p, false, true, newlyReady.includes(p))).join('') : '<span class="empty-label" style="font-size: 8px;">Empty</span>';

    document.getElementById('q3-count').innerText = `${q3Ready.length} WAITING`;
    document.getElementById('queue-3').innerHTML = q3Ready.length ? q3Ready.map(p => createProcessNode(p, false, true, newlyReady.includes(p))).join('') : '<span class="empty-label" style="font-size: 8px;">Empty</span>';

    document.getElementById('rq-count').innerText = `${q4Ready.length} WAITING`;
    document.getElementById('ready-queue').innerHTML = q4Ready.length ? q4Ready.map(p => createProcessNode(p, false, false, newlyReady.includes(p))).join('') : '<span class="empty-label">Empty</span>';
  } else {
    document.getElementById('rq-count').innerText = `${ready.length} WAITING`;
    document.getElementById('ready-queue').innerHTML = ready.length ? ready.map(p => createProcessNode(p, false, false, newlyReady.includes(p))).join('') : '<span class="empty-label">Queue empty</span>';
  }

  document.getElementById('cq-count').innerText = `${completed.length} DONE`;
  document.getElementById('completed-queue').innerHTML = completed.length 
    ? completed.map(p => createProcessNode(p, false, false, newlyCompleted.includes(p))).join('') 
    : '<span class="empty-label">No completed tasks</span>';

  // Update CPU
  const cpuZone = document.getElementById('cpu-zone');
  const cpuProc = document.getElementById('cpu-process');
  const cpuStatus = document.getElementById('cpu-status');
  const dinoContainer = document.getElementById('cpu-dino-container');

  if (current && runningPid !== 'IDLE') {
    cpuZone.classList.add('processing');
    cpuProc.innerHTML = createProcessNode(current, true, true);
    cpuStatus.innerText = `EXECUTING ${current.pid}`;
    if (dinoContainer) {
      dinoContainer.innerHTML = `<img src="dino.gif" style="height: 38px; width: auto; image-rendering: pixelated; mix-blend-mode: screen; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.9));" alt="Running Dino" />`;
    }
  } else {
    cpuZone.classList.remove('processing');
    cpuProc.innerHTML = '<span class="idle-chip">IDLE</span>';
    cpuStatus.innerText = 'AWAITING PROCESS';
    if (dinoContainer) {
      dinoContainer.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3" /></svg>`;
    }
  }

  // Update Gantt Chart
  const ganttBars = document.getElementById('gantt-bars');
  if (ganttBars) {
    if (currentTime === 0) {
      timeline.forEach((b, index) => {
        const bar = document.getElementById(`gantt-bar-${index}`);
        if (bar) { bar.style.width = '0%'; bar.style.display = 'none'; }
      });
    } else {
      if (ganttBars.querySelector('.timeline-empty')) initGanttBars();

      timeline.forEach((b, index) => {
        const bar = document.getElementById(`gantt-bar-${index}`);
        if (!bar) return;

        if (currentTime <= b.start) {
          bar.style.width = '0%'; bar.style.display = 'none';
        } else {
          const widthPct = ((Math.min(b.end, currentTime) - b.start) / maxTime) * 100;
          bar.style.display = 'flex'; bar.style.width = `${widthPct}%`;
        }
      });
    }
  }

  // --- UPDATE EXECUTION SEQUENCE GUIDE ---
  const traceList = document.getElementById('trace-guide-list');
  if (traceList) {
    if (currentTime === 0) {
      traceList.innerHTML = '';
    } else {
      const executedBlocks = timeline.filter(b => b.start < currentTime);
      
      const traceHTML = executedBlocks.map((b, index) => {
        const p = processes.find(x => x.pid === b.pid);
        const colorClass = p ? `process-${p.color}` : '';
        
        const arrow = index > 0 ? '<span class="trace-arrow">→</span>' : '';
        
        return `${arrow}<div class="trace-box ${colorClass}" style="border-color: currentColor; color: ${p ? p.color : '#fff'}">${b.pid}</div>`;
      }).join('');
      
      traceList.innerHTML = traceHTML;
    }
  }

  // --- UPDATE BLENDED MATRIX TABLE ---
  const matrixBody = document.querySelector('#execution-matrix tbody');
  if (matrixBody) {
    matrixBody.innerHTML = processes.map(p => {
      const m = metrics[p.pid];
      const isDone = m && currentTime >= m.ct;
      const isActive = runningPid === p.pid;
      
      let rowClass = 'pending-row';
      if (isDone) rowClass = 'completed-row';
      if (isActive) rowClass = 'active-row';
      
      return `
        <tr class="${rowClass}">
          <td>
            <div class="pid-cell process-${p.color}">
              <span class="mini-dot" style="background: currentColor;"></span>
              <span style="color: #ffffff;">${p.pid}</span>
            </div>
          </td>
          <td>${p.arrival}</td>
          <td>${p.burst}</td>
          <td>${isDone ? m.ct : '-'}</td>
          <td>${isDone ? m.tat : '-'}</td>
          <td>${isDone ? m.wt : '-'}</td>
          <td>${isDone ? m.rt : '-'}</td>
        </tr>
      `;
    }).join('');
  }

  // Update Metrics
  let totalWt = 0, totalTat = 0, doneCount = 0;
  processes.forEach(p => {
    if (metrics[p.pid] && currentTime >= metrics[p.pid].ct) {
      totalWt += metrics[p.pid].wt;
      totalTat += metrics[p.pid].tat;
      doneCount++;
    }
  });

  let busyTime = timeline
    .filter(b => b.pid !== 'IDLE' && b.start < currentTime)
    .reduce((acc, b) => acc + (Math.min(b.end, currentTime) - b.start), 0);

  if (doneCount > 0) {
    document.getElementById('m-wait').innerHTML = `${(totalWt / doneCount).toFixed(2)}<small>ms</small>`;
    document.getElementById('m-turn').innerHTML = `${(totalTat / doneCount).toFixed(2)}<small>ms</small>`;
    document.getElementById('m-util').innerHTML = `${currentTime > 0 ? Math.round((busyTime / currentTime) * 100) : 0}<small>%</small>`;
    document.getElementById('m-thru').innerHTML = `${(doneCount / currentTime).toFixed(2)}<small>p/ms</small>`;
  }
}

// --- ALGORITHM COMPARISON MODAL ---
function openComparison() {
  const savedAlgo = document.getElementById('algo').value;
  const algos = ['FCFS', 'SJF', 'SRTF', 'RR'];
  const results = [];

  algos.forEach(algo => {
    document.getElementById('algo').value = algo;
    calculateSchedule();
    
    let totalWt = 0, totalTat = 0, count = 0;
    for (let pid in metrics) {
      totalWt += metrics[pid].wt;
      totalTat += metrics[pid].tat;
      count++;
    }
    results.push({
      algo: algo,
      wt: count > 0 ? (totalWt / count) : 0,
      tat: count > 0 ? (totalTat / count) : 0
    });
  });

  // Restore state
  document.getElementById('algo').value = savedAlgo;
  calculateSchedule();
  updateUI();

  // Find best metrics
  const minWt = Math.min(...results.map(r => r.wt));
  const minTat = Math.min(...results.map(r => r.tat));

  // Populate Modal
  const tbody = document.getElementById('comparison-body');
  tbody.innerHTML = results.map(r => `
    <tr>
      <td>${r.algo}</td>
      <td class="${r.wt === minWt ? 'best-metric' : ''}" style="text-align: center;">${r.wt.toFixed(2)} ms</td>
      <td class="${r.tat === minTat ? 'best-metric' : ''}" style="text-align: center;">${r.tat.toFixed(2)} ms</td>
    </tr>
  `).join('');

  document.getElementById('comparison-modal').style.display = 'flex';
}

function closeComparison() {
  document.getElementById('comparison-modal').style.display = 'none';
}
