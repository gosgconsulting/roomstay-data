import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize2, Minimize2, ExternalLink, FileDown } from "lucide-react";
import { useState, useRef } from "react";

// Map deck IDs to their public HTML paths
const DECK_SRCS: Record<string, string> = {
  "brady-april-2026": "/slides/brady-april-2026.html",
  "brady-april-2026-full": "/slides/brady-april-2026-full.html",
  "brady-april-2026-highlevel": "/slides/brady-april-2026-highlevel.html",
  "brady-april-2026-hybrid": "/slides/brady-april-2026-hybrid.html",
  "brady-elizabeth-launch": "/slides/brady-elizabeth-launch.html",
  "brady-creative-refresh-april-2026": "/slides/brady-creative-refresh-april-2026.html",
};

export default function SlideViewerPage() {
  const { slideId } = useParams<{ slideId: string }>();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const src = slideId ? DECK_SRCS[slideId] : undefined;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Sync fullscreen state with browser ESC key
  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement);
  };

  // Open the deck in a new window with #pdf fragment.
  // Deck JS detects the fragment, captures each slide via html2canvas at fixed
  // 1280x720 (16:9), builds a PDF at PowerPoint widescreen 960pt x 540pt, and
  // triggers a direct browser download with a filename derived from <title>.
  // The new tab self-closes when done.
  const handleDownloadPDF = () => {
    if (!src) return;
    const w = window.open(`${src}#pdf`, "_blank");
    if (!w) {
      // Popup blocked — fallback: open the deck so the user can print manually
      window.open(src, "_blank");
    }
  };

  if (!src) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Slide deck not found.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-[#07101e] flex flex-col"
      onFullscreenChange={handleFullscreenChange}
    >
      {/* Toolbar — hidden in fullscreen via CSS */}
      <div
        className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-black/60 backdrop-blur-sm border-b border-white/10 transition-opacity duration-200 group-hover:opacity-100"
        style={{ opacity: isFullscreen ? 0 : 1, pointerEvents: isFullscreen ? "none" : "auto" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.opacity = "1")
        }
        onMouseLeave={(e) => {
          if (!isFullscreen) e.currentTarget.style.opacity = "1";
          else e.currentTarget.style.opacity = "0";
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-white/70 hover:text-white hover:bg-white/10 gap-2"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Slides
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
            onClick={handleDownloadPDF}
            title="Render the deck as a 16:9 PDF and download directly"
          >
            <FileDown className="h-3.5 w-3.5" />
            Download PDF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
            onClick={() => window.open(src, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Tab
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
        </div>
      </div>

      {/* Slide iframe — fills the entire viewport */}
      <iframe
        ref={iframeRef}
        src={src}
        title="Slide presentation"
        className="flex-1 w-full border-0"
        style={{ marginTop: isFullscreen ? 0 : "45px", height: isFullscreen ? "100%" : "calc(100% - 45px)" }}
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-modals"
      />
    </div>
  );
}
