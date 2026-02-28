// @ts-nocheck
import React, { useState, useEffect, useRef, useReducer } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, get, onDisconnect, runTransaction, push } from "firebase/database";

// ── 0. FIREBASE SETUP ──────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDf4U4_A-ZIgXTheWrg6i4XbdXHOAKpNlI",
  authDomain: "ludoonline-7178b.firebaseapp.com",
  databaseURL: "https://ludoonline-7178b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ludoonline-7178b",
  storageBucket: "ludoonline-7178b.firebasestorage.app",
  messagingSenderId: "1018868732143",
  appId: "1:1018868732143:web:1671d193e475b87fea0b1a"
};


let db = null;
try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  }
} catch (e) {
  console.error("Firebase not initialized:", e);
}

// ── 1. TACTICAL UI CONFIG ──────────────────────────────────────────────────
const CELL = 40, N = 15, W = CELL * N;
const COLORS = {
  RED:    { fill: '#FF4655', dark: '#C42B38', muted: 'rgba(255, 70, 85, 0.15)', name: 'Red', shadow: 'rgba(255, 70, 85, 0.6)' },
  GREEN:  { fill: '#00EA8D', dark: '#00A362', muted: 'rgba(0, 234, 141, 0.15)', name: 'Green', shadow: 'rgba(0, 234, 141, 0.6)' },
  YELLOW: { fill: '#F5D700', dark: '#B39D00', muted: 'rgba(245, 215, 0, 0.15)', name: 'Yellow', shadow: 'rgba(245, 215, 0, 0.6)' },
  BLUE:   { fill: '#00D8FF', dark: '#0095B3', muted: 'rgba(0, 216, 255, 0.15)', name: 'Blue', shadow: 'rgba(0, 216, 255, 0.6)' },
};
const ORDER = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
const AVATARS = ['💀', '🦊', '⚡', '🔥', '🐍', '🐺', '🐉', '👾', '🎯', '☢️'];
const BOARD_BG = '#FFFFFF'; const TRACK_BG = '#FFFFFF'; const GRID_LINE = '#E2E8F0'; 
const FONT = '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const PATH = [
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0],
];
const PD = {
  RED: { si: 1, hc: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]] },
  GREEN: { si: 14, hc: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]] },
  YELLOW: { si: 27, hc: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]] },
  BLUE: { si: 40, hc: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]] },
};
const HOME_SLOTS = {
  RED: [[2, 2], [4, 2], [2, 4], [4, 4]],
  GREEN: [[11, 2], [13, 2], [11, 4], [13, 4]],
  YELLOW: [[11, 11], [13, 11], [11, 13], [13, 13]],
  BLUE: [[2, 11], [4, 11], [2, 13], [4, 13]],
};
const SAFE_STARS = new Set(['0,8', '2,6', '6,2', '8,0', '14,6', '12,8', '8,12', '6,14']);
const SAFE_ALL = new Set([...SAFE_STARS, '6,1', '1,8', '8,13', '13,6']);
const START_CLR = { '6,1': 'RED', '1,8': 'GREEN', '8,13': 'YELLOW', '13,6': 'BLUE' };

function getStackOffsets(count) {
  if (count === 1) return [[0,0]];
  if (count === 2) return [[-6, 0], [6, 0]];
  if (count === 3) return [[-6, -5], [6, -5], [0, 6]];
  if (count === 4) return [[-6, -6], [6, -6], [-6, 6], [6, 6]];
  return Array.from({length: count}, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return [Math.cos(angle) * 10, Math.sin(angle) * 10];
  });
}

// ── 2. LOGIC & GAME ENGINE ─────────────────────────────────────────────────
function getCell(pk, pos) {
  if (pos < 0) return null;
  if (pos >= 56) return [7, 7];
  const d = PD[pk];
  return pos <= 50 ? PATH[(d.si + pos) % 52] : d.hc[pos - 51];
}

function isBlocked(pk, startPos, roll, state) {
  for (let step = 1; step <= roll; step++) {
    const p = startPos + step;
    if (p > 50) continue; 
    const c = getCell(pk, p);
    if (!c) continue;
    for (const opp of ORDER) {
      if (opp === pk || !state.players[opp]) continue;
      let oppCount = 0;
      state.tokens[opp].forEach(t => {
        if (t.pos >= 0 && t.pos <= 50) {
          const oc = getCell(opp, t.pos);
          if (oc && oc[0] === c[0] && oc[1] === c[1]) oppCount++;
        }
      });
      if (oppCount >= 2) return true; 
    }
  }
  return false;
}

function canMove(pk, pos, roll, state) {
  if (pos < 0) return roll === 6;
  if (pos + roll > 56) return false;
  if (isBlocked(pk, pos, roll, state)) return false;
  return true;
}

const initTokens = () => Object.fromEntries(ORDER.map(pk => [pk, Array(4).fill(null).map(() => ({ pos: -1 }))]));
const initConsec = () => Object.fromEntries(ORDER.map(pk => [pk, 0]));

