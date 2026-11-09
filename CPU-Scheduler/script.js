const colorOrder = ["violet", "cyan", "blue", "rose", "amber"];
let processes = [
  { pid: "P1", arrival: 0, burst: 4, queue: 1, color: "violet" },
  { pid: "P2", arrival: 1, burst: 3, queue: 1, color: "cyan" },
  { pid: "P3", arrival: 2, burst: 2, queue: 2, color: "blue" },
  { pid: "P4", arrival: 3, burst: 5, queue: 2, color: "rose" },
];

let timeline = [];
let currentTime = 0;
let maxTime = 0;
let playing = false;
let playTimer = null;
let metrics = {};

// Tracking variables for the slide animation
let prevRunningPid = null;
let prevCompletedPids = new Set();
let prevReadyPids = new Set();

// --- INIT ---
renderList();
resetSim();

function handleAlgoChange() {
  const algo = document.getElementById('algo').value;
  document.getElementById('quantum-wrap').style.display = algo === 'RR' ? 'block' : 'none';
  document.getElementById('queue-input-wrap').style.display = algo === 'MLQ' ? 'grid' : 'none';
  document.getElementById('th-q').style.display = algo === 'MLQ' ? 'block' : 'none';
  renderList();
  resetSim();
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
    queue: Math.max(1, Math.min(2, queue)),
    color: colorOrder[processes.length % colorOrder.length]
  });

  renderList();
  document.getElementById('proc-count').innerText = processes.length;
  
  document.getElementById('in-pid').value = 'P' + (processes.length + 1);
  document.getElementById('in-arrival').value = processes.length + 1;
  document.getElementById('in-burst').value = '3';
  
  resetSim();
}

function renderList() {
  const algo = document.getElementById('algo').value;
  const showQ = algo === 'MLQ';
  const container = document.getElementById('process-list-body');
  
  document.querySelector('.list-header').style.gridTemplateColumns = showQ ? '1fr 32px 32px 32px' : '1fr 32px 32px';
  
  container.innerHTML = processes.slice(0, 8).map(p => `
    <div class="list-row" style="grid-template-columns: ${showQ ? '1fr 32px 32px 32px' : '1fr 32px 32px'};">
      <div>
        <span class="mini-dot process-${p.color}"></span>
        <strong>${p.pid}</strong>
      </div>
      <span>${p.arrival}</span>
      <span>${p.burst}</span>
      ${showQ ? `<span>${p.queue}</span>` : ''}
    </div>
  `).join('');
}

