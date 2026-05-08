import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// localStorage key used only when the user is not authenticated
const LS_KEY = (slideId: string, index: number) =>
  `roomstay-script::${slideId}::${index}`;

function lsLoad(slideId: string, index: number): string {
  try { return localStorage.getItem(LS_KEY(slideId, index)) ?? ""; }
  catch { return ""; }
}

function lsSave(slideId: string, index: number, text: string) {
  try { localStorage.setItem(LS_KEY(slideId, index), text); }
  catch { /* quota */ }
}

async function dbLoad(slideId: string, index: number, userId: string): Promise<string> {
  const { data } = await supabase
    .from("slide_notes")
    .select("content")
    .eq("deck_id", slideId)
    .eq("slide_index", index)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.content ?? "";
}

async function dbSave(slideId: string, index: number, userId: string, text: string) {
  await supabase
    .from("slide_notes")
    .upsert(
      { deck_id: slideId, slide_index: index, user_id: userId, content: text, updated_at: new Date().toISOString() },
      { onConflict: "deck_id,slide_index,user_id" }
    );
}

export default function ScriptPage() {
  const { slideId = "unknown" } = useParams<{ slideId: string }>();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalSlides, setTotalSlides]   = useState(0);
  const [slideTitle, setSlideTitle]     = useState("");
  const [script, setScript]             = useState("");
  const [saved, setSaved]               = useState(true);
  const [userId, setUserId]             = useState<string | null>(null);

  const channelRef  = useRef<BroadcastChannel | null>(null);
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIndex   = useRef<number>(-1);
  const scriptRef   = useRef<string>("");  // always current value, avoids stale closure

  // Keep scriptRef in sync with script state
  useEffect(() => { scriptRef.current = script; }, [script]);

  // Resolve auth user once on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Load a note (DB or localStorage) and update state
  const loadNote = useCallback(async (idx: number, uid: string | null) => {
    const text = uid
      ? await dbLoad(slideId, idx, uid)
      : lsLoad(slideId, idx);
    setScript(text);
    scriptRef.current = text;
    setSaved(true);
  }, [slideId]);

  // Save current note
  const persistNote = useCallback((idx: number, text: string, uid: string | null) => {
    if (uid) {
      dbSave(slideId, idx, uid, text);
    } else {
      lsSave(slideId, idx, text);
    }
  }, [slideId]);

  // Load first slide on mount (userId may not be resolved yet — handled by the userId effect below)
  useEffect(() => {
    prevIndex.current = 0;
  }, [slideId]);

  // Once userId is resolved, load the first slide's note
  useEffect(() => {
    if (userId !== undefined) {  // null = not authed, string = authed
      loadNote(0, userId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // BroadcastChannel: receive slide changes from the viewer window
  useEffect(() => {
    const ch = new BroadcastChannel(`roomstay-script::${slideId}`);
    channelRef.current = ch;

    ch.onmessage = (ev) => {
      const d = ev.data;
      if (d?.type !== "slide-change") return;

      // Save current slide before switching
      if (prevIndex.current >= 0) {
        persistNote(prevIndex.current, scriptRef.current, userId);
      }

      const idx = d.index as number;
      prevIndex.current = idx;
      setCurrentIndex(idx);
      if (d.total) setTotalSlides(d.total);
      if (d.title) setSlideTitle(d.title);
      loadNote(idx, userId);
    };

    return () => ch.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId, userId]);

  // Debounced save on every keystroke (600 ms)
  const handleChange = useCallback((text: string) => {
    setScript(text);
    scriptRef.current = text;
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistNote(currentIndex, text, userId);
      setSaved(true);
    }, 600);
  }, [currentIndex, userId, persistNote]);

  // Manual prev / next slide buttons
  const go = useCallback((delta: number) => {
    persistNote(currentIndex, scriptRef.current, userId);
    const next = Math.max(0, Math.min(currentIndex + delta, Math.max(0, totalSlides - 1)));
    setCurrentIndex(next);
    prevIndex.current = next;
    loadNote(next, userId);
  }, [currentIndex, totalSlides, userId, persistNote, loadNote]);

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
                {saved ? (userId ? "Saved to cloud" : "Saved locally") : "Saving…"}
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
            persistNote(currentIndex, scriptRef.current, userId);
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
