import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddAICardModal } from "@/components/AddAICardModal";

const AISummaryPage = () => {
  const { accountId, summaryId } = useParams();
  const navigate = useNavigate();
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-semibold">AI Summary</h1>
              </div>
            </div>
            <Button onClick={() => setIsAddCardModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add card
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col items-center justify-center text-center">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-semibold mb-2">AI Summary</h2>
          <p className="text-muted-foreground max-w-md">
            Click "Add card" to create an AI-powered executive summary based on your report data.
          </p>
          {summaryId && (
            <p className="text-sm text-muted-foreground mt-4">
              Summary ID: {summaryId}
            </p>
          )}
        </div>
      </div>

      <AddAICardModal
        open={isAddCardModalOpen}
        onOpenChange={setIsAddCardModalOpen}
      />
    </div>
  );
};

export default AISummaryPage;