function gameReducer(state, action) {
  if (action.type === 'OVERRIDE_STATE') return action.payload;
  if (!state) return null;

  if (['NEXT_TURN', 'FINISH_ROLL', 'MOVE_TOKEN', 'AUTO_RESOLVE_TURN'].includes(action.type)) {
     if (action.expectedTi !== undefined && state.ti !== action.expectedTi) return state;
  }

  const dName = (pk) => state.players[pk]?.name || COLORS[pk].name;
  const cur = ORDER[state.ti];

  const getNextTurnIdx = (currentTi, playersObj) => {
    let ni = (currentTi + 1) % 4;
    while (!playersObj[ORDER[ni]] && ni !== currentTi) { ni = (ni + 1) % 4; }
    return ni;
  };

  let nextState = { ...state };

  switch (action.type) {
    case 'START_GAME':
      nextState = { ...state, phase: 'playing', msg: `[ SYSTEM ] ${dName(cur).toUpperCase()}'S TURN TO ROLL` };
      break;
    
    case 'RESTART_GAME':
      nextState = { ...state, phase: 'lobby', tokens: initTokens(), consec: initConsec(), ti: 0, rolled: null, hasRolled: false, winner: null, msg: '[ SYSTEM ] STANDBY. WAITING FOR PLAYERS...' };
      break;

    case 'FINISH_ROLL': {
      const { final } = action.payload;
      let newConsec = { ...state.consec };

      if (final === 6) { 
        newConsec[cur] += 1; 
        if (newConsec[cur] === 3) {
          const ni = getNextTurnIdx(state.ti, state.players);
          nextState = { ...state, consec: { ...state.consec, [cur]: 0 }, rolled: null, hasRolled: false, ti: ni, msg: `[ PENALTY ] 3 SIXES. TURN FORFEITED.` };
          break;
        }
      } else { newConsec[cur] = 0; }

      const hasAny = state.tokens[cur].some(t => canMove(cur, t.pos, final, state));
      nextState = {
        ...state, rolled: final, hasRolled: hasAny, consec: newConsec,
        msg: hasAny ? `[ ACTION ] ${dName(cur).toUpperCase()} ROLLED ${final}. SELECT UNIT.` : `[ INFO ] NO VALID MOVES FOR ${dName(cur).toUpperCase()}.`
      };
      if (!hasAny) {
         const ni = getNextTurnIdx(state.ti, state.players);
         nextState = { ...nextState, consec: { ...state.consec, [cur]: 0 }, ti: ni, hasRolled: false, rolled: null, msg: `NO VALID MOVES. ${dName(ORDER[ni]).toUpperCase()}'S TURN.` };
      }
      break;
    }
    
    case 'MOVE_TOKEN': {
      if (!state.hasRolled || state.rolled === null) return state; 
      const { pk, idx } = action.payload;
      const pos = state.tokens[pk][idx].pos;
      
      if (!canMove(pk, pos, state.rolled, state)) return state;

      const newPos = pos < 0 ? 0 : pos + state.rolled;
      let newTokens = { ...state.tokens, [pk]: state.tokens[pk].map((t, i) => i === idx ? { pos: newPos } : t) };
      let getsExtraTurn = state.rolled === 6;

      if (newPos >= 0 && newPos <= 50) {
        const c = getCell(pk, newPos);
        if (c && !SAFE_ALL.has(`${c[0]},${c[1]}`)) {
          ORDER.forEach(opp => {
            if (opp === pk || !state.players[opp]) return;
            newTokens[opp] = newTokens[opp].map(t => {
              if (t.pos >= 0 && t.pos <= 50) {
                const oc = getCell(opp, t.pos);
                if (oc && oc[0] === c[0] && oc[1] === c[1]) {
                  getsExtraTurn = true; return { pos: -1 };
                }
              }
              return t;
            });
          });
        }
      }

      if (newPos >= 56) getsExtraTurn = true;

      if (newTokens[pk].every(t => t.pos >= 56)) {
        nextState = { ...state, tokens: newTokens, winner: pk, hasRolled: false, msg: `🏆 MATCH COMPLETE: ${dName(pk).toUpperCase()} WINS.` };
      } else if (getsExtraTurn) {
        nextState = { ...state, tokens: newTokens, hasRolled: false, rolled: null, msg: `[ BONUS ] ${dName(cur).toUpperCase()} GRANTED EXTRA TURN.` };
      } else {
        const ni = getNextTurnIdx(state.ti, state.players);
        nextState = { ...state, tokens: newTokens, consec: { ...state.consec, [cur]: 0 }, ti: ni, hasRolled: false, rolled: null, msg: `[ SYSTEM ] ${dName(ORDER[ni]).toUpperCase()}'S TURN TO ROLL` };
      }
      break;
    }
    
    case 'NEXT_TURN': {
      const ni = getNextTurnIdx(state.ti, state.players);
      nextState = { ...state, consec: { ...state.consec, [cur]: 0 }, ti: ni, hasRolled: false, rolled: null, msg: `[ SYSTEM ] ${dName(ORDER[ni]).toUpperCase()}'S TURN TO ROLL` };
      break;
    }

    case 'AUTO_RESOLVE_TURN': {
      let tempState = { ...state };
      if (!tempState.hasRolled) {
        const final = Math.floor(Math.random() * 6) + 1;
        tempState = gameReducer(tempState, { type: 'FINISH_ROLL', payload: { final } });
      }
      if (tempState.hasRolled && tempState.ti === state.ti) {
        const validTokens = tempState.tokens[cur]
            .map((t, idx) => ({ idx, pos: t.pos }))
            .filter(t => canMove(cur, t.pos, tempState.rolled, tempState));
        if (validTokens.length > 0) {
            const randomToken = validTokens[Math.floor(Math.random() * validTokens.length)];
            tempState = gameReducer(tempState, { type: 'MOVE_TOKEN', payload: { pk: cur, idx: randomToken.idx } });
        } else {
            tempState = gameReducer(tempState, { type: 'NEXT_TURN' });
        }
      }
      return tempState;
    }

    case 'KICK_PLAYER': {
      const newPlayers = { ...state.players };
      delete newPlayers[action.payload];
      nextState = { ...state, players: newPlayers };
      break;
    }
    case 'UPDATE_HOST': {
      nextState = { ...state, hostId: action.payload };
      break;
    }
    case 'FORCE_WIN': {
      if (state.winner) return state; 
      nextState = { ...state, winner: action.payload, msg: `🏆 ${dName(action.payload).toUpperCase()} WINS BY FORFEIT`, hasRolled: false };
      break;
    }
  }

  // FIX: Inject synchronized server time instead of raw local Date.now()
  if (['START_GAME', 'FINISH_ROLL', 'MOVE_TOKEN', 'NEXT_TURN', 'AUTO_RESOLVE_TURN', 'RESTART_GAME'].includes(action.type)) {
    nextState.lastUpdatedAt = action.serverTime || Date.now();
  }
  return nextState;
}

// ── 4. UI COMPONENTS ───────────────────────────────────────────────────────
function getCellBg(r, c) {
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return null; 
  if (r === 7 && c >= 1 && c <= 5) return COLORS.RED.muted;
  if (c === 7 && r >= 1 && r <= 5) return COLORS.GREEN.muted;
  if (r === 7 && c >= 9 && c <= 13) return COLORS.YELLOW.muted;
  if (c === 7 && r >= 9 && r <= 13) return COLORS.BLUE.muted;
  return TRACK_BG;
}

const Star = React.memo(({ cx, cy, r }) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI / 5) - Math.PI / 2, rad = i % 2 === 0 ? r : r * .42;
    return `${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`;
  }).join(' ');
  return <polygon points={pts} fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1.5" />; 
});

