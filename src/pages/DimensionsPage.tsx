import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Layers } from "lucide-react";
import { useUser } from "@/lib/auth";
import type { Dimension } from "@/types/dimensions";
import { useUserAccount } from "@/hooks/useUserAccount";

const typeLabels: Record<string, string> = {
  text: "Plain text",
  date: "Date",
  number: "Number",
  currency: "Currency",
  percentage: "Percentage",
};

export default function DimensionsPage() {
  const { accountId: urlAccountId } = useParams<{ accountId?: string }>();
  const { account: resolvedAccount } = useUserAccount();
  const accountId = urlAccountId ?? resolvedAccount?.id ?? null;
  const navigate = useNavigate();
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [textDimensions, setTextDimensions] = useState<Dimension[]>([]);
  const [valueDimensions, setValueDimensions] = useState<Dimension[]>([]);
  const [allDimensions, setAllDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (accountId && user) {
      loadDimensions();
    }
  }, [accountId, user]);

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      if (!user) throw new Error("User not authenticated");
      if (!accountId) return;

      console.log('[testing] Loading dimensions for account:', accountId);

      // Load account-specific dimensions first (highest priority)
      let accountData: Dimension[] = [];
      const { data, error: accountError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "account")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (accountError) throw accountError;
      accountData = ((data || []) as any[]).map(d => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions : []
      })) as Dimension[];

      // Load custom dimensions for this user
      let customData: Dimension[] = [];
      const { data: customDataResult, error: customError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .eq("scope", "custom")
        .order("created_at", { ascending: false });

      if (customError) throw customError;
      customData = ((customDataResult || []) as any[]).map(d => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions : []
      })) as Dimension[];

      // Load global dimensions (lowest priority, fallback)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Combine all dimensions with proper priority: account > custom > global
      const allDimensions = [
        ...accountData,
        ...customData,
        ...(globalData || [])
      ] as Dimension[];

      // Deduplicate by name, keeping highest priority (first occurrence)
      const seenNames = new Set<string>();
      const uniqueDimensions = allDimensions.filter(dim => {
        if (seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });

      console.log('[testing] Loaded dimensions - Account:', accountData?.length || 0, 'Custom:', customData?.length || 0, 'Global:', globalData?.length || 0, 'Unique:', uniqueDimensions.length);

      // Separate into text and value dimensions
      const textDims = uniqueDimensions.filter(d => d.type === 'text');
      const valueDims = uniqueDimensions.filter(d => ['number', 'currency', 'percentage', 'date'].includes(d.type));

      setTextDimensions(textDims);
      setValueDimensions(valueDims);
      setAllDimensions(uniqueDimensions);
    } catch (error) {
      console.error("Error loading dimensions:", error);
      toast({
        title: "Error",
        description: "Failed to load dimensions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const DimensionTable = ({ dimensions }: { dimensions: Dimension[] }) => (
    dimensions.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground">
        No dimensions in this category yet.
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Formula</TableHead>
            <TableHead>Scope</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dimensions.map((dimension) => (
            <TableRow key={dimension.id}>
              <TableCell className="font-medium">
                {dimension.name}
              </TableCell>
              <TableCell>{typeLabels[dimension.type] || dimension.type}</TableCell>
              <TableCell className="text-muted-foreground">
                {dimension.formula || "-"}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                  {dimension.scope || 'custom'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Dimensions</h1>
            <p className="text-muted-foreground mt-1">
              View and manage text and value dimensions
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Dimensions</CardTitle>
                <CardDescription>
                  {allDimensions.length} dimension{allDimensions.length !== 1 ? 's' : ''} found
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading dimensions...</p>
              </div>
            ) : (
              <Tabs defaultValue="text" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text">
                    Text ({textDimensions.length})
                  </TabsTrigger>
                  <TabsTrigger value="values">
                    Values ({valueDimensions.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="mt-4">
                  <DimensionTable dimensions={textDimensions} />
                </TabsContent>

                <TabsContent value="values" className="mt-4">
                  <DimensionTable dimensions={valueDimensions} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
