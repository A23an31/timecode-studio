import { useState, useCallback, useRef, useEffect } from "react";

// ── Timecode core logic ──────────────────────────────────────────────
const FRAME_RATES = [
  { label: "23.976", value: 23.976, drop: false, id: "23976" },
  { label: "24", value: 24, drop: false, id: "24" },
  { label: "25", value: 25, drop: false, id: "25" },
  { label: "29.97 ND", value: 29.97, drop: false, id: "2997nd" },
  { label: "29.97 DF", value: 29.97, drop: true, id: "2997df" },
  { label: "30", value: 30, drop: false, id: "30" },
  { label: "50", value: 50, drop: false, id: "50" },
  { label: "59.94 ND", value: 59.94, drop: false, id: "5994nd" },
  { label: "59.94 DF", value: 59.94, drop: true, id: "5994df" },
  { label: "60", value: 60, drop: false, id: "60" },
];

function tcToFrames(tc, fps, drop) {
  const roundFps = Math.round(fps);
  const parts = tc.split(/[:;]/).map(Number);
  if (parts.length !== 4) return null;
  const [hh, mm, ss, ff] = parts;
  if (isNaN(hh) || isNaN(mm) || isNaN(ss) || isNaN(ff)) return null;

  let totalFrames = hh * 3600 * roundFps + mm * 60 * roundFps + ss * roundFps + ff;

  if (drop) {
    const dropFrames = roundFps === 30 ? 2 : 4;
    const totalMinutes = 60 * hh + mm;
    totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  return totalFrames;
}

function framesToTc(frames, fps, drop) {
  const roundFps = Math.round(fps);
  if (frames < 0) frames = 0;

  if (drop) {
    const dropFrames = roundFps === 30 ? 2 : 4;
    const framesPerMin = roundFps * 60 - dropFrames;
    const framesPer10Min = roundFps * 600 - dropFrames * 9;
    const d = Math.floor(frames / framesPer10Min);
    const m = frames % framesPer10Min;
    const adj = m < roundFps * 60
      ? 0
      : dropFrames + dropFrames * Math.floor((m - roundFps * 60) / framesPerMin);
    frames += dropFrames * 9 * d + adj;
  }

  const ff = frames % roundFps;
  frames = Math.floor(frames / roundFps);
  const ss = frames % 60;
  frames = Math.floor(frames / 60);
  const mm = frames % 60;
  const hh = Math.floor(frames / 60);
  const sep = drop ? ";" : ":";
  return [hh, mm, ss].map(n => String(n).padStart(2, "0")).join(":") + sep + String(ff).padStart(2, "0");
}

function framesToSec(frames, fps) {
  return frames / fps;
}

function secToHms(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(3);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(Math.floor(s)).padStart(2, "0")}.${s.split(".")[1]}`;
}

function validateTc(tc) {
  return /^\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2}$/.test(tc);
}

// ── Component ────────────────────────────────────────────────────────
export default function TimecodeTool() {
  // Converter state
  const [convTc, setConvTc] = useState("00:00:00:00");
  const [convFps, setConvFps] = useState(FRAME_RATES[4]); // 29.97 DF default
  const [targetFps, setTargetFps] = useState(FRAME_RATES[2]); // 25
  const [convResult, setConvResult] = useState(null);
  const [convError, setConvError] = useState("");

  // Duration calculator state
  const [tcA, setTcA] = useState("00:00:00:00");
  const [tcB, setTcB] = useState("00:00:00:00");
  const [durFps, setDurFps] = useState(FRAME_RATES[4]);
  const [durOp, setDurOp] = useState("+");
  const [durResult, setDurResult] = useState(null);
  const [durError, setDurError] = useState("");

  // Active tab
  const [tab, setTab] = useState("convert");

  // ── Converter ──
  const handleConvert = useCallback(() => {
    setConvError("");
    setConvResult(null);
    if (!validateTc(convTc)) { setConvError("タイムコード形式が無効です（例: 01:23:45:12）"); return; }
    const frames = tcToFrames(convTc, convFps.value, convFps.drop);
    if (frames === null) { setConvError("変換エラー"); return; }
    const realSec = framesToSec(frames, convFps.value);
    const targetFrames = Math.round(realSec * targetFps.value);
    const converted = framesToTc(targetFrames, targetFps.value, targetFps.drop);
    setConvResult({ frames, realSec, converted, targetFrames });
  }, [convTc, convFps, targetFps]);

  // ── Duration calc ──
  const handleDuration = useCallback(() => {
    setDurError("");
    setDurResult(null);
    if (!validateTc(tcA)) { setDurError("タイムコードAが無効です"); return; }
    if (!validateTc(tcB)) { setDurError("タイムコードBが無効です"); return; }
    const fa = tcToFrames(tcA, durFps.value, durFps.drop);
    const fb = tcToFrames(tcB, durFps.value, durFps.drop);
    if (fa === null || fb === null) { setDurError("計算エラー"); return; }
    const result = durOp === "+" ? fa + fb : fa - fb;
    if (result < 0) { setDurError("結果がマイナスになります"); return; }
    const tc = framesToTc(result, durFps.value, durFps.drop);
    const sec = framesToSec(result, durFps.value);
    setDurResult({ frames: result, tc, sec, hms: secToHms(sec) });
  }, [tcA, tcB, durFps, durOp]);

  // ── Frame Rate Info ──
  const [infoFps, setInfoFps] = useState(FRAME_RATES[4]);

  // ── Rundown Calculator ──
  const DEFAULT_PRESETS = [
    { id: 1, name: "CM①", sec: 180, color: "#ff6644" },
    { id: 2, name: "CM②", sec: 120, color: "#ff6644" },
    { id: 3, name: "提供", sec: 15, color: "#ffaa44" },
    { id: 4, name: "提供（頭）", sec: 10, color: "#ffaa44" },
  ];
  const [rdFps, setRdFps] = useState(FRAME_RATES[4]);
  const [rdStartTc, setRdStartTc] = useState("00:00:00:00");
  const [rdPresets, setRdPresets] = useState(DEFAULT_PRESETS);
  const [rdNewName, setRdNewName] = useState("");
  const [rdNewSec, setRdNewSec] = useState("");
  const [rdRows, setRdRows] = useState([]); // { label, durSec, startTc, endTc, cumSec }
  const [rdSelectedPreset, setRdSelectedPreset] = useState(null);
  const [rdCustomSec, setRdCustomSec] = useState("00:00:00:00");
  const [rdError, setRdError] = useState("");

  const secToTc = (sec, fps) => {
    const frames = Math.round(sec * fps.value);
    return framesToTc(frames, fps.value, fps.drop);
  };

  const addRdRow = (name, durSec) => {
    setRdError("");
    if (!validateTc(rdStartTc) && rdRows.length === 0) {
      setRdError("開始タイムコードが無効です");
      return;
    }
    const startFrames = rdRows.length === 0
      ? tcToFrames(rdStartTc, rdFps.value, rdFps.drop)
      : tcToFrames(rdRows[rdRows.length - 1].endTc, rdFps.value, rdFps.drop);
    const durFrames = Math.round(durSec * rdFps.value);
    const endFrames = startFrames + durFrames;
    const cumSec = (rdRows.length > 0 ? rdRows[rdRows.length - 1].cumSec : 0) + durSec;
    const newRow = {
      id: Date.now(),
      label: name,
      durSec,
      startTc: framesToTc(startFrames, rdFps.value, rdFps.drop),
      endTc: framesToTc(endFrames, rdFps.value, rdFps.drop),
      cumSec,
    };
    setRdRows(prev => [...prev, newRow]);
  };

  const removeRdRow = (id) => {
    const idx = rdRows.findIndex(r => r.id === id);
    if (idx === -1) return;
    const removed = rdRows[idx];
    const newRows = rdRows.filter(r => r.id !== id);
    // recalculate from idx onwards
    let recalc = [];
    for (let i = 0; i < newRows.length; i++) {
      if (i < idx) { recalc.push(newRows[i]); continue; }
      const prevEnd = i === 0 ? rdStartTc : recalc[i - 1].endTc;
      const startF = tcToFrames(prevEnd, rdFps.value, rdFps.drop);
      const durF = Math.round(newRows[i].durSec * rdFps.value);
      const cumSec = (i > 0 ? recalc[i - 1].cumSec : 0) + newRows[i].durSec;
      recalc.push({
        ...newRows[i],
        startTc: framesToTc(startF, rdFps.value, rdFps.drop),
        endTc: framesToTc(startF + durF, rdFps.value, rdFps.drop),
        cumSec,
      });
    }
    setRdRows(recalc);
  };

  const addPreset = () => {
    if (!rdNewName.trim() || !rdNewSec || isNaN(Number(rdNewSec)) || Number(rdNewSec) <= 0) return;
    setRdPresets(prev => [...prev, { id: Date.now(), name: rdNewName.trim(), sec: Number(rdNewSec), color: "#6688ff" }]);
    setRdNewName(""); setRdNewSec("");
  };

  const removePreset = (id) => setRdPresets(prev => prev.filter(p => p.id !== id));

  const fmtSec = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}分${s > 0 ? s + "秒" : ""}` : `${s}秒`;
  };


  // ── Stopwatch ──
  const [swFps, setSwFps] = useState(FRAME_RATES[4]);
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0); // ms
  const [swLaps, setSwLaps] = useState([]); // { label, elapsed, lapTime }
  const [swLapLabel, setSwLapLabel] = useState("");
  const swStartRef = useRef(null);
  const swBaseRef = useRef(0);
  const swRafRef = useRef(null);

  const swTick = useCallback(() => {
    setSwElapsed(swBaseRef.current + (Date.now() - swStartRef.current));
    swRafRef.current = requestAnimationFrame(swTick);
  }, []);

  const swStart = useCallback(() => {
    swStartRef.current = Date.now();
    setSwRunning(true);
    swRafRef.current = requestAnimationFrame(swTick);
  }, [swTick]);

  const swStop = useCallback(() => {
    cancelAnimationFrame(swRafRef.current);
    swBaseRef.current = swBaseRef.current + (Date.now() - swStartRef.current);
    setSwRunning(false);
  }, []);

  const swReset = useCallback(() => {
    cancelAnimationFrame(swRafRef.current);
    swBaseRef.current = 0;
    swStartRef.current = null;
    setSwRunning(false);
    setSwElapsed(0);
    setSwLaps([]);
    setSwLapLabel("");
  }, []);

  const swLap = useCallback(() => {
    const current = swBaseRef.current + (Date.now() - swStartRef.current);
    const prevElapsed = swLaps.length > 0 ? swLaps[swLaps.length - 1].elapsed : 0;
    setSwLaps(prev => [...prev, {
      label: swLapLabel || `ラップ ${prev.length + 1}`,
      elapsed: current,
      lapTime: current - prevElapsed,
    }]);
    setSwLapLabel("");
  }, [swLaps, swLapLabel]);

  useEffect(() => () => cancelAnimationFrame(swRafRef.current), []);

  function msToTc(ms, fps, drop) {
    const frames = Math.floor(ms / 1000 * fps.value);
    return framesToTc(frames, fps.value, fps.drop);
  }

  function msToDisplay(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(cs).padStart(2,"0")}`;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      color: "#e0e0e0",
      padding: "0",
    }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid #1e3a2f",
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        background: "linear-gradient(180deg, #0d1a12 0%, #0a0a0f 100%)",
      }}>
        <div style={{
          width: 36, height: 36,
          border: "2px solid #00ff88",
          borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#00ff88", fontWeight: 700,
          boxShadow: "0 0 12px #00ff8844",
        }}>TC</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#00ff88", letterSpacing: "0.1em" }}>
            TIMECODE STUDIO
          </div>
          <div style={{ fontSize: 10, color: "#446655", letterSpacing: "0.25em" }}>
            BROADCAST & POST-PRODUCTION TOOL
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {["convert", "duration", "stopwatch", "rundown", "frameinfo"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 14px",
                background: tab === t ? "#00ff88" : "transparent",
                color: tab === t ? "#0a0a0f" : "#446655",
                border: `1px solid ${tab === t ? "#00ff88" : "#1e3a2f"}`,
                borderRadius: 3,
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
                fontWeight: 700,
                letterSpacing: "0.1em",
                transition: "all 0.15s",
              }}
            >
              {t === "convert" ? "TC変換" : t === "duration" ? "尺計算" : t === "stopwatch" ? "原稿計測" : t === "rundown" ? "番組表計算" : "FPS情報"}
            </button>
          ))}
        </div>
      </header>

      <main style={{ padding: "32px", maxWidth: 800, margin: "0 auto" }}>

        {/* ── TC Converter ── */}
        {tab === "convert" && (
          <section>
            <SectionTitle>タイムコード変換</SectionTitle>
            <p style={{ color: "#446655", fontSize: 11, marginBottom: 24, letterSpacing: "0.1em" }}>
              異なるフレームレート間でタイムコードを変換します
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "end", marginBottom: 20 }}>
              <div>
                <Label>入力タイムコード</Label>
                <TcInput value={convTc} onChange={setConvTc} />
                <Label style={{ marginTop: 10 }}>フレームレート</Label>
                <FpsSelect value={convFps} onChange={setConvFps} />
              </div>
              <div style={{ textAlign: "center", paddingBottom: 8, color: "#00ff88", fontSize: 20 }}>→</div>
              <div>
                <Label>変換先フレームレート</Label>
                <FpsSelect value={targetFps} onChange={setTargetFps} />
              </div>
            </div>

            <ActionButton onClick={handleConvert}>変換する</ActionButton>

            {convError && <ErrorBox>{convError}</ErrorBox>}

            {convResult && (
              <ResultBox>
                <ResultRow label="変換結果" value={convResult.converted} highlight />
                <ResultRow label="元フレーム数" value={`${convResult.frames} frames`} />
                <ResultRow label="実時間" value={`${convResult.realSec.toFixed(6)} 秒`} />
                <ResultRow label="変換後フレーム数" value={`${convResult.targetFrames} frames`} />
                <ResultRow label="HH:MM:SS.mmm" value={secToHms(convResult.realSec)} />
              </ResultBox>
            )}
          </section>
        )}

        {/* ── Duration Calc ── */}
        {tab === "duration" && (
          <section>
            <SectionTitle>尺計算（デュレーション）</SectionTitle>
            <p style={{ color: "#446655", fontSize: 11, marginBottom: 24, letterSpacing: "0.1em" }}>
              タイムコードの加算・減算を行います
            </p>

            <div style={{ marginBottom: 16 }}>
              <Label>フレームレート</Label>
              <FpsSelect value={durFps} onChange={setDurFps} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", marginBottom: 20 }}>
              <div>
                <Label>タイムコード A</Label>
                <TcInput value={tcA} onChange={setTcA} />
              </div>
              <div style={{ textAlign: "center" }}>
                <Label>演算</Label>
                <div style={{ display: "flex", gap: 6 }}>
                  {["+", "-"].map(op => (
                    <button
                      key={op}
                      onClick={() => setDurOp(op)}
                      style={{
                        width: 40, height: 40,
                        background: durOp === op ? "#00ff88" : "#0d1a12",
                        color: durOp === op ? "#0a0a0f" : "#00ff88",
                        border: `1px solid #00ff88`,
                        borderRadius: 3,
                        cursor: "pointer",
                        fontSize: 18,
                        fontFamily: "inherit",
                        fontWeight: 700,
                        transition: "all 0.15s",
                      }}
                    >{op}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>タイムコード B</Label>
                <TcInput value={tcB} onChange={setTcB} />
              </div>
            </div>

            <ActionButton onClick={handleDuration}>計算する</ActionButton>

            {durError && <ErrorBox>{durError}</ErrorBox>}

            {durResult && (
              <ResultBox>
                <ResultRow label="計算結果" value={durResult.tc} highlight />
                <ResultRow label="総フレーム数" value={`${durResult.frames} frames`} />
                <ResultRow label="実時間（秒）" value={`${durResult.sec.toFixed(6)} 秒`} />
                <ResultRow label="HH:MM:SS.mmm" value={durResult.hms} />
              </ResultBox>
            )}
          </section>
        )}

        {/* ── Stopwatch ── */}
        {tab === "stopwatch" && (
          <section>
            <SectionTitle>原稿読み計測</SectionTitle>
            <p style={{ color: "#446655", fontSize: 11, marginBottom: 24, letterSpacing: "0.1em" }}>
              原稿のデュレーションをラップ記録つきで計測します
            </p>

            {/* FPS selector */}
            <div style={{ marginBottom: 20 }}>
              <Label>フレームレート</Label>
              <FpsSelect value={swFps} onChange={setSwFps} />
            </div>

            {/* Main display */}
            <div style={{
              background: "#060e08",
              border: "1px solid #1e3a2f",
              borderRadius: 8,
              padding: "28px 24px",
              marginBottom: 20,
              textAlign: "center",
            }}>
              <div style={{
                fontSize: 52,
                fontWeight: 700,
                color: swRunning ? "#00ff88" : swElapsed > 0 ? "#aaeebb" : "#446655",
                letterSpacing: "0.08em",
                textShadow: swRunning ? "0 0 24px #00ff8866" : "none",
                transition: "color 0.3s, text-shadow 0.3s",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                marginBottom: 12,
              }}>
                {msToDisplay(swElapsed)}
              </div>
              <div style={{
                fontSize: 16,
                color: swRunning ? "#446655" : "#2a4a3a",
                letterSpacing: "0.2em",
              }}>
                {msToTc(swElapsed, swFps)}
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              {!swRunning ? (
                <button onClick={swStart} style={btnStyle("#00ff88", "#0a0a0f")}>
                  {swElapsed > 0 ? "▶ 再開" : "▶ スタート"}
                </button>
              ) : (
                <button onClick={swStop} style={btnStyle("#ffaa44", "#0a0a0f")}>
                  ⏸ 一時停止
                </button>
              )}
              {swRunning && (
                <button onClick={swLap} style={btnStyle("transparent", "#00ff88", "#00ff88")}>
                  ◎ ラップ記録
                </button>
              )}
              <button onClick={swReset} style={btnStyle("transparent", "#446655", "#1e3a2f")}>
                ↺ リセット
              </button>
            </div>

            {/* Lap label input */}
            {swRunning && (
              <div style={{ marginBottom: 20 }}>
                <Label>次のラップのラベル（任意）</Label>
                <input
                  value={swLapLabel}
                  onChange={e => setSwLapLabel(e.target.value)}
                  placeholder="例：導入部、Aパート、エンドロール..."
                  style={{
                    width: "100%",
                    background: "#0d1a12",
                    border: "1px solid #1e3a2f",
                    borderRadius: 4,
                    padding: "9px 14px",
                    color: "#c0c0c0",
                    fontFamily: "inherit",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            {/* Lap list */}
            {swLaps.length > 0 && (
              <div style={{ background: "#0d1a12", border: "1px solid #1e3a2f", borderRadius: 6, overflow: "hidden" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 1fr 1fr",
                  gap: 0,
                  padding: "8px 16px",
                  borderBottom: "1px solid #1e3a2f",
                }}>
                  {["#", "ラベル", "ラップ尺", "累計"].map(h => (
                    <div key={h} style={{ fontSize: 9, color: "#446655", letterSpacing: "0.2em", textTransform: "uppercase" }}>{h}</div>
                  ))}
                </div>
                {swLaps.map((lap, i) => (
                  <div key={i} style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr 1fr 1fr",
                    gap: 0,
                    padding: "10px 16px",
                    borderBottom: i < swLaps.length - 1 ? "1px solid #112210" : "none",
                    background: i % 2 === 0 ? "transparent" : "#060e08",
                  }}>
                    <div style={{ fontSize: 11, color: "#446655", paddingRight: 16 }}>{i + 1}</div>
                    <div style={{ fontSize: 12, color: "#c0c0c0" }}>{lap.label}</div>
                    <div style={{ fontSize: 12, color: "#00ff88", fontWeight: 700 }}>
                      {msToTc(lap.lapTime, swFps)}
                      <div style={{ fontSize: 10, color: "#446655" }}>{msToDisplay(lap.lapTime)}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#aaeebb" }}>
                      {msToTc(lap.elapsed, swFps)}
                      <div style={{ fontSize: 10, color: "#446655" }}>{msToDisplay(lap.elapsed)}</div>
                    </div>
                  </div>
                ))}
                {/* Total */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 1fr 1fr",
                  gap: 0,
                  padding: "12px 16px",
                  borderTop: "2px solid #1e3a2f",
                  background: "#060e08",
                }}>
                  <div />
                  <div style={{ fontSize: 10, color: "#446655", letterSpacing: "0.15em" }}>TOTAL</div>
                  <div />
                  <div style={{ fontSize: 14, color: "#00ff88", fontWeight: 700 }}>
                    {msToTc(swElapsed, swFps)}
                    <div style={{ fontSize: 10, color: "#446655" }}>{msToDisplay(swElapsed)}</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}


        {/* ── Rundown Calculator ── */}
        {tab === "rundown" && (
          <section>
            <SectionTitle>番組表計算</SectionTitle>
            <p style={{ color: "#446655", fontSize: 11, marginBottom: 24, letterSpacing: "0.1em" }}>
              CM・提供の尺を順番に積み上げて、各タイムコードを自動計算します
            </p>

            {/* Settings row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div>
                <Label>フレームレート</Label>
                <FpsSelect value={rdFps} onChange={setRdFps} />
              </div>
              <div>
                <Label>開始タイムコード</Label>
                <TcInput value={rdStartTc} onChange={setRdStartTc} />
              </div>
            </div>

            {/* Presets */}
            <div style={{ background: "#0d1a12", border: "1px solid #1e3a2f", borderRadius: 6, padding: 16, marginBottom: 20 }}>
              <Label>プリセット尺</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {rdPresets.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <button
                      onClick={() => addRdRow(p.name, p.sec)}
                      style={{
                        background: "#060e08",
                        color: p.color,
                        border: `1px solid ${p.color}66`,
                        borderRight: "none",
                        borderRadius: "4px 0 0 4px",
                        padding: "7px 14px",
                        fontFamily: "inherit",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {p.name} <span style={{ color: "#446655", fontWeight: 400 }}>{fmtSec(p.sec)}</span>
                    </button>
                    <button
                      onClick={() => removePreset(p.id)}
                      style={{
                        background: "#060e08",
                        color: "#446655",
                        border: `1px solid ${p.color}66`,
                        borderRadius: "0 4px 4px 0",
                        padding: "7px 8px",
                        fontFamily: "inherit",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>

              {/* Add preset */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={rdNewName}
                  onChange={e => setRdNewName(e.target.value)}
                  placeholder="名前（例：CM③）"
                  style={{ flex: 2, background: "#060e08", border: "1px solid #1e3a2f", borderRadius: 4, padding: "7px 12px", color: "#c0c0c0", fontFamily: "inherit", fontSize: 12, outline: "none" }}
                />
                <input
                  value={rdNewSec}
                  onChange={e => setRdNewSec(e.target.value)}
                  placeholder="秒数（例：90）"
                  type="number"
                  min="1"
                  style={{ flex: 1, background: "#060e08", border: "1px solid #1e3a2f", borderRadius: 4, padding: "7px 12px", color: "#c0c0c0", fontFamily: "inherit", fontSize: 12, outline: "none" }}
                />
                <button
                  onClick={addPreset}
                  style={{ background: "#1e3a2f", color: "#00ff88", border: "1px solid #00ff8844", borderRadius: 4, padding: "7px 14px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >＋ 追加</button>
              </div>
            </div>

            {/* Manual add */}
            <div style={{ background: "#0d1a12", border: "1px solid #1e3a2f", borderRadius: 6, padding: 16, marginBottom: 20 }}>
              <Label>手動で追加（タイムコードで尺を指定）</Label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <TcInput value={rdCustomSec} onChange={setRdCustomSec} />
                </div>
                <button
                  onClick={() => {
                    if (!validateTc(rdCustomSec)) return;
                    const frames = tcToFrames(rdCustomSec, rdFps.value, rdFps.drop);
                    if (!frames || frames <= 0) return;
                    const sec = frames / rdFps.value;
                    addRdRow(`手動 ${rdCustomSec}`, sec);
                    setRdCustomSec("00:00:00:00");
                  }}
                  style={{ background: "#00ff88", color: "#0a0a0f", border: "none", borderRadius: 4, padding: "9px 20px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em", whiteSpace: "nowrap" }}
                >追加</button>
              </div>
            </div>

            {rdError && <ErrorBox>{rdError}</ErrorBox>}

            {/* Rundown table */}
            {rdRows.length > 0 && (
              <div style={{ background: "#0d1a12", border: "1px solid #1e3a2f", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 80px 1fr 1fr 36px", gap: 0, padding: "8px 16px", borderBottom: "1px solid #1e3a2f", background: "#060e08" }}>
                  {["#", "区分", "尺", "IN", "OUT", ""].map((h, i) => (
                    <div key={i} style={{ fontSize: 9, color: "#446655", letterSpacing: "0.2em", textTransform: "uppercase" }}>{h}</div>
                  ))}
                </div>
                {rdRows.map((row, i) => (
                  <div key={row.id} style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr 80px 1fr 1fr 36px",
                    gap: 0,
                    padding: "11px 16px",
                    borderBottom: i < rdRows.length - 1 ? "1px solid #112210" : "none",
                    background: i % 2 === 0 ? "transparent" : "#060e08",
                    alignItems: "center",
                  }}>
                    <div style={{ fontSize: 11, color: "#446655", paddingRight: 12 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 700 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: "#ffaa44" }}>{fmtSec(row.durSec)}</div>
                    <div style={{ fontSize: 12, color: "#aaeebb", letterSpacing: "0.05em" }}>{row.startTc}</div>
                    <div style={{ fontSize: 13, color: "#00ff88", fontWeight: 700, letterSpacing: "0.05em", textShadow: "0 0 8px #00ff8844" }}>{row.endTc}</div>
                    <button
                      onClick={() => removeRdRow(row.id)}
                      style={{ background: "transparent", color: "#446655", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}
                    >✕</button>
                  </div>
                ))}
                {/* Total row */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 80px 1fr 1fr 36px", gap: 0, padding: "12px 16px", borderTop: "2px solid #1e3a2f", background: "#060e08", alignItems: "center" }}>
                  <div />
                  <div style={{ fontSize: 10, color: "#446655", letterSpacing: "0.2em" }}>TOTAL</div>
                  <div style={{ fontSize: 13, color: "#ffaa44", fontWeight: 700 }}>{fmtSec(rdRows[rdRows.length - 1].cumSec)}</div>
                  <div />
                  <div style={{ fontSize: 15, color: "#00ff88", fontWeight: 700, textShadow: "0 0 12px #00ff8866" }}>
                    {rdRows[rdRows.length - 1].endTc}
                  </div>
                  <div />
                </div>
              </div>
            )}

            {rdRows.length > 0 && (
              <button
                onClick={() => setRdRows([])}
                style={{ background: "transparent", color: "#446655", border: "1px solid #1e3a2f", borderRadius: 4, padding: "8px 16px", fontFamily: "inherit", fontSize: 11, cursor: "pointer", letterSpacing: "0.1em" }}
              >↺ 表をリセット</button>
            )}
          </section>
        )}

        {tab === "frameinfo" && (
          <section>
            <SectionTitle>フレームレート情報</SectionTitle>
            <p style={{ color: "#446655", fontSize: 11, marginBottom: 24, letterSpacing: "0.1em" }}>
              各フレームレートの特性と使用シーンを確認できます
            </p>

            <div style={{ marginBottom: 24 }}>
              <Label>フレームレートを選択</Label>
              <FpsSelect value={infoFps} onChange={setInfoFps} />
            </div>

            <FpsInfoCard fps={infoFps} />
          </section>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: 13,
      fontWeight: 700,
      color: "#00ff88",
      letterSpacing: "0.2em",
      borderLeft: "3px solid #00ff88",
      paddingLeft: 12,
      marginBottom: 8,
      textTransform: "uppercase",
    }}>{children}</h2>
  );
}

function Label({ children, style }) {
  return (
    <div style={{
      fontSize: 10,
      color: "#446655",
      letterSpacing: "0.2em",
      marginBottom: 6,
      textTransform: "uppercase",
      ...style,
    }}>{children}</div>
  );
}

// 数字8桁 → "HH:MM:SS:FF" に自動フォーマット
function formatTcInput(digits) {
  const d = digits.padStart(8, "0");
  return `${d.slice(0,2)}:${d.slice(2,4)}:${d.slice(4,6)}:${d.slice(6,8)}`;
}

function TcInput({ value, onChange, drop }) {
  const [showPad, setShowPad] = useState(false);
  const [digits, setDigits] = useState("00000000");
  const padRef = useRef(null);

  // 外部valueが変わったとき digits を同期
  useEffect(() => {
    const raw = value.replace(/[^0-9]/g, "").slice(0, 8).padStart(8, "0");
    setDigits(raw);
  }, [value]);

  // パッド外クリックで閉じる
  useEffect(() => {
    if (!showPad) return;
    const handler = (e) => {
      if (padRef.current && !padRef.current.contains(e.target)) setShowPad(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPad]);

  const pushDigit = (d) => {
    const next = (digits + d).slice(-8);
    setDigits(next);
    onChange(formatTcInput(next));
  };

  const backspace = () => {
    const next = ("0" + digits.slice(0, 7)).padStart(8, "0");
    setDigits(next);
    onChange(formatTcInput(next));
  };

  const clear = () => {
    setDigits("00000000");
    onChange("00:00:00:00");
  };

  const handleKeyInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 8);
    const next = raw.padStart(8, "0");
    setDigits(next);
    onChange(formatTcInput(next));
  };

  const sep = drop ? ";" : ":";
  const display = formatTcInput(digits).replace(/:/g, sep);

  return (
    <div style={{ position: "relative" }} ref={padRef}>
      <div style={{ display: "flex", gap: 0 }}>
        <input
          value={display}
          onChange={handleKeyInput}
          placeholder={`00${sep}00${sep}00${sep}00`}
          style={{
            flex: 1,
            background: "#0d1a12",
            border: "1px solid #1e3a2f",
            borderRight: "none",
            borderRadius: "4px 0 0 4px",
            padding: "10px 14px",
            color: "#00ff88",
            fontFamily: "inherit",
            fontSize: 18,
            letterSpacing: "0.15em",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = "#00ff88"}
          onBlur={e => e.target.style.borderColor = "#1e3a2f"}
        />
        <button
          onMouseDown={e => { e.preventDefault(); setShowPad(v => !v); }}
          style={{
            background: showPad ? "#00ff88" : "#0d1a12",
            color: showPad ? "#0a0a0f" : "#446655",
            border: "1px solid #1e3a2f",
            borderRadius: "0 4px 4px 0",
            padding: "0 12px",
            cursor: "pointer",
            fontSize: 16,
            fontFamily: "inherit",
          }}
          title="テンキー入力"
        >⌨</button>
      </div>

      {/* Tenkey Pad */}
      {showPad && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          zIndex: 100,
          background: "#0d1a12",
          border: "1px solid #00ff8844",
          borderRadius: 8,
          padding: 12,
          boxShadow: "0 8px 32px #00000088",
          width: 200,
        }}>
          {/* Display */}
          <div style={{
            background: "#060e08",
            border: "1px solid #1e3a2f",
            borderRadius: 4,
            padding: "8px 12px",
            marginBottom: 10,
            textAlign: "right",
            fontSize: 20,
            color: "#00ff88",
            letterSpacing: "0.15em",
            fontWeight: 700,
          }}>
            {display}
          </div>
          {/* Keys */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {[7,8,9,4,5,6,1,2,3].map(n => (
              <button key={n} onClick={() => pushDigit(String(n))} style={tkBtn("#0d1a12", "#e0e0e0")}>
                {n}
              </button>
            ))}
            <button onClick={clear} style={tkBtn("#1a0d0d", "#ff6644")}>C</button>
            <button onClick={() => pushDigit("0")} style={tkBtn("#0d1a12", "#e0e0e0")}>0</button>
            <button onClick={backspace} style={tkBtn("#1a1a0d", "#ffaa44")}>⌫</button>
          </div>
          <button
            onClick={() => setShowPad(false)}
            style={{ ...tkBtn("#1e3a2f", "#00ff88"), width: "100%", marginTop: 8, letterSpacing: "0.1em", fontSize: 11 }}
          >確定 ✓</button>
        </div>
      )}
    </div>
  );
}

function tkBtn(bg, color) {
  return {
    background: bg,
    color,
    border: "1px solid #1e3a2f",
    borderRadius: 4,
    padding: "10px 0",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "center",
  };
}

function FpsSelect({ value, onChange }) {
  return (
    <select
      value={value.id}
      onChange={e => onChange(FRAME_RATES.find(f => f.id === e.target.value))}
      style={{
        width: "100%",
        background: "#0d1a12",
        border: "1px solid #1e3a2f",
        borderRadius: 4,
        padding: "10px 14px",
        color: "#e0e0e0",
        fontFamily: "inherit",
        fontSize: 13,
        outline: "none",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      {FRAME_RATES.map(f => (
        <option key={f.id} value={f.id}>
          {f.label} fps {f.drop ? "▸ Drop Frame" : ""}
        </option>
      ))}
    </select>
  );
}

function ActionButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#00ff88",
        color: "#0a0a0f",
        border: "none",
        borderRadius: 4,
        padding: "12px 28px",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.2em",
        cursor: "pointer",
        marginBottom: 20,
        transition: "opacity 0.15s",
        textTransform: "uppercase",
      }}
      onMouseEnter={e => e.target.style.opacity = "0.85"}
      onMouseLeave={e => e.target.style.opacity = "1"}
    >{children}</button>
  );
}

function ErrorBox({ children }) {
  return (
    <div style={{
      background: "#1a0d0d",
      border: "1px solid #ff4444",
      borderRadius: 4,
      padding: "10px 16px",
      color: "#ff6666",
      fontSize: 12,
      marginBottom: 16,
      letterSpacing: "0.05em",
    }}>⚠ {children}</div>
  );
}

function ResultBox({ children }) {
  return (
    <div style={{
      background: "#0d1a12",
      border: "1px solid #1e3a2f",
      borderRadius: 6,
      padding: "20px",
      marginTop: 4,
    }}>{children}</div>
  );
}

function ResultRow({ label, value, highlight }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid #112210",
    }}>
      <span style={{ fontSize: 10, color: "#446655", letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</span>
      <span style={{
        fontSize: highlight ? 22 : 14,
        color: highlight ? "#00ff88" : "#c0c0c0",
        fontWeight: highlight ? 700 : 400,
        letterSpacing: highlight ? "0.15em" : "0.05em",
        textShadow: highlight ? "0 0 16px #00ff8866" : "none",
      }}>{value}</span>
    </div>
  );
}

// FPS info data
const FPS_INFO = {
  "23976": {
    title: "23.976 fps (23.98)",
    use: "映画・シネマティックコンテンツ、Netflix等OTT配信、海外ドラマ",
    drop: "ドロップフレームなし（Non-Drop）",
    note: "24fpsを0.1%スローにした規格。NTSCとの親和性があり、映画的な質感を保ちながら配信に適している。",
    color: "#6688ff",
  },
  "24": {
    title: "24 fps",
    use: "映画（フィルム）、劇場映画、映画的コンテンツ",
    drop: "ドロップフレームなし（Non-Drop）",
    note: "映画の標準規格。1秒に24コマの最も「映画らしい」フレームレート。",
    color: "#aa66ff",
  },
  "25": {
    title: "25 fps",
    use: "PAL放送圏（ヨーロッパ・アジア等）、NHK等国内BS放送",
    drop: "ドロップフレームなし（Non-Drop）",
    note: "50Hz電源周波数に対応。欧州・日本の放送標準。",
    color: "#44ccaa",
  },
  "2997nd": {
    title: "29.97 fps Non-Drop",
    use: "北米NTSC放送、収録・中間作業、素材保管",
    drop: "ノンドロップフレーム（ND）",
    note: "タイムコードと実時間が少しずつズレる。収録素材・編集途中によく使用。",
    color: "#ffaa44",
  },
  "2997df": {
    title: "29.97 fps Drop Frame",
    use: "北米NTSC放送、TV番組最終納品、CM素材",
    drop: "ドロップフレーム（DF）",
    note: "タイムコードが実時間と一致するよう補正。放送納品の標準規格。毎分頭の00フレームと01フレームをスキップ（10分毎を除く）。",
    color: "#ff6644",
  },
  "30": {
    title: "30 fps",
    use: "Web動画、YouTube、ゲーム映像、スポーツ",
    drop: "ドロップフレームなし（Non-Drop）",
    note: "29.97との混同に注意。インターネット配信やゲームコンテンツに多用。",
    color: "#44aaff",
  },
  "50": {
    title: "50 fps",
    use: "PAL圏のスポーツ中継・ハイフレームレートコンテンツ",
    drop: "ドロップフレームなし（Non-Drop）",
    note: "25fpsの2倍。動きの激しいスポーツや高品質放送向け。",
    color: "#44ccaa",
  },
  "5994nd": {
    title: "59.94 fps Non-Drop",
    use: "高フレームレート収録、スポーツ収録素材",
    drop: "ノンドロップフレーム（ND）",
    note: "29.97の2倍。高品質スポーツや4K HDRコンテンツの収録に使用。",
    color: "#ffaa44",
  },
  "5994df": {
    title: "59.94 fps Drop Frame",
    use: "高フレームレート放送納品、スポーツ中継",
    drop: "ドロップフレーム（DF）",
    note: "59.94のドロップフレーム版。実時間と同期した高フレームレート放送素材。",
    color: "#ff6644",
  },
  "60": {
    title: "60 fps",
    use: "ゲーム映像、Web高品質動画、VR/AR",
    drop: "ドロップフレームなし（Non-Drop）",
    note: "最も滑らかな映像表現。ゲームやインタラクティブコンテンツに最適。",
    color: "#44aaff",
  },
};

function FpsInfoCard({ fps }) {
  const info = FPS_INFO[fps.id];
  if (!info) return null;
  return (
    <div style={{
      background: "#0d1a12",
      border: `1px solid ${info.color}44`,
      borderLeft: `4px solid ${info.color}`,
      borderRadius: 6,
      padding: 24,
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: info.color, marginBottom: 16, letterSpacing: "0.05em" }}>
        {info.title}
      </div>
      <InfoRow label="主な用途" value={info.use} />
      <InfoRow label="DF/NDFタイプ" value={info.drop} />
      <InfoRow label="補足・注意事項" value={info.note} />

      <div style={{ marginTop: 20, padding: "12px 16px", background: "#060e08", borderRadius: 4, border: "1px solid #1e3a2f" }}>
        <div style={{ fontSize: 10, color: "#446655", letterSpacing: "0.2em", marginBottom: 8 }}>1時間あたりのフレーム数</div>
        <div style={{ fontSize: 20, color: info.color, fontWeight: 700 }}>
          {(Math.round(fps.value) * 3600).toLocaleString()} frames
        </div>
        {fps.drop && (
          <div style={{ fontSize: 10, color: "#446655", marginTop: 4 }}>
            ※ DF補正後: {(Math.round(fps.value) * 3600 - (fps.value > 30 ? 4 : 2) * (60 * 60 - 6)).toLocaleString()} frames
          </div>
        )}
      </div>
    </div>
  );
}

function btnStyle(bg, color, border) {
  return {
    background: bg,
    color,
    border: `1px solid ${border || bg}`,
    borderRadius: 4,
    padding: "10px 20px",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.1em",
    cursor: "pointer",
    transition: "opacity 0.15s",
  };
}


function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: "#446655", letterSpacing: "0.2em", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: "#c0c0c0", lineHeight: 1.6 }}>{value}</div>
    </div>
  );
}
