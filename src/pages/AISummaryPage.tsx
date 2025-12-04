import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const AISummaryPage = () => {
  const { accountId, summaryId } = useParams();
  const navigate = useNavigate();

  const handleBack = () => {
    if (accountId) {
      navigate(`/tools/report/${accountId}`);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">AI Summary</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">AI Summary</h2>
          <p className="text-muted-foreground max-w-md">
            This feature is coming soon. AI-powered summaries will help you understand your data at a glance.
          </p>
          {summaryId && (
            <p className="text-sm text-muted-foreground mt-4">
              Summary ID: {summaryId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AISummaryPage;