function Token({ fill, dark, r, clickable }) {
  return (
    <g style={{ cursor: clickable ? 'pointer' : 'default', touchAction: 'manipulation' }}>
      {clickable && <circle r={r + 15} fill="transparent" />}
      {clickable && <circle r={r + 8} fill="none" stroke={fill} strokeWidth="2.5" strokeDasharray="4 4" className="spin-ring" style={{ pointerEvents: 'none' }} />}
      <circle r={r} cx="2" cy="4" fill="rgba(0,0,0,0.2)" style={{ pointerEvents: 'none' }} /> 
      <circle r={r} fill={dark} stroke="#FFF" strokeWidth="1.5" style={{ pointerEvents: 'none' }} />
      <circle r={r * .75} fill={fill} style={{ pointerEvents: 'none' }} />
      <circle r={r * .35} fill="#FFF" opacity="0.4" style={{ pointerEvents: 'none' }} />
    </g>
  );
}

function Dice({ value, rolling, onClick, disabled, activeColor }) {
  const sz = 56, dots = {
    1: [[50, 50]], 2: [[25, 25], [75, 75]], 3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]], 5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
  }[value] || [[50, 50]];
  const glow = disabled ? 'none' : `0 0 15px ${activeColor.shadow}`;
  
  return (
    <div onClick={(!disabled && !rolling) ? onClick : null} style={{
      width: sz, height: sz, background: '#141920', borderRadius: 12, position: 'relative',
      cursor: disabled || rolling ? 'default' : 'pointer',
      boxShadow: `${glow}, 0 4px 10px rgba(0,0,0,0.5)`, opacity: disabled ? 0.4 : 1, transition: 'all 0.2s ease',
      transform: rolling ? 'scale(0.9) rotate(15deg)' : 'scale(1) rotate(0deg)',
      border: `2px solid ${disabled ? '#333' : activeColor.fill}`, touchAction: 'manipulation' 
    }}>
      <svg width={sz} height={sz} style={{ position: 'absolute', top: 0, left: 0 }}>
        {dots.map(([px, py], i) => <circle key={i} cx={sz * px / 100} cy={sz * py / 100} r="4" fill={disabled ? "#666" : activeColor.fill} />)}
      </svg>
    </div>
  );
}

const BoardBackground = React.memo(() => {
  const cells = [], overlays = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if ((r <= 5 && c <= 5) || (r <= 5 && c >= 9) || (r >= 9 && c >= 9) || (r >= 9 && c <= 5)) continue;
      if (r >= 6 && r <= 8 && c >= 6 && c <= 8) continue;

      const bg = getCellBg(r, c), x = c * CELL, y = r * CELL;
      cells.push(<rect key={`${r},${c}`} x={x} y={y} width={CELL} height={CELL} fill={bg} stroke={GRID_LINE} strokeWidth="1" />);
      if (SAFE_STARS.has(`${r},${c}`)) overlays.push(<Star key={`s${r},${c}`} cx={x + CELL / 2} cy={y + CELL / 2} r={CELL * .25} />);
      if (START_CLR[`${r},${c}`]) {
        const sf = COLORS[START_CLR[`${r},${c}`]].fill;
        overlays.push(<g key={`st${r},${c}`}>
          <rect x={x+4} y={y+4} width={CELL-8} height={CELL-8} fill="transparent" stroke={sf} strokeWidth="2.5" />
          <text x={x + CELL / 2} y={y + CELL / 2 + 4} textAnchor="middle" fontSize="10" fill={sf} fontWeight="bold">▲</text>
        </g>);
      }
    }
  }
  return <>{cells}{overlays}</>;
});

