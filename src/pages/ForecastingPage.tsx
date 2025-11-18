import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, TrendingUp, Eye, Pencil, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import ForecastScenarioModal from "@/components/ForecastScenarioModal";

interface ForecastScenario {
  id: string;
  name: string; // used as Hotel Name
  email?: string;
  revenue_per_month: number;
  paid_revenue_share: number;
  cost_of_sell: number; // stored as decimal (0-1) percentage
  target_average_order_value: number;
  conversion_rate: number;
  created_at: string;
}

interface ForecastingPageProps {
  reportId: string;
  accountId?: string;
}

export const ForecastingPage = ({ reportId, accountId }: ForecastingPageProps) => {
  const [scenarios, setScenarios] = useState<ForecastScenario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ForecastScenario | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowForm, setRowForm] = useState({
    name: '',
    email: '',
    revenue_per_month: '',
    paid_revenue_share: '',
    cost_of_sell: '', // percentage
    target_average_order_value: '',
    conversion_rate: '' // percentage
  });
  const [isRowSaving, setIsRowSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '', // Hotel Name
    email: '',
    revenue_per_month: '',
    paid_revenue_share: '',
    cost_of_sell: '', // percentage input
    target_average_order_value: '',
    conversion_rate: ''
  });

  useEffect(() => {
    if (reportId) {
      loadScenarios();
    }
  }, [reportId]);

  const loadScenarios = async () => {
    try {
      setIsLoading(true);
      console.log('[testing] Loading forecast scenarios for report:', reportId);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No user found');
        return;
      }

      const { data, error } = await (supabase as any)
        .from('forecasts')
        .select('*')
        .eq('report_id', reportId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }) as { data: ForecastScenario[] | null; error: any };

      if (error) {
        console.error('Error loading scenarios:', error);
        toast({
          title: "Error",
          description: "Failed to load forecast scenarios",
          variant: "destructive",
        });
        return;
      }

      console.log('[testing] Loaded scenarios:', data?.length || 0);
      setScenarios(data || []);
    } catch (error) {
      console.error('Error in loadScenarios:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a hotel name",
        variant: "destructive",
      });
      return;
    }
    if (!formData.email.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    const requiredFields = [
      'revenue_per_month',
      'paid_revenue_share', 
      'cost_of_sell',
      'target_average_order_value',
      'conversion_rate'
    ];

    for (const field of requiredFields) {
      if (!formData[field as keyof typeof formData].trim()) {
        toast({
          title: "Validation Error",
          description: `Please enter ${field.replace(/_/g, ' ')}`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);
      console.log('[testing] Submitting forecast scenario:', formData);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No user found');
      }

      const { data, error } = await (supabase as any)
        .from('forecasts')
        .insert({
          report_id: reportId,
          user_id: user.id,
          name: formData.name.trim(), // Hotel Name
          email: formData.email.trim(),
          revenue_per_month: parseFloat(formData.revenue_per_month),
          paid_revenue_share: parseFloat(formData.paid_revenue_share),
          cost_of_sell: parseFloat(formData.cost_of_sell) / 100, // percentage to decimal
          target_average_order_value: parseFloat(formData.target_average_order_value),
          conversion_rate: parseFloat(formData.conversion_rate) / 100, // Convert percentage to decimal
        })
        .select()
        .single() as { data: ForecastScenario | null; error: any };

      if (error) {
        console.error('Error creating scenario:', error);
        throw error;
      }

      console.log('[testing] Created scenario:', data);
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        revenue_per_month: '',
        paid_revenue_share: '',
        cost_of_sell: '',
        target_average_order_value: '',
        conversion_rate: ''
      });

      // Reload scenarios
      await loadScenarios();

      toast({
        title: "Success",
        description: "Forecast scenario created successfully",
      });

    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast({
        title: "Error",
        description: "Failed to create forecast scenario",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (scenarioId: string) => {
    try {
      console.log('[testing] Deleting scenario:', scenarioId);

      const { error } = await (supabase as any)
        .from('forecasts')
        .delete()
        .eq('id', scenarioId) as { error: any };

      if (error) {
        console.error('Error deleting scenario:', error);
        throw error;
      }

      // Remove from local state
      setScenarios(prev => prev.filter(s => s.id !== scenarioId));

      toast({
        title: "Success",
        description: "Forecast scenario deleted successfully",
      });

    } catch (error) {
      console.error('Error in handleDelete:', error);
      toast({
        title: "Error",
        description: "Failed to delete forecast scenario",
        variant: "destructive",
      });
    }
  };

  const startEditing = (scenario: ForecastScenario) => {
    setEditingRowId(scenario.id);
    setRowForm({
      name: scenario.name || '',
      email: scenario.email || '',
      revenue_per_month: String(scenario.revenue_per_month ?? ''),
      paid_revenue_share: String(scenario.paid_revenue_share ?? ''),
      cost_of_sell: scenario.cost_of_sell != null ? String((scenario.cost_of_sell * 100).toFixed(2)) : '',
      target_average_order_value: String(scenario.target_average_order_value ?? ''),
      conversion_rate: scenario.conversion_rate != null ? String((scenario.conversion_rate * 100).toFixed(2)) : '',
    });
  };

  const handleRowChange = (field: keyof typeof rowForm, value: string) => {
    setRowForm(prev => ({ ...prev, [field]: value }));
  };

  const cancelRowEdit = () => {
    setEditingRowId(null);
  };

  const saveRowEdit = async () => {
    if (!editingRowId) return;

    // Validate required fields
    if (!rowForm.name.trim()) {
      toast({ title: "Validation Error", description: "Please enter a hotel name", variant: "destructive" });
      return;
    }
    if (!rowForm.email.trim()) {
      toast({ title: "Validation Error", description: "Please enter an email address", variant: "destructive" });
      return;
    }
    const requiredFields = [
      'revenue_per_month',
      'paid_revenue_share',
      'cost_of_sell',
      'target_average_order_value',
      'conversion_rate'
    ];
    for (const field of requiredFields) {
      if (!rowForm[field as keyof typeof rowForm].trim()) {
        toast({
          title: "Validation Error",
          description: `Please enter ${field.replace(/_/g, ' ')}`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      setIsRowSaving(true);
      const { data, error } = await (supabase as any)
        .from('forecasts')
        .update({
          name: rowForm.name.trim(),
          email: rowForm.email.trim(),
          revenue_per_month: parseFloat(rowForm.revenue_per_month),
          paid_revenue_share: parseFloat(rowForm.paid_revenue_share),
          cost_of_sell: parseFloat(rowForm.cost_of_sell) / 100, // percentage to decimal
          target_average_order_value: parseFloat(rowForm.target_average_order_value),
          conversion_rate: parseFloat(rowForm.conversion_rate) / 100, // percentage to decimal
        })
        .eq('id', editingRowId)
        .select()
        .single() as { data: ForecastScenario | null; error: any };

      if (error) {
        console.error('Error updating scenario:', error);
        throw error;
      }

      // Update local state
      setScenarios(prev => prev.map(s => s.id === editingRowId ? (data as ForecastScenario) : s));

      toast({ title: "Saved", description: "Forecast scenario updated successfully" });
      setEditingRowId(null);
    } catch (err) {
      console.error('Error in saveRowEdit:', err);
      toast({ title: "Error", description: "Failed to update forecast scenario", variant: "destructive" });
    } finally {
      setIsRowSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Forecast Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Create Forecast Scenario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="scenario-name">Hotel Name</Label>
                <Input
                  id="scenario-name"
                  placeholder="e.g., Grand Plaza Hotel"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="revenue-per-month">Revenue per Month ($)</Label>
                <Input
                  id="revenue-per-month"
                  type="number"
                  step="0.01"
                  placeholder="50000"
                  value={formData.revenue_per_month}
                  onChange={(e) => handleInputChange('revenue_per_month', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="paid-revenue-share">Paid Revenue Share (%)</Label>
                <Input
                  id="paid-revenue-share"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="15"
                  value={formData.paid_revenue_share}
                  onChange={(e) => handleInputChange('paid_revenue_share', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cost-of-sell">Cost of Sell (%)</Label>
                <Input
                  id="cost-of-sell"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="12.5"
                  value={formData.cost_of_sell}
                  onChange={(e) => handleInputChange('cost_of_sell', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="target-aov">Target Average Order Value ($)</Label>
                <Input
                  id="target-aov"
                  type="number"
                  step="0.01"
                  placeholder="250"
                  value={formData.target_average_order_value}
                  onChange={(e) => handleInputChange('target_average_order_value', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="conversion-rate">Conversion Rate (%)</Label>
                <Input
                  id="conversion-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="2.5"
                  value={formData.conversion_rate}
                  onChange={(e) => handleInputChange('conversion_rate', e.target.value)}
                  required
                />
              </div>
            </div>
            
            <Separator />
            
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {isSubmitting ? 'Adding...' : 'Add Forecast Scenario'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Forecast Table */}
      <Card>
        <CardHeader>
          <CardTitle>Forecast Scenarios</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {/* Table header skeleton */}
              <div className="overflow-x-auto">
                <div className="flex gap-4 border-b pb-3">
                  <Skeleton className="h-6 w-32" />
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-6 w-24" />
                  ))}
                </div>
              </div>
              {/* Table rows skeleton */}
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-5 w-40" />
                    {[...Array(6)].map((_, j) => (
                      <Skeleton key={j} className="h-5 w-24" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : scenarios.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No forecast scenarios created yet. Use the form above to create your first scenario.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hotel Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Revenue/Month</TableHead>
                    <TableHead>Revenue Share</TableHead>
                    <TableHead>Cost of Sell</TableHead>
                    <TableHead>Target AOV</TableHead>
                    <TableHead>Conversion Rate</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenarios.map((scenario) => (
                    <TableRow key={scenario.id}>
                      <TableCell className="font-medium">
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            value={rowForm.name}
                            onChange={(e) => handleRowChange('name', e.target.value)}
                          />
                        ) : scenario.name}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="email"
                            value={rowForm.email}
                            onChange={(e) => handleRowChange('email', e.target.value)}
                          />
                        ) : (scenario.email || '-')}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            value={rowForm.revenue_per_month}
                            onChange={(e) => handleRowChange('revenue_per_month', e.target.value)}
                          />
                        ) : formatCurrency(scenario.revenue_per_month)}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={rowForm.paid_revenue_share}
                            onChange={(e) => handleRowChange('paid_revenue_share', e.target.value)}
                          />
                        ) : `${scenario.paid_revenue_share}%`}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={rowForm.cost_of_sell}
                            onChange={(e) => handleRowChange('cost_of_sell', e.target.value)}
                          />
                        ) : formatPercentage(scenario.cost_of_sell)}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            value={rowForm.target_average_order_value}
                            onChange={(e) => handleRowChange('target_average_order_value', e.target.value)}
                          />
                        ) : formatCurrency(scenario.target_average_order_value)}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={rowForm.conversion_rate}
                            onChange={(e) => handleRowChange('conversion_rate', e.target.value)}
                          />
                        ) : formatPercentage(scenario.conversion_rate)}
                      </TableCell>
                      <TableCell>{formatDate(scenario.created_at)}</TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={saveRowEdit}
                              disabled={isRowSaving}
                              className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700"
                              title="Save"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelRowEdit}
                              className="h-8 w-8 p-0"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(scenario)}
                              className="h-8 w-8 p-0"
                              title="Edit scenario"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(scenario.id)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Delete scenario"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedScenario(scenario); setViewOpen(true); }}
                              className="h-8 w-8 p-0"
                              title="View scenario"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View scenario modal */}
      <ForecastScenarioModal
        open={viewOpen}
        onOpenChange={(open) => { setViewOpen(open); if (!open) setSelectedScenario(null); }}
        scenario={selectedScenario}
      />
    </div>
  );
};