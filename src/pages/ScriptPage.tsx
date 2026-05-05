import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText, Save } from "lucide-react";

const STORAGE_KEY = (slideId: string, index: number) =>
  `roomstay-script::${slideId}::${index}`;

function loadScript(slideId: string, index: number): string {
  try { return localStorage.getItem(STORAGE_KEY(slideId, index)) ?? ""; }
  catch { return ""; }
}

function saveScript(slideId: string, index: number, text: string) {
  try { localStorage.setItem(STORAGE_KEY(slideId, index), text); }
  catch { /* quota */ }
}

export default function ScriptPage() {
  const { slideId = "unknown" } = useParams<{ slideId: string }>();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalSlides, setTotalSlides]   = useState(0);
  const [slideTitle, setSlideTitle]     = useState("");
  const [script, setScript]             = useState("");
  const [saved, setSaved]               = useState(true);

  const channelRef  = useRef<BroadcastChannel | null>(null);
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIndex   = useRef<number>(-1);

  // ── Initialise BroadcastChannel ──────────────────────────────────────────
  useEffect(() => {
    const ch = new BroadcastChannel(`roomstay-script::${slideId}`);
    channelRef.current = ch;

    ch.onmessage = (ev) => {
      const d = ev.data;
      if (d?.type !== "slide-change") return;

      // Save the current slide's script before switching
      if (prevIndex.current >= 0) {
        saveScript(slideId, prevIndex.current, script);
      }

      const idx = d.index as number;
      prevIndex.current = idx;
      setCurrentIndex(idx);
      if (d.total)  setTotalSlides(d.total);
      if (d.title)  setSlideTitle(d.title);
      setScript(loadScript(slideId, idx));
      setSaved(true);
    };

    return () => ch.close();
    // intentionally exclude `script` to avoid re-subscribing on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId]);

  // Load first slide's script on mount
  useEffect(() => {
    setScript(loadScript(slideId, 0));
    prevIndex.current = 0;
  }, [slideId]);

  // ── Auto-save with debounce ───────────────────────────────────────────────
  const handleChange = useCallback((text: string) => {
    setScript(text);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveScript(slideId, currentIndex, text);
      setSaved(true);
    }, 600);
  }, [slideId, currentIndex]);

  // ── Manual prev / next ────────────────────────────────────────────────────
  const go = useCallback((delta: number) => {
    saveScript(slideId, currentIndex, script);
    const next = Math.max(0, Math.min(currentIndex + delta, Math.max(0, totalSlides - 1)));
    setCurrentIndex(next);
    prevIndex.current = next;
    setScript(loadScript(slideId, next));
    setSaved(true);
  }, [slideId, currentIndex, totalSlides, script]);

  const hasScript = script.trim().length > 0;
  const displayTitle = slideTitle || `Slide ${currentIndex + 1}`;

  return (
    <div
      className="min-h-screen flex flex-col select-none"
      style={{ background: "#080c14", color: "#e8ecf4", fontFamily: "system-ui, sans-serif" }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        style={{
          background: "#0d1120",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "0 16px",
          height: "52px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "4px" }}>
          <FileText size={15} color="#6366f1" />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
            Script
          </span>
        </div>

        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)" }} />

        {/* Slide nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={() => go(-1)}
            disabled={currentIndex === 0}
            style={{
              background: "none", border: "none", cursor: currentIndex === 0 ? "not-allowed" : "pointer",
              color: currentIndex === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.6)",
              display: "flex", alignItems: "center", padding: "4px", borderRadius: "4px",
            }}
            title="Previous slide"
          >
            <ChevronLeft size={16} />
          </button>

          <span style={{
            fontSize: "11px", fontWeight: 600, letterSpacing: "0.04em",
            color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums",
            minWidth: "52px", textAlign: "center",
          }}>
            {String(currentIndex + 1).padStart(2, "0")}
            {totalSlides > 0 && (
              <span style={{ color: "rgba(255,255,255,0.25)" }}>&nbsp;/&nbsp;{totalSlides}</span>
            )}
          </span>

          <button
            onClick={() => go(1)}
            disabled={totalSlides > 0 && currentIndex >= totalSlides - 1}
            style={{
              background: "none", border: "none",
              cursor: (totalSlides > 0 && currentIndex >= totalSlides - 1) ? "not-allowed" : "pointer",
              color: (totalSlides > 0 && currentIndex >= totalSlides - 1) ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.6)",
              display: "flex", alignItems: "center", padding: "4px", borderRadius: "4px",
            }}
            title="Next slide"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Title */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <p style={{
            fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.75)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {displayTitle}
          </p>
        </div>

        {/* Save indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
          {hasScript && (
            <>
              <Save size={11} color={saved ? "#34d399" : "#f59e0b"} />
              <span style={{ fontSize: "10px", color: saved ? "#34d399" : "#f59e0b" }}>
                {saved ? "Saved" : "Saving…"}
              </span>
            </>
          )}
        </div>
      </header>

      {/* ── Slide number accent bar ───────────────────────────────────────── */}
      <div style={{
        height: "3px", flexShrink: 0,
        background: "linear-gradient(90deg,#E84B3C 0%,#C2358F 25%,#5E3FBE 50%,#2B6FE0 75%,#5DC8C5 100%)",
      }} />

      {/* ── Script area ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 28px", minHeight: 0 }}>

        {/* Placeholder hint when empty */}
        {!hasScript && (
          <p style={{
            fontSize: "12px", color: "rgba(255,255,255,0.18)", fontStyle: "italic",
            marginBottom: "12px", pointerEvents: "none", userSelect: "none",
          }}>
            No script for this slide — start typing below to add notes.
          </p>
        )}

        <textarea
          value={script}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Type your script / speaker notes for this slide…"
          style={{
            flex: 1,
            width: "100%",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "10px",
            padding: "20px 22px",
            color: "#d8e0ef",
            fontSize: "15px",
            lineHeight: "1.8",
            fontFamily: "Georgia, 'Times New Roman', serif",
            resize: "none",
            outline: "none",
            caretColor: "#6366f1",
            minHeight: "200px",
          }}
          onFocus={(e) => { e.target.style.borderColor = "rgba(99,102,241,0.4)"; }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(255,255,255,0.07)";
            saveScript(slideId, currentIndex, script);
            setSaved(true);
          }}
          spellCheck
          autoFocus
        />
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        padding: "8px 28px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", letterSpacing: "0.06em" }}>
          DIJITALLY SCRIPT VIEWER
        </span>
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.15)", fontVariantNumeric: "tabular-nums" }}>
          {script.trim().split(/\s+/).filter(Boolean).length} words
        </span>
      </footer>
    </div>
  );
}