const PlayerCard = ({ pk, state }) => {
  const p = state.players?.[pk];
  const color = COLORS[pk];
  
  if (!p) return (
    <div className={`player-card card-${pk} empty`}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#333' }} />
      <span style={{color: '#555', fontSize: 12}}>SLOT OPEN</span>
    </div>
  );

  const isActive = state.ti === ORDER.indexOf(pk) && !state.winner;
  const isWinner = state.winner === pk;
  const isOffline = p.isOnline === false;

  return (
    <div className={`player-card card-${pk} ${isActive ? 'active' : ''}`} style={{
      borderColor: isActive || isWinner ? color.fill : 'rgba(255,255,255,0.08)',
      boxShadow: isActive || isWinner ? `0 0 15px ${color.shadow}, 0 5px 20px rgba(0,0,0,0.8)` : '0 5px 15px rgba(0,0,0,0.5)',
      background: isActive ? 'rgba(20, 25, 32, 0.95)' : 'rgba(15, 20, 26, 0.8)',
      opacity: isOffline ? 0.6 : 1
    }}>
      <div className="avatar-box" style={{ background: '#111', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color.fill}`, boxShadow: `inset 0 0 10px ${color.muted}` }}>
        {p.avatar}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13, letterSpacing: '1px' }}>
             {p.name.substring(0,8).toUpperCase()} {isWinner && '🏆'}
           </span>
           {isOffline && <span style={{ background: '#FF4655', color: '#000', fontSize: 8, padding: '2px 4px', borderRadius: 4, fontWeight: 'bold' }}>OFFLINE</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          {state.tokens?.[pk]?.map((t, i) => (
             <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: t.pos >= 56 ? color.fill : (t.pos >= 0 ? color.fill : '#222'), boxShadow: t.pos >= 0 ? `0 0 5px ${color.shadow}` : 'none', border: `1px solid ${t.pos >= 0 ? color.fill : '#444'}` }} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ── 5. MAIN APP ────────────────────────────────────────────────────────────
export default function App() {
  const [myId, setMyId] = useState(() => Math.random().toString(36).substring(2, 10));
  const [myColor, setMyColor] = useState(null);
  const [myName, setMyName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [viewState, setViewState] = useState('landing');
  
  const [state, dispatchLocal] = useReducer(gameReducer, null);
  const [rolling, setRolling] = useState(false);
  const [visualDice, setVisualDice] = useState(1);
  const [particles, setParticles] = useState([]);
  const forceWinSentRef = useRef(false);

  const [now, setNow] = useState(Date.now());
  const [globalPlayers, setGlobalPlayers] = useState(0);

  // CLOCK SYNC: Master Server Offset
  const serverOffsetRef = useRef(0);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef(null);

  const animRef = useRef(null);
  const rollTimeoutRef = useRef(null);

  // Grab Master Clock Offset from Firebase
  useEffect(() => {
    if (!db) return;
    const offsetRef = ref(db, ".info/serverTimeOffset");
    const unsubOffset = onValue(offsetRef, (snap) => {
      serverOffsetRef.current = snap.val() || 0;
    });

    const connectedRef = ref(db, ".info/connected");
    const myPresenceRef = ref(db, `global-presence/${myId}`);
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        set(myPresenceRef, true);
        onDisconnect(myPresenceRef).remove();
      }
    });

    const totalPresenceRef = ref(db, 'global-presence');
    const unsubPresenceCount = onValue(totalPresenceRef, (snap) => {
      if (snap.exists()) setGlobalPlayers(Object.keys(snap.val()).length);
      else setGlobalPlayers(0);
    });

    return () => { unsubOffset(); unsubConnected(); unsubPresenceCount(); set(myPresenceRef, null); };
  }, [myId]);

  useEffect(() => {
    if (!db || !roomId) return;
    const chatRef = ref(db, `ludo-chats/${roomId}`);
    const unsubChat = onValue(chatRef, (snap) => {
      if (snap.exists()) {
        const msgs = Object.values(snap.val()).sort((a,b) => a.timestamp - b.timestamp);
        setChatMessages(msgs);
      } else {
        setChatMessages([]);
      }
    });
    return () => unsubChat();
  }, [roomId]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatOpen]);

  useEffect(() => {
    const savedSession = sessionStorage.getItem('ludo_session');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.savedId) {
          setMyId(parsed.savedId); setMyName(parsed.savedName); setRoomId(parsed.savedRoom); setMyColor(parsed.savedColor);
          setViewState('playing');
        }
      } catch (e) {
        sessionStorage.removeItem('ludo_session');
      }
    }
  }, []);

  useEffect(() => {
    if (!db || !roomId) return;
    const gameRef = ref(db, `ludo-rooms/${roomId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const serverState = snapshot.val();
      if (serverState) dispatchLocal({ type: 'OVERRIDE_STATE', payload: serverState });
      else { sessionStorage.removeItem('ludo_session'); setRoomId(null); setViewState('landing'); }
    });
    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (!db || !roomId || !myColor || !state?.phase) return;
    const myPlayerRef = ref(db, `ludo-rooms/${roomId}/players/${myColor}`);
    const myOnlineRef = ref(db, `ludo-rooms/${roomId}/players/${myColor}/isOnline`);

    if (state.phase === 'lobby') {
        set(myOnlineRef, true);
        onDisconnect(myPlayerRef).remove(); 
    } else if (state.phase === 'playing') {
        onDisconnect(myPlayerRef).cancel(); 
        set(myOnlineRef, true);
        onDisconnect(myOnlineRef).set(false); 
    }
  }, [roomId, myColor, state?.phase]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const dispatchToFirebase = (action) => {
    if (!db || !roomId) return;
    // INJECT THE MASTER SERVER TIME INTO EVERY ACTION
    const serverAdjustedTime = Date.now() + serverOffsetRef.current;
    runTransaction(ref(db, `ludo-rooms/${roomId}`), (currentState) => {
      if (!currentState) return currentState;
      return gameReducer(currentState, { ...action, serverTime: serverAdjustedTime });
    });
  };

  // CALCULATE TIME USING MASTER SERVER CLOCK
  const adjustedNow = now + serverOffsetRef.current;
  const rawTimeLeft = state && state.phase === 'playing' && !state.winner 
    ? 20 - Math.floor((adjustedNow - (state.lastUpdatedAt || adjustedNow)) / 1000)
    : 20;
    
  const displayTimeLeft = Math.max(0, rawTimeLeft);

  useEffect(() => {
    if (!state || state.phase !== 'playing' || !!state.winner || rolling) return;

    const cur = ORDER[state.ti];
    const isMyTurn = state.players?.[cur]?.id === myId;
    const isHost = state.hostId === myId;
    const isOffline = state.players?.[cur]?.isOnline === false;

    const forceAction = () => {
      dispatchToFirebase({ type: 'AUTO_RESOLVE_TURN', expectedTi: state.ti });
    };

    if (isOffline && isHost && rawTimeLeft <= 18) { forceAction(); }
    else if (rawTimeLeft === 0 && isMyTurn) { forceAction(); }
    else if (rawTimeLeft === -2 && isHost && !isMyTurn) { forceAction(); }
    else if (rawTimeLeft <= -4 && !isHost && !isMyTurn) { forceAction(); }

  }, [rawTimeLeft, state?.phase, state?.winner, rolling, myId, state?.hostId, state?.ti, state?.players]);

  useEffect(() => {
    if (state) {
      const activeColors = ORDER.filter(pk => state.players?.[pk]);
      const currentHostPk = ORDER.find(pk => state.players?.[pk]?.id === state.hostId);
      const hostIsOffline = currentHostPk ? state.players[currentHostPk].isOnline === false : true;

      if (hostIsOffline && activeColors.length > 0) {
          const nextEligibleHost = activeColors.find(pk => state.players[pk].isOnline !== false);
          if (nextEligibleHost && state.players[nextEligibleHost].id === myId) {
              dispatchToFirebase({ type: 'UPDATE_HOST', payload: myId });
          }
      }

      if (state.phase === 'playing') {
          const onlineColors = activeColors.filter(pk => state.players[pk].isOnline !== false);
          if (onlineColors.length === 1 && !state.winner && state.players[onlineColors[0]].id === myId) {
              if (!forceWinSentRef.current) {
                  forceWinSentRef.current = true;
                  setTimeout(() => dispatchToFirebase({ type: 'FORCE_WIN', payload: onlineColors[0] }), 500);
              }
          } else if (onlineColors.length > 1) {
              forceWinSentRef.current = false;
          }
      }
    }
  }, [state, myId]);

  useEffect(() => { return () => clearTimeout(rollTimeoutRef.current); }, []);

  const handleCreateRoom = () => {
    if (!myName.trim()) return alert("Enter Callsign.");
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const initial = {
      phase: 'lobby', hostId: myId,
      players: { RED: { id: myId, name: myName, avatar, isOnline: true } },
      tokens: initTokens(), ti: 0, rolled: null, hasRolled: false,
      msg: '[ SYSTEM ] STANDBY. WAITING FOR PLAYERS...', consec: initConsec(), 
      lastUpdatedAt: Date.now() + serverOffsetRef.current // USE MASTER CLOCK
    };
    set(ref(db, `ludo-rooms/${code}`), initial);
    setRoomId(code); setMyColor('RED');
    sessionStorage.setItem('ludo_session', JSON.stringify({ savedId: myId, savedName: myName, savedRoom: code, savedColor: 'RED' }));
  };

  const handleJoinRoom = async () => {
    if (!myName.trim()) return alert("Enter Callsign.");
    if (!inputCode.trim()) return alert("Enter Match ID.");
    const code = inputCode.toUpperCase();
    
    let joinStatus = '';
    let finalColor = null;

    runTransaction(ref(db, `ludo-rooms/${code}`), (roomData) => {
      if (!roomData) { joinStatus = 'not_found'; return roomData; }
      
      if (roomData.phase !== 'lobby') {
        const existingPlayerColor = ORDER.find(pk => roomData.players?.[pk]?.id === myId);
        if (existingPlayerColor) {
          joinStatus = 'reconnect';
          finalColor = existingPlayerColor;
          roomData.players[existingPlayerColor].isOnline = true;
          return roomData;
        }
        joinStatus = 'in_progress';
        return;
      }
      
      let assignedColor = ORDER.find(pk => roomData.players?.[pk]?.id === myId);
      if (assignedColor) {
         joinStatus = 'reconnect';
         finalColor = assignedColor;
         roomData.players[assignedColor].isOnline = true;
         return roomData;
      }

      assignedColor = ORDER.find(pk => !roomData.players?.[pk]);
      if (!assignedColor) { joinStatus = 'full'; return; }
      
      const usedAvatars = Object.values(roomData.players || {}).map(p => p.avatar);
      const availableAvatars = AVATARS.filter(a => !usedAvatars.includes(a));
      const avatar = availableAvatars.length > 0 ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)] : '🤖';

      if (!roomData.players) roomData.players = {};
      roomData.players[assignedColor] = { id: myId, name: myName, avatar, isOnline: true };
      joinStatus = 'joined';
      finalColor = assignedColor;
      return roomData;
    }).then(({ committed }) => {
      if (joinStatus === 'not_found') alert("Match not found.");
      else if (joinStatus === 'in_progress') alert("Match already in progress.");
      else if (joinStatus === 'full') alert("Lobby is full.");
      else if (committed && finalColor) {
         setRoomId(code); setMyColor(finalColor);
         sessionStorage.setItem('ludo_session', JSON.stringify({ savedId: myId, savedName: myName, savedRoom: code, savedColor: finalColor }));
      }
    });
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    alert("Match ID copied to clipboard!");
  };

  const handleLeaveMatch = () => {
    sessionStorage.removeItem('ludo_session');
    window.location.reload();
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !db || !roomId) return;
    
    // FIX: STAMP MESSAGES WITH THE PERFECTLY SYNCED SERVER TIME
    push(ref(db, `ludo-chats/${roomId}`), {
      sender: myName || 'AGENT',
      color: myColor || 'GRAY',
      text: chatInput.trim(),
      timestamp: Date.now() + serverOffsetRef.current 
    });
    setChatInput('');
  };

  function triggerParticles(cellR, cellC, color) {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const ox = cellC * CELL + CELL / 2, oy = cellR * CELL + CELL / 2;
    const count = 28;
    const ps = Array.from({ length: count }, (_, i) => ({
      id: i, ox, oy, dx: Math.cos((i / count) * Math.PI * 2) * (30 + Math.random() * 70), dy: Math.sin((i / count) * Math.PI * 2) * (30 + Math.random() * 70), r: 2.5 + Math.random() * 4, color: [color, '#FFF', '#888'][i % 3]
    }));
    const start = Date.now(), dur = 1200;
    function animate() {
      const prog = Math.min((Date.now() - start) / dur, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setParticles(ps.map(p => ({ id: p.id, x: p.ox + p.dx * ease, y: p.oy + p.dy * ease, r: p.r * (1 - prog * .6), color: p.color, opacity: 1 - prog })));
      if (prog < 1) animRef.current = requestAnimationFrame(animate); else setParticles([]);
    }
    animRef.current = requestAnimationFrame(animate);
  }

  function rollDice() {
    const cur = ORDER[state.ti];
    if (rolling || state.hasRolled || state.winner || state.players?.[cur]?.id !== myId) return;
    
    setRolling(true);
    const final = Math.floor(Math.random() * 6) + 1; 
    let i = 0;
    const delays = [50, 60, 70, 80, 100, 120, 150];
    const tick = () => {
      const last = i === delays.length - 1;
      setVisualDice(last ? final : Math.ceil(Math.random() * 6));
      if (last) {
        setRolling(false);
        dispatchToFirebase({ type: 'FINISH_ROLL', payload: { final }, expectedTi: state.ti });
      } else {
        i++; setTimeout(tick, delays[i]);
      }
    };
    setTimeout(tick, delays[0]);
  }

  function clickToken(pk, idx) {
    const cur = ORDER[state.ti];
    if (pk !== cur || !state.hasRolled || state.winner || state.players?.[cur]?.id !== myId) return;
    const currentPos = state.tokens[pk][idx].pos;
    if (!canMove(pk, currentPos, state.rolled, state)) return;
    const targetPos = currentPos < 0 ? 0 : currentPos + state.rolled;
    if (targetPos >= 56) triggerParticles(7, 7, COLORS[pk].fill);
    dispatchToFirebase({ type: 'MOVE_TOKEN', payload: { pk, idx }, expectedTi: state.ti });
  }

  const ChatUI = () => (
    isChatOpen ? (
      <div className="chat-overlay">
        <div style={{ background: '#111', padding: '12px', fontSize: 12, fontWeight: 'bold', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>COMM LINK</span>
          <button onClick={() => setIsChatOpen(false)} style={{ background:'transparent', border:'none', color:'#FF4655', cursor:'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        <div className="chat-messages">
          {chatMessages?.map((msg, i) => (
            <div key={i} className="chat-message">
              <span style={{ color: COLORS[msg.color]?.fill || '#888', fontWeight: 'bold' }}>{msg.sender}: </span>
              <span style={{ color: '#DDD' }}>{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="chat-input-area">
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} className="chat-input" placeholder="Transmit message..." maxLength={150} />
          <button type="submit" className="chat-send">SEND</button>
        </form>
      </div>
    ) : null
  );

  const globalCss = `
    * { box-sizing: border-box; }
    body { margin: 0; overscroll-behavior-y: none; background-color: #080A0C; }
    .game-layout { display: flex; flex-direction: column; height: 100dvh; background-image: radial-gradient(circle at center, #1B2027 0%, #080A0C 100%); color: #ffffff; font-family: ${FONT}; overflow: hidden; position: relative; }
    .neon-text { text-shadow: 0 0 10px rgba(255,255,255,0.3); }
    .spin-ring { transform-origin: center; animation: spin 3s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    .top-hud { padding: 12px 20px; display: flex; justify-content: space-between; border-bottom: 1px solid #222; font-size: 11px; letter-spacing: 1px; color: #888; font-weight: bold; flex-shrink: 0; background: rgba(8, 10, 12, 0.5); align-items: center; }
    .game-arena { flex: 1; display: grid; align-items: center; justify-items: center; padding: 10px; gap: 16px; width: 100%; max-width: 900px; margin: 0 auto; }
    .board-container { position: relative; border-radius: 8px; padding: 6px; background: #FFFFFF; border: 4px solid #1E293B; box-shadow: 0 10px 30px rgba(0,0,0,0.8); width: 100%; aspect-ratio: 1; }
    .player-card { width: 100%; max-width: 180px; position: absolute; background: rgba(15, 20, 26, 0.9); backdrop-filter: blur(12px); border-radius: 12px; padding: 8px 12px; display: flex; gap: 10px; align-items: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid #222; min-width: 120px; z-index: 10; }
    .player-card.empty { opacity: 0.5; border-style: dashed; }
    .avatar-box { width: 32px; height: 32px; font-size: 16px; background: #111; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    
    .chat-overlay { position: absolute; right: 20px; bottom: 80px; width: 320px; height: 400px; background: rgba(15, 20, 26, 0.95); border: 1px solid #333; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.8); backdrop-filter: blur(10px); }
    @media (max-width: 600px) { .chat-overlay { right: 10px; left: 10px; bottom: 80px; width: auto; height: 50vh; } }
    .chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; scroll-behavior: smooth; }
    .chat-messages::-webkit-scrollbar { width: 4px; }
    .chat-messages::-webkit-scrollbar-track { background: transparent; }
    .chat-messages::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
    .chat-message { font-size: 12px; line-height: 1.4; word-wrap: break-word; }
    .chat-input-area { display: flex; border-top: 1px solid #333; background: #0A0D12; }
    .chat-input { flex: 1; background: transparent; border: none; color: white; padding: 12px; font-family: inherit; font-size: 12px; outline: none; }
    .chat-send { background: transparent; border: none; color: #00EA8D; padding: 0 16px; cursor: pointer; font-weight: bold; font-size: 10px; letter-spacing: 1px; }

    @media (max-aspect-ratio: 1/1) {
      .game-arena { grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto; align-content: space-evenly; }
      .card-RED { grid-column: 1; grid-row: 1; justify-self: start; position: relative;}
      .card-GREEN { grid-column: 2; grid-row: 1; justify-self: end; position: relative;}
      .board-container { grid-column: 1 / 3; grid-row: 2; max-width: 55dvh; }
      .card-BLUE { grid-column: 1; grid-row: 3; justify-self: start; position: relative;}
      .card-YELLOW { grid-column: 2; grid-row: 3; justify-self: end; position: relative;}
    }
    @media (min-aspect-ratio: 1/1) {
      .game-arena { grid-template-columns: auto 1fr auto; grid-template-rows: 1fr 1fr; gap: 20px; }
      .card-RED { grid-column: 1; grid-row: 1; align-self: end; justify-self: end; position: relative; }
      .card-BLUE { grid-column: 1; grid-row: 2; align-self: start; justify-self: end; position: relative;}
      .board-container { grid-column: 2; grid-row: 1 / 3; height: 100%; max-height: 70dvh; width: auto; }
      .card-GREEN { grid-column: 3; grid-row: 1; align-self: end; justify-self: start; position: relative;}
      .card-YELLOW { grid-column: 3; grid-row: 2; align-self: start; justify-self: start; position: relative;}
      .avatar-box { width: 40px; height: 40px; font-size: 20px; }
      .player-card { padding: 12px 20px; min-width: 160px; gap: 16px; }
    }
    .tactical-dock { flex-shrink: 0; background: rgba(10, 13, 18, 0.95); border-top: 1px solid #333; padding: 12px 20px; padding-bottom: max(12px, env(safe-area-inset-bottom)); display: flex; align-items: center; justify-content: space-between; width: 100%; z-index: 10; }
    .btn-action { background: transparent; border: 1px solid #444; color: #888; padding: 12px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 1px; touch-action: manipulation; font-size: 12px; }
    .btn-action.active { color: #000; box-shadow: 0 0 15px var(--glow-color); }
  `;

  if (!roomId || !state) {
    return (
      <div className="game-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <style>{globalCss}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 20, width: '100%' }}>
          <h1 style={{ fontSize: 'clamp(32px, 8vw, 64px)', fontWeight: 900, letterSpacing: '10px', marginBottom: 10 }} className="neon-text">LUDO<span style={{color: COLORS.RED.fill}}>.</span></h1>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 30, letterSpacing: '4px' }}>TACTICAL MULTIPLAYER</p>
          
          <div style={{ background: 'rgba(0, 234, 141, 0.1)', border: `1px solid ${COLORS.GREEN.fill}`, color: COLORS.GREEN.fill, padding: '6px 12px', borderRadius: 20, fontSize: 10, fontWeight: 'bold', letterSpacing: '1px', marginBottom: 40, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ height: 6, width: 6, borderRadius: '50%', background: COLORS.GREEN.fill, display: 'inline-block', boxShadow: `0 0 8px ${COLORS.GREEN.fill}` }}></span>
            {globalPlayers} AGENTS ONLINE
          </div>

          {viewState === 'landing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 300 }}>
              <button onClick={() => setViewState('creating')} style={{ background: 'transparent', border: `2px solid ${COLORS.RED.fill}`, color: COLORS.RED.fill, padding: '16px', borderRadius: 8, fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: `inset 0 0 10px ${COLORS.RED.shadow}`, touchAction: 'manipulation' }}>INITIALIZE MATCH</button>
              <button onClick={() => setViewState('joining')} style={{ background: 'transparent', border: `2px solid ${COLORS.BLUE.fill}`, color: COLORS.BLUE.fill, padding: '16px', borderRadius: 8, fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: `inset 0 0 10px ${COLORS.BLUE.shadow}`, touchAction: 'manipulation' }}>JOIN MATCH</button>
            </div>
          )}
          {(viewState === 'creating' || viewState === 'joining') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 300, background: 'rgba(255,255,255,0.02)', padding: 30, border: '1px solid #333', borderRadius: 12 }}>
              <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="CALLSIGN" maxLength={10} style={{ background: 'transparent', border: 'none', borderBottom: '2px solid #555', color: 'white', padding: '12px', fontSize: 16, textAlign: 'center', fontFamily: FONT, outline: 'none', textTransform: 'uppercase' }} />
              {viewState === 'joining' && <input value={inputCode} onChange={e => setInputCode(e.target.value)} placeholder="MATCH ID" maxLength={6} style={{ background: 'transparent', border: 'none', borderBottom: '2px solid #555', color: 'white', padding: '12px', fontSize: 16, textAlign: 'center', fontFamily: FONT, outline: 'none', textTransform: 'uppercase' }} />}
              <button onClick={viewState === 'creating' ? handleCreateRoom : handleJoinRoom} style={{ background: COLORS.GREEN.fill, border: 'none', color: '#000', padding: '16px', borderRadius: 8, fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', marginTop: 10, boxShadow: `0 0 15px ${COLORS.GREEN.shadow}`, touchAction: 'manipulation' }}>CONNECT</button>
              <button onClick={() => setViewState('landing')} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12, marginTop: 10, letterSpacing: '1px', touchAction: 'manipulation' }}>CANCEL</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === 'lobby') {
    const isHost = state.hostId === myId;
    const playerCount = Object.values(state.players || {}).filter(Boolean).length;
    
    return (
      <div className="game-layout" style={{ alignItems: 'center', padding: '20px 20px 40px 20px', overflowY: 'auto' }}>
        <style>{globalCss}</style>
        <div style={{ color: '#555', fontSize: 12, fontWeight: 'bold', letterSpacing: '2px', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>MATCH ID // <span style={{color: '#FFF'}}>{roomId}</span></div>
          <div style={{display: 'flex', gap: 10}}>
             <button onClick={() => setIsChatOpen(!isChatOpen)} style={{ background: isChatOpen ? '#FFF' : '#222', color: isChatOpen ? '#000' : 'white', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 10, letterSpacing: '1px', fontWeight: 'bold' }}>CHAT</button>
             <button onClick={copyRoomCode} style={{ background: '#222', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 10, letterSpacing: '1px' }}>COPY</button>
             <button onClick={handleLeaveMatch} style={{ background: 'transparent', border: '1px solid #FF4655', color: '#FF4655', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 10, letterSpacing: '1px' }}>LEAVE</button>
          </div>
        </div>
        <h2 style={{ fontSize: 'clamp(20px, 5vw, 24px)', letterSpacing: '4px', marginBottom: 30, marginTop: 30, textAlign: 'center' }}>LOBBY STANDBY</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, width: '100%', maxWidth: 600 }}>
          {ORDER.map(pk => {
            const p = state.players?.[pk];
            const col = COLORS[pk];
            return (
              <div key={pk} style={{ background: p ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.4)', border: `1px solid ${p ? col.fill : '#333'}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: p ? `0 0 15px ${col.shadow}` : 'none' }}>
                <div style={{ fontSize: 10, color: '#666', letterSpacing: '2px' }}>SLOT {ORDER.indexOf(pk)+1}</div>
                {p ? (
                  <div style={{ display: 'flex', justifyItems: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: '#FFF', flex: 1 }}>{p.avatar} {p.name.toUpperCase()}</span>
                    {isHost && p.id !== myId && (
                      <button onClick={() => dispatchToFirebase({ type: 'KICK_PLAYER', payload: pk })} style={{ background: 'transparent', border: '1px solid #FF4655', color: '#FF4655', cursor: 'pointer', fontSize: 10, padding: '6px 10px', borderRadius: 4, touchAction: 'manipulation' }}>KICK</button>
                    )}
                  </div>
                ) : <div style={{ fontSize: 14, color: '#444', letterSpacing: '1px' }}>EMPTY...</div>}
              </div>
            );
          })}
        </div>
        {isHost ? (
          <button onClick={() => dispatchToFirebase({ type: 'START_GAME' })} disabled={playerCount < 2} style={{ background: 'transparent', border: `2px solid ${COLORS.GREEN.fill}`, color: COLORS.GREEN.fill, padding: '16px 40px', borderRadius: 8, fontSize: 16, fontWeight: 'bold', letterSpacing: '4px', marginTop: 40, cursor: playerCount > 1 ? 'pointer' : 'default', opacity: playerCount > 1 ? 1 : 0.3, boxShadow: playerCount > 1 ? `inset 0 0 15px ${COLORS.GREEN.shadow}` : 'none', touchAction: 'manipulation' }}>
            INITIALIZE
          </button>
        ) : <p style={{ color: '#666', marginTop: 40, fontSize: 12, letterSpacing: '2px', textAlign: 'center' }}>AWAITING HOST INITIALIZATION...</p>}
        {ChatUI()}
      </div>
    );
  }

  const cur = ORDER[state.ti];
  const displayColor = state.winner ? COLORS[state.winner] : COLORS[cur];
  const activePlayer = state.players?.[cur];
  const isMyTurn = activePlayer && activePlayer.id === myId;
  const isHost = state.hostId === myId;

  const byCell = {};
  if (state && state.tokens) {
    ORDER.forEach(pk => {
      if (state.players?.[pk]) {
        state.tokens[pk]?.forEach((t, idx) => {
          if (t.pos >= 0) {
            const c = getCell(pk, t.pos);
            if (c) {
              const k = `${c[0]},${c[1]}`;
              (byCell[k] = byCell[k] || []).push({ pk, idx, pos: t.pos });
            }
          }
        });
      }
    });
  }

  const cx0 = 6 * CELL, cy0 = 6 * CELL, cs = 3 * CELL, cm = 1.5 * CELL;

  return (
    <div className="game-layout">
      <style>{globalCss}</style>
      
      <div className="top-hud">
        <div>ID: <span style={{color: '#FFF'}}>{roomId}</span></div>
        <div style={{display: 'flex', gap: '10px'}}>
           <button onClick={() => setIsChatOpen(!isChatOpen)} style={{ background: isChatOpen ? '#FFF' : '#222', color: isChatOpen ? '#000' : 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, letterSpacing: '1px', fontWeight: 'bold' }}>CHAT</button>
           {state.winner && isHost && (
             <button onClick={() => dispatchToFirebase({type: 'RESTART_GAME'})} style={{background: COLORS.GREEN.fill, border: 'none', color: 'black', fontWeight: 'bold', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', touchAction: 'manipulation', fontSize: 10, letterSpacing: '1px'}}>RESTART MATCH</button>
           )}
           <button onClick={handleLeaveMatch} style={{background: 'transparent', border: '1px solid #FF4655', color: '#FF4655', fontWeight: 'bold', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', touchAction: 'manipulation', fontSize: 10, letterSpacing: '1px'}}>LEAVE MATCH</button>
        </div>
        <div>OP: <span style={{color: COLORS[myColor]?.fill}}>{state.players?.[myColor]?.name.toUpperCase() || 'STANDBY'}</span></div>
      </div>

      <div className="game-arena">
        {ORDER.map(pk => <PlayerCard key={pk} pk={pk} state={state} />)}

        <div className="board-container">
          <svg viewBox={`0 0 ${W} ${W}`} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 4, touchAction: 'none' }}>
            <rect width={W} height={W} fill={BOARD_BG} />
            <BoardBackground />
            
            {!state.winner && (
              <rect 
                x={ORDER.indexOf(cur) === 0 || ORDER.indexOf(cur) === 3 ? 0 : 9*CELL} 
                y={ORDER.indexOf(cur) === 0 || ORDER.indexOf(cur) === 1 ? 0 : 9*CELL} 
                width={6*CELL} height={6*CELL} fill="none" stroke={COLORS[cur].fill} strokeWidth="4" 
                style={{ filter: `drop-shadow(0 0 10px ${COLORS[cur].fill})` }} 
              />
            )}

            {[[0, 0, COLORS.RED], [9, 0, COLORS.GREEN], [9, 9, COLORS.YELLOW], [0, 9, COLORS.BLUE]].map(([cx, cy, col], i) => (
              <g key={`base${i}`}>
                <rect x={cx * CELL} y={cy * CELL} width={6 * CELL} height={6 * CELL} fill={col.fill} />
                <rect x={(cx + 1) * CELL} y={(cy + 1) * CELL} width={4 * CELL} height={4 * CELL} fill="#FFFFFF" rx="8" />
              </g>
            ))}
            
            {ORDER.flatMap(pk => HOME_SLOTS[pk].map(([cx, cy], i) => (
              <circle key={`slot${pk}${i}`} cx={cx * CELL} cy={cy * CELL} r={CELL * .45} fill="#FFFFFF" stroke={COLORS[pk].fill} strokeWidth="2.5" strokeDasharray="4 4" />
            )))}

            <polygon points={`${cx0},${cy0} ${cx0 + cm},${cy0 + cm} ${cx0},${cy0 + cs}`} fill={COLORS.RED.fill} />
            <polygon points={`${cx0},${cy0} ${cx0 + cm},${cy0 + cm} ${cx0 + cs},${cy0}`} fill={COLORS.GREEN.fill} />
            <polygon points={`${cx0 + cs},${cy0} ${cx0 + cm},${cy0 + cm} ${cx0 + cs},${cy0 + cs}`} fill={COLORS.YELLOW.fill} />
            <polygon points={`${cx0},${cy0 + cs} ${cx0 + cm},${cy0 + cm} ${cx0 + cs},${cy0 + cs}`} fill={COLORS.BLUE.fill} />
            <circle cx={cx0 + cm} cy={cy0 + cm} r={cm * .2} fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />

            {ORDER.flatMap(pk => {
              if (!state.players?.[pk] || !state.tokens?.[pk]) return [];
              return state.tokens[pk].map((t, idx) => {
                const clickable = pk === cur && state.hasRolled && canMove(pk, t.pos, state.rolled, state) && isMyTurn;
                let targetX, targetY;
                let rToken = CELL * 0.35; 

                if (t.pos === -1) {
                  const [cx, cy] = HOME_SLOTS[pk][idx];
                  targetX = cx * CELL; targetY = cy * CELL;
                } else {
                  rToken = CELL * 0.28; 
                  const c = getCell(pk, t.pos);
                  if (!c) return null;
                  const k = `${c[0]},${c[1]}`;
                  const tksInCell = byCell[k] || [];
                  const stackIdx = tksInCell.findIndex(tk => tk.pk === pk && tk.idx === idx);
                  const offs = getStackOffsets(tksInCell.length);
                  const [ox, oy] = offs[stackIdx] || [0, 0];
                  
                  targetX = c[1] * CELL + CELL / 2 + ox;
                  targetY = c[0] * CELL + CELL / 2 + oy;
                }

                return (
                  <g key={`token-${pk}-${idx}`} 
                    style={{ transform: `translate(${targetX}px, ${targetY}px)`, transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }} 
                    onClick={() => clickToken(pk, idx)}
                  >
                    <Token fill={COLORS[pk].fill} dark={COLORS[pk].dark} r={rToken} clickable={clickable} />
                  </g>
                );
              });
            })}
            {particles.map(p => <circle key={p.id} cx={p.x} cy={p.y} r={p.r} fill={p.color} opacity={p.opacity} />)}
          </svg>
        </div>
      </div>

      <div className="tactical-dock">
        <div style={{ flex: 1, color: '#888', fontSize: 10, letterSpacing: '1px', display: 'flex', alignItems: 'center' }}>
          {state.msg}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div style={{ '--glow-color': displayColor.shadow }}>
            <Dice value={state.rolled || visualDice} rolling={rolling} onClick={rollDice} disabled={state.hasRolled || rolling || !!state.winner || !isMyTurn} activeColor={displayColor} />
          </div>
          {!state.winner && state.phase === 'playing' && (
             <div style={{ fontSize: 10, color: displayTimeLeft <= 5 ? '#FF4655' : (isMyTurn ? displayColor.fill : '#888'), marginTop: 10, letterSpacing: '2px', fontWeight: 'bold' }}>
               {isMyTurn ? (state.hasRolled ? `SELECT UNIT (${displayTimeLeft}S)` : `AWAITING ROLL (${displayTimeLeft}S)`) : `STANDBY (${displayTimeLeft}S)`}
             </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button 
            className={`btn-action ${isMyTurn && !state.hasRolled && !state.winner ? 'active' : ''}`}
            style={isMyTurn && !state.hasRolled && !state.winner ? { background: displayColor.fill, borderColor: displayColor.fill } : {}}
            onClick={rollDice} disabled={rolling || !isMyTurn || state.hasRolled || !!state.winner}
          >
            ROLL
          </button>
        </div>
      </div>
      
      {ChatUI()}
    </div>
  );
}