function calculateSchedule() {
  const algo = document.getElementById('algo').value;
  const quantum = parseInt(document.getElementById('in-quantum').value) || 2;
  
  let list = processes.map(p => ({ ...p, rem: p.burst, comp: false, inQueue: false })).sort((a,b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
  let time = 0, tl = [], done = 0, n = list.length;
  let rrQueue = [];
  
  metrics = {};
  if (n === 0) { timeline = []; maxTime = 0; return; }

  while (done < n) {
    // ROUND ROBIN
    if (algo === 'RR') {
      list.filter(p => !p.comp && !p.inQueue && p.arrival <= time).forEach(p => {
        p.inQueue = true;
        rrQueue.push(p);
      });

      if (rrQueue.length === 0) {
        tl.push({ pid: 'IDLE', start: time, end: time + 1 }); time++; continue;
      }

      let curr = rrQueue.shift();
      let run = Math.min(curr.rem, quantum);

      tl.push({ pid: curr.pid, start: time, end: time + run });
      time += run;
      curr.rem -= run;

      list.filter(p => !p.comp && !p.inQueue && p.arrival <= time).forEach(p => {
        p.inQueue = true;
        rrQueue.push(p);
      });

      if (curr.rem === 0) {
        curr.comp = true;
        metrics[curr.pid] = { ct: time, tat: time - curr.arrival, wt: time - curr.arrival - curr.burst };
        done++;
      } else {
        rrQueue.push(curr); 
      }
      continue;
    }

    // OTHERS
    let avail = list.filter(p => !p.comp && p.arrival <= time);
    if (avail.length === 0) { tl.push({ pid: 'IDLE', start: time, end: time + 1 }); time++; continue; }

    let curr = null;
    if (algo === 'FCFS') {
      curr = avail.sort((a,b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    } else if (algo === 'SJF') {
      curr = avail.sort((a,b) => a.burst - b.burst || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    } else if (algo === 'SRTF') {
      curr = avail.sort((a,b) => a.rem - b.rem || a.arrival - b.arrival || a.pid.localeCompare(b.pid))[0];
    } else if (algo === 'MLQ') {
      let q1 = avail.filter(p => p.queue === 1).sort((a,b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
      let q2 = avail.filter(p => p.queue === 2).sort((a,b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
      curr = q1.length > 0 ? q1[0] : q2[0];
    }

    let run = 1;
    if (algo === 'FCFS' || algo === 'SJF') {
      run = curr.rem;
    } else if (algo === 'SRTF') {
      let nextArr = list.filter(p => !p.comp && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity);
      run = Math.min(curr.rem, nextArr - time);
    } else if (algo === 'MLQ') {
      if (curr.queue === 1) {
        run = curr.rem; 
      } else {
        let nextQ1Arr = list.filter(p => !p.comp && p.queue === 1 && p.arrival > time).reduce((min, p) => Math.min(min, p.arrival), Infinity);
        run = Math.min(curr.rem, nextQ1Arr - time); 
      }
    }

    tl.push({ pid: curr.pid, start: time, end: time + run });
    time += run;
    curr.rem -= run;

    if (curr.rem === 0) {
      curr.comp = true;
      metrics[curr.pid] = { ct: time, tat: time - curr.arrival, wt: time - curr.arrival - curr.burst };
      done++;
    }
  }

  timeline = [];
  for (let b of tl) {
    if (timeline.length > 0 && timeline[timeline.length-1].pid === b.pid && timeline[timeline.length-1].end === b.start) {
      timeline[timeline.length-1].end = b.end;
    } else {
      timeline.push(b);
    }
  }
  maxTime = time;
}

function resetSim() {
  playing = false;
  clearInterval(playTimer);
  
  // 1. Reset the time and calculate the new schedule FIRST
  currentTime = 0;
  calculateSchedule();
  
  // 2. Reset the animation tracking
  prevRunningPid = null;
  prevCompletedPids.clear();
  prevReadyPids.clear();
  
  // 3. Reset all the UI elements
  document.getElementById('sys-time').innerText = `T+00ms`;
  document.getElementById('cpu-zone').classList.remove('processing');
  document.getElementById('cpu-process').innerHTML = '<span class="idle-chip">IDLE</span>';
  document.getElementById('cpu-status').innerText = 'AWAITING PROCESS';
  document.getElementById('ready-queue').innerHTML = '<span class="empty-label">Queue empty</span>';
  document.getElementById('completed-queue').innerHTML = '<span class="empty-label">No completed tasks</span>';
  document.getElementById('gantt-bars').innerHTML = '<span class="timeline-empty">Timeline waiting for execution data</span>';
  
  const ticks = document.getElementById('gantt-ticks');
  ticks.innerHTML = '';
  if (maxTime > 0) {
    for (let i = 0; i <= maxTime; i++) {
      if (i === 0 || i === maxTime || i % Math.ceil(maxTime/7) === 0) {
        ticks.innerHTML += `<span>${i}ms</span>`;
      }
    }
  }

  document.getElementById('m-wait').innerHTML = `0.00<small>ms</small>`;
  document.getElementById('m-turn').innerHTML = `0.00<small>ms</small>`;
  document.getElementById('m-util').innerHTML = `0<small>%</small>`;
  document.getElementById('m-thru').innerHTML = `0.00<small>p/ms</small>`;

  updateUI();
  
  // 4. Update the button text at the VERY END
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

function updateUI() {
  if (currentTime > maxTime) currentTime = maxTime;

  document.getElementById('sys-time').innerText = `T+${currentTime.toString().padStart(2, '0')}ms`;

  const block = timeline.find(b => currentTime >= b.start && currentTime < b.end);
  const runningPid = block ? block.pid : null;
  
  const arrived = processes.filter(p => p.arrival <= currentTime);
  const completed = arrived.filter(p => metrics[p.pid] && metrics[p.pid].ct <= currentTime);
  const ready = arrived.filter(p => !completed.includes(p) && p.pid !== runningPid);
  const current = processes.find(p => p.pid === runningPid);

  // --- DETERMINE WHICH NODES ARE NEW ---
  const isNewToCpu = runningPid && runningPid !== prevRunningPid;
  const newlyCompleted = completed.filter(p => !prevCompletedPids.has(p.pid));
  const newlyReady = ready.filter(p => !prevReadyPids.has(p.pid));

  // Update previous state for the next tick
  prevRunningPid = runningPid;
  completed.forEach(p => prevCompletedPids.add(p.pid));
  prevReadyPids = new Set(ready.map(p => p.pid));

  // --- RENDER QUEUES WITH ANIMATIONS ---
  document.getElementById('rq-count').innerText = `${ready.length} WAITING`;
  document.getElementById('ready-queue').innerHTML = ready.length 
    ? ready.map(p => {
        const animate = newlyReady.includes(p);
        return createProcessNode(p, false, false, animate);
      }).join('') 
    : '<span class="empty-label">Queue empty</span>';

  document.getElementById('cq-count').innerText = `${completed.length} DONE`;
  document.getElementById('completed-queue').innerHTML = completed.length 
    ? completed.map(p => {
        const animate = newlyCompleted.includes(p);
        return createProcessNode(p, false, false, animate);
      }).join('') 
    : '<span class="empty-label">No completed tasks</span>';

  // --- RENDER CPU WITH ANIMATION ---
  const cpuZone = document.getElementById('cpu-zone');
  const cpuProc = document.getElementById('cpu-process');
  const cpuStatus = document.getElementById('cpu-status');

  if (current && runningPid !== 'IDLE') {
    cpuZone.classList.add('processing');
    cpuProc.innerHTML = createProcessNode(current, true, true, isNewToCpu);
    cpuStatus.innerText = `EXECUTING ${current.pid}`;
  } else {
    cpuZone.classList.remove('processing');
    cpuProc.innerHTML = '<span class="idle-chip">IDLE</span>';
    cpuStatus.innerText = 'AWAITING PROCESS';
  }

  // Update Gantt Chart
  const ganttBars = document.getElementById('gantt-bars');
  if (currentTime === 0) {
    ganttBars.innerHTML = '<span class="timeline-empty">Timeline waiting for execution data</span>';
  } else {
    ganttBars.innerHTML = timeline.map(b => {
      if (b.start >= currentTime) return '';
      
      const widthPct = ((Math.min(b.end, currentTime) - b.start) / maxTime) * 100;
      const isIdle = b.pid === 'IDLE';
      const p = processes.find(x => x.pid === b.pid);
      const colorClass = p ? `process-${p.color}` : '';
      
      return `
        <div class="gantt-bar ${colorClass} ${!isIdle && b.end > currentTime ? 'running' : ''}" style="width: ${widthPct}%; margin-right: 2px;">
          <span>${b.pid}</span>
          <small>${isIdle ? 'idle' : (b.end > currentTime ? 'running' : (b.end - b.start) + 'ms')}</small>
        </div>
      `;
    }).join('');
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
              <span style="color: #edeefe;">${p.pid}</span>
            </div>
          </td>
          <td>${p.arrival}</td>
          <td>${p.burst}</td>
          <td>${isDone ? m.ct : '-'}</td>
          <td>${isDone ? m.tat : '-'}</td>
          <td>${isDone ? m.wt : '-'}</td>
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
