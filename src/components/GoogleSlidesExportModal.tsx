import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

type Phase = "connect" | "auth" | "capturing" | "uploading" | "done" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Path to the slide HTML file, e.g. "/slides/brady-april-2026-hybrid.html" */
  slideSrc: string;
}

export function GoogleSlidesExportModal({ open, onOpenChange, slideSrc }: Props) {
  const [phase, setPhase] = useState<Phase>("connect");
  const [error, setError] = useState("");
  const [slidesUrl, setSlidesUrl] = useState("");
  // Use refs so the message handler closure always sees current values
  const tokenRef = useRef<string>("");
  const pptxDataRef = useRef<{ filename: string; data: string } | null>(null);

  // Reset state each time the modal is opened
  useEffect(() => {
    if (open) {
      setPhase("connect");
      setError("");
      setSlidesUrl("");
      tokenRef.current = "";
      pptxDataRef.current = null;
    }
  }, [open]);

  // Listen for PPTX data posted back from the slide popup window
  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      if (ev.data?.type !== "roomstay-gslides-ready") return;
      const payload = {
        filename: ev.data.filename as string,
        data: ev.data.data as string,
      };
      pptxDataRef.current = payload;
      if (tokenRef.current) {
        await doUpload(payload, tokenRef.current);
      }
      // If token not yet available, doUpload is called from the OAuth callback below
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  async function loadGIS(): Promise<void> {
    if ((window as any).google?.accounts?.oauth2) return;
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Google Sign-In library"));
      document.head.appendChild(s);
    });
  }

  async function handleConnect() {
    if (!GOOGLE_CLIENT_ID) {
      setError(
        "VITE_GOOGLE_CLIENT_ID is not configured. Add it to your .env.local file and restart the dev server. " +
          "See the Google Cloud Console to create an OAuth 2.0 Client ID with the Drive API enabled."
      );
      setPhase("error");
      return;
    }

    setError("");

    // Open the slide popup immediately while we still have a user-gesture context,
    // so the browser doesn't block it. It will run the #gslides capture workflow.
    const popup = window.open(
      `${slideSrc}#gslides`,
      "gslides-export",
      "width=1300,height=760,noopener=0"
    );
    if (!popup) {
      setError(
        "Popup blocked. Please allow popups for this site and try again."
      );
      setPhase("error");
      return;
    }

    setPhase("capturing");

    // Start Google OAuth in parallel with the slide capture
    try {
      await loadGIS();
      const g = (window as any).google;
      const client = g.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: async (resp: any) => {
          if (resp.error) {
            setError("Google sign-in failed: " + (resp.error_description || resp.error));
            setPhase("error");
            return;
          }
          tokenRef.current = resp.access_token;
          // If slide data already arrived, start uploading now
          if (pptxDataRef.current) {
            await doUpload(pptxDataRef.current, resp.access_token);
          }
          // Otherwise the message handler calls doUpload when data arrives
        },
      });
      // prompt: 'select_account' forces the Google account picker to appear
      client.requestAccessToken({ prompt: "select_account" });
      setPhase("auth");
    } catch (err: any) {
      setError(err.message || "Failed to initialise Google Sign-In");
      setPhase("error");
    }
  }

  async function doUpload(
    payload: { filename: string; data: string },
    token: string
  ) {
    setPhase("uploading");
    try {
      const url = await uploadToDrive(payload.data, payload.filename, token);
      setSlidesUrl(url);
      setPhase("done");
      window.open(url, "_blank");
    } catch (err: any) {
      setError(err.message || "Upload to Google Drive failed");
      setPhase("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GoogleSlidesIcon className="h-5 w-5 shrink-0" />
            Export to Google Slides
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {phase === "connect" && (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in with Google to export this deck directly to your Google
                Drive as an editable Google Slides presentation. Text remains
                selectable and editable.
              </p>
              <Button className="w-full gap-2" onClick={handleConnect}>
                <GoogleColorIcon className="h-4 w-4 shrink-0" />
                Sign in with Google
              </Button>
            </>
          )}

          {(phase === "auth" || phase === "capturing") && (
            <div className="space-y-3">
              <StatusRow
                done={!!tokenRef.current}
                active={phase === "auth"}
                label={
                  tokenRef.current
                    ? "Google account connected"
                    : "Waiting for Google sign-in…"
                }
              />
              <StatusRow
                active={phase === "capturing"}
                label="Rendering slides (keep the window open)…"
              />
              <p className="text-xs text-muted-foreground">
                A window opened to render the deck. The sign-in and rendering
                happen in parallel — both need to finish before uploading.
              </p>
            </div>
          )}

          {phase === "uploading" && (
            <div className="space-y-3">
              <StatusRow done label="Slides rendered" />
              <StatusRow done label="Google account connected" />
              <StatusRow active label="Uploading to Google Drive…" />
            </div>
          )}

          {phase === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Presentation created — text is editable in Google Slides.
              </div>
              <Button asChild className="w-full gap-2">
                <a href={slidesUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Google Slides
                </a>
              </Button>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setPhase("connect");
                  setError("");
                }}
              >
                Try again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function StatusRow({
  active = false,
  done = false,
  label,
}: {
  active?: boolean;
  done?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
      ) : active ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
      )}
      <span
        className={
          done
            ? "text-muted-foreground"
            : active
            ? ""
            : "text-muted-foreground/50"
        }
      >
        {label}
      </span>
    </div>
  );
}

function GoogleSlidesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect x="3" y="2" width="14" height="18" rx="2" fill="#FBBC04" />
      <path d="M17 2l4 4h-4V2z" fill="#E8A900" />
      <rect x="6" y="8" width="8" height="1.5" rx="0.5" fill="white" opacity="0.9" />
      <rect x="6" y="11" width="8" height="1.5" rx="0.5" fill="white" opacity="0.9" />
      <rect x="6" y="14" width="5" height="1.5" rx="0.5" fill="white" opacity="0.9" />
    </svg>
  );
}

function GoogleColorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

async function uploadToDrive(
  pptxBase64: string,
  filename: string,
  accessToken: string
): Promise<string> {
  // Decode base64 → Blob
  const raw = atob(pptxBase64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  const pptxBlob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });

  // Ask Google Drive to convert the PPTX → Google Slides on upload
  const metadata = {
    name: filename.replace(/\.pptx$/i, ""),
    mimeType: "application/vnd.google-apps.presentation",
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", pptxBlob);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error?.message || `Google Drive API error ${res.status}`
    );
  }

  const file = await res.json() as { id: string };
  return `https://docs.google.com/presentation/d/${file.id}/edit`;
}
