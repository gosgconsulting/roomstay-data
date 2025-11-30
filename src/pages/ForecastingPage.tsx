import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Pencil, Check, X, Trash2, TrendingUp, Plus, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import ForecastScenarioModal from "@/components/ForecastScenarioModal";
import ForecastServicesModal from "@/components/ForecastServicesModal";
import { useUser } from "@/lib/auth";

interface ForecastScenario {
  id: string;
  name: string; // used as Hotel Name
  email?: string | null; // Optional field
  average_daily_rate?: number | null;
  direct_bookings_target?: number | null; // "% Direct Revenue"
  rooms?: number | null;
  occupancy_rate?: number | null;
  cost_of_sell: number; // stored as decimal (0-1) percentage
  conversion_rate: number;
  created_at: string;
}

// ADD: service row type for create form
interface ServiceRow {
  id: string;
  name: string; // store as string for controlled inputs; parse to number on submit
  weight: string; // store as string for controlled inputs; parse to number on submit
  commission_rate: string; // percent input
  cost_of_sell: string; // percent input
  // ADD: new service fields
  recurrent_fee: string; // currency input
  percent_cost: string; // percent input
  percent_revenue: string; // percent input
}

interface ForecastingPageProps {
  reportId: string;
  accountId?: string;
}

export const ForecastingPage = ({ reportId, accountId }: ForecastingPageProps) => {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [scenarios, setScenarios] = useState<ForecastScenario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ForecastScenario | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<keyof typeof rowForm | null>(null);
  const [rowForm, setRowForm] = useState({
    name: '',
    average_daily_rate: '',
    direct_bookings_target: '',
    rooms: '',
    occupancy_rate: '',
    cost_of_sell: '',
    conversion_rate: ''
  });
  const [isRowSaving, setIsRowSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '', // Hotel Name
    average_daily_rate: '',
    direct_bookings_target: '', // % Direct Revenue
    rooms: '',
    occupancy_rate: '',
    conversion_rate: ''
  });

  // ADD: services rows for commission and cost-of-sale inputs
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);

  // ADD: services modal state (fixes TS2304 errors)
  const [servicesModalOpen, setServicesModalOpen] = useState(false);
  const [servicesModalForecastId, setServicesModalForecastId] = useState<string | null>(null);

  const addServiceRow = () => {
    setServiceRows(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: '',
        weight: '',
        commission_rate: '',
        cost_of_sell: '',
        // ADD: defaults for new fields
        recurrent_fee: '',
        percent_cost: '',
        percent_revenue: ''
      }
    ]);
  };

  const updateServiceRow = (id: string, field: keyof ServiceRow, value: string) => {
    setServiceRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeServiceRow = (id: string) => {
    setServiceRows(prev => prev.filter(r => r.id !== id));
  };

  useEffect(() => {
    if (reportId) {
      loadScenarios();
    }
  }, [reportId]);

  const loadScenarios = async () => {
    try {
      setIsLoading(true);
      console.log('[testing] Loading forecast scenarios for report:', reportId);
      
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

    // Required numeric fields (removed cost_of_sell and email)
    const requiredFields = [
      'average_daily_rate',
      'direct_bookings_target',
      'rooms',
      'occupancy_rate',
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

    // Compute weighted average cost of sale
    const weights = serviceRows.map(r => parseFloat(r.weight) || 0);
    const costs = serviceRows.map(r => parseFloat(r.cost_of_sell) || 0);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedCostPercent = totalWeight > 0
      ? weights.reduce((sum, w, i) => sum + w * costs[i], 0) / totalWeight
      : 0;
    const aggregatedCostOfSellDecimal = (weightedCostPercent || 0) / 100;

    try {
      setIsSubmitting(true);
      if (!user) throw new Error('No user found');

      const { data, error } = await (supabase as any)
        .from('forecasts')
        .insert({
          report_id: reportId,
          user_id: user.id,
          name: formData.name.trim(),
          email: null,
          average_daily_rate: parseFloat(formData.average_daily_rate),
          direct_bookings_target: parseFloat(formData.direct_bookings_target),
          rooms: parseInt(formData.rooms),
          occupancy_rate: parseFloat(formData.occupancy_rate),
          cost_of_sell: aggregatedCostOfSellDecimal,
          conversion_rate: parseFloat(formData.conversion_rate) / 100,
        })
        .select()
        .single() as { data: ForecastScenario | null; error: any };

      if (error || !data) throw error || new Error('Insert failed');

      // Persist services for this forecast
      if (serviceRows.length > 0) {
        const rowsToInsert = serviceRows.map(r => ({
          forecast_id: data.id,
          user_id: user.id,
          name: r.name.trim(),
          weight: parseFloat(r.weight) || 0,
          commission_rate: parseFloat(r.commission_rate) || 0,
          cost_of_sell: parseFloat(r.cost_of_sell) || 0,
          recurrent_fee: parseFloat((r as any).recurrent_fee) || 0,
          percent_cost: parseFloat((r as any).percent_cost) || 0,
          percent_revenue: parseFloat((r as any).percent_revenue) || 0,
        }));
        const { error: svcError } = await (supabase as any)
          .from('forecast_services')
          .insert(rowsToInsert);
        if (svcError) throw svcError;
      }

      // Reset form and services
      setFormData({
        name: '',
        average_daily_rate: '',
        direct_bookings_target: '',
        rooms: '',
        occupancy_rate: '',
        conversion_rate: ''
      });
      setServiceRows([]);

      await loadScenarios();
      toast({ title: "Success", description: "Forecast scenario created successfully" });
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast({ title: "Error", description: "Failed to create forecast scenario", variant: "destructive" });
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

  const startEditing = (scenario: ForecastScenario, field?: keyof typeof rowForm) => {
    setEditingRowId(scenario.id);
    setEditingField(field ?? null);
    setRowForm({
      name: scenario.name || '',
      average_daily_rate: String(scenario.average_daily_rate ?? ''),
      direct_bookings_target: String(scenario.direct_bookings_target ?? ''),
      rooms: String(scenario.rooms ?? ''),
      occupancy_rate: String(scenario.occupancy_rate ?? ''),
      cost_of_sell: scenario.cost_of_sell != null ? String((scenario.cost_of_sell * 100).toFixed(2)) : '',
      conversion_rate: scenario.conversion_rate != null ? String((scenario.conversion_rate * 100).toFixed(2)) : '',
    });
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRowEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRowEdit();
    }
  };

  const handleRowChange = (field: keyof typeof rowForm, value: string) => {
    setRowForm(prev => ({ ...prev, [field]: value }));
  };

  const cancelRowEdit = () => {
    setEditingRowId(null);
    setEditingField(null);
  };

  const saveRowEdit = async () => {
    if (!editingRowId) return;
    if (!rowForm.name.trim()) {
      toast({ title: "Validation Error", description: "Please enter a hotel name", variant: "destructive" });
      return;
    }
    const requiredFields = ['average_daily_rate','direct_bookings_target','rooms','occupancy_rate','cost_of_sell','conversion_rate'];
    for (const field of requiredFields) {
      if (!rowForm[field as keyof typeof rowForm].trim()) {
        toast({ title: "Validation Error", description: `Please enter ${field.replace(/_/g, ' ')}`, variant: "destructive" });
        return;
      }
    }
    try {
      setIsRowSaving(true);
      const { data, error } = await (supabase as any)
        .from('forecasts')
        .update({
          name: rowForm.name.trim(),
          average_daily_rate: parseFloat(rowForm.average_daily_rate),
          direct_bookings_target: parseFloat(rowForm.direct_bookings_target),
          rooms: parseInt(rowForm.rooms),
          occupancy_rate: parseFloat(rowForm.occupancy_rate),
          cost_of_sell: parseFloat(rowForm.cost_of_sell) / 100,
          conversion_rate: parseFloat(rowForm.conversion_rate) / 100,
        })
        .eq('id', editingRowId)
        .select()
        .single() as { data: ForecastScenario | null; error: any };
      if (error) throw error;
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
                <Label htmlFor="rooms">Rooms</Label>
                <Input
                  id="rooms"
                  type="number"
                  min="1"
                  placeholder="153"
                  value={formData.rooms}
                  onChange={(e) => handleInputChange('rooms', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="occupancy-rate">% Occupancy Rate</Label>
                <Input
                  id="occupancy-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="75.00"
                  value={formData.occupancy_rate}
                  onChange={(e) => handleInputChange('occupancy_rate', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="average-daily-rate">Average Daily Rate ($)</Label>
                <Input
                  id="average-daily-rate"
                  type="number"
                  step="0.01"
                  placeholder="184.26"
                  value={formData.average_daily_rate}
                  onChange={(e) => handleInputChange('average_daily_rate', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="direct-revenue-target">% Direct Revenue</Label>
                <Input
                  id="direct-revenue-target"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="15.00"
                  value={formData.direct_bookings_target}
                  onChange={(e) => handleInputChange('direct_bookings_target', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="conversion-rate">% Conversion Rate</Label>
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

              {/* REMOVED: % Commission Rate, % Cost of Sale, Email Address inputs from create form */}
            </div>

            {/* NEW: Services section */}
            <div className="space-y-3">
              <Separator />
              <div className="flex items-center justify-between">
                <Label className="text-base">Services</Label>
                <Button type="button" variant="secondary" size="sm" onClick={addServiceRow} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Service
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service Name</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>% Commission</TableHead>
                      <TableHead>% Cost of Sale</TableHead>
                      {/* ADD: new headers */}
                      <TableHead>Recurrent fee</TableHead>
                      <TableHead>% Cost</TableHead>
                      <TableHead>% Revenue</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceRows.length === 0 ? (
                      <TableRow>
                        {/* UPDATE: adjust colSpan for new columns */}
                        <TableCell colSpan={8} className="text-muted-foreground">
                          No services added yet. Click "Add Service" to start.
                        </TableCell>
                      </TableRow>
                    ) : (
                      serviceRows.map(row => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Input
                              className="h-8"
                              placeholder="e.g., Metasearch, PPC"
                              value={row.name}
                              onChange={(e) => updateServiceRow(row.id, 'name', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="e.g., 1"
                              value={row.weight}
                              onChange={(e) => updateServiceRow(row.id, 'weight', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder="e.g., 15"
                              value={row.commission_rate}
                              onChange={(e) => updateServiceRow(row.id, 'commission_rate', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder="e.g., 12.5"
                              value={row.cost_of_sell}
                              onChange={(e) => updateServiceRow(row.id, 'cost_of_sell', e.target.value)}
                            />
                          </TableCell>
                          {/* ADD: new inputs per row */}
                          <TableCell>
                            <Input
                              className="h-8"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="e.g., 500"
                              value={row.recurrent_fee}
                              onChange={(e) => updateServiceRow(row.id, 'recurrent_fee', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder="e.g., 10"
                              value={row.percent_cost}
                              onChange={(e) => updateServiceRow(row.id, 'percent_cost', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder="e.g., 8"
                              value={row.percent_revenue}
                              onChange={(e) => updateServiceRow(row.id, 'percent_revenue', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => removeServiceRow(row.id)}
                              title="Remove service"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
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
                    <TableHead>Rooms</TableHead>
                    <TableHead>% Occupancy Rate</TableHead>
                    <TableHead>Average Daily Rate</TableHead>
                    <TableHead>% Direct Revenue</TableHead>
                    <TableHead>% Conversion Rate</TableHead>
                    <TableHead>% Cost of Sale</TableHead>
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
                            autoFocus={editingField === 'name'}
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <span
                            className="cursor-text"
                            onClick={() => startEditing(scenario, 'name')}
                          >
                            {scenario.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            min="1"
                            value={rowForm.rooms}
                            onChange={(e) => handleRowChange('rooms', e.target.value)}
                            autoFocus={editingField === 'rooms'}
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <span
                            className="cursor-text"
                            onClick={() => startEditing(scenario, 'rooms')}
                          >
                            {scenario.rooms || 0}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={rowForm.occupancy_rate}
                            onChange={(e) => handleRowChange('occupancy_rate', e.target.value)}
                            autoFocus={editingField === 'occupancy_rate'}
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <span
                            className="cursor-text"
                            onClick={() => startEditing(scenario, 'occupancy_rate')}
                          >
                            {`${scenario.occupancy_rate || 0}%`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            value={rowForm.average_daily_rate}
                            onChange={(e) => handleRowChange('average_daily_rate', e.target.value)}
                            autoFocus={editingField === 'average_daily_rate'}
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <span
                            className="cursor-text"
                            onClick={() => startEditing(scenario, 'average_daily_rate')}
                          >
                            {formatCurrency(scenario.average_daily_rate || 0)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingRowId === scenario.id ? (
                          <Input
                            className="h-8"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={rowForm.direct_bookings_target}
                            onChange={(e) => handleRowChange('direct_bookings_target', e.target.value)}
                            autoFocus={editingField === 'direct_bookings_target'}
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <span
                            className="cursor-text"
                            onClick={() => startEditing(scenario, 'direct_bookings_target')}
                          >
                            {`${scenario.direct_bookings_target || 0}%`}
                          </span>
                        )}
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
                            autoFocus={editingField === 'conversion_rate'}
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <span
                            className="cursor-text"
                            onClick={() => startEditing(scenario, 'conversion_rate')}
                          >
                            {formatPercentage(scenario.conversion_rate)}
                          </span>
                        )}
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
                            autoFocus={editingField === 'cost_of_sell'}
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <span
                            className="cursor-text"
                            onClick={() => startEditing(scenario, 'cost_of_sell')}
                          >
                            {formatPercentage(scenario.cost_of_sell)}
                          </span>
                        )}
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
                              onClick={() => { setServicesModalForecastId(scenario.id); setServicesModalOpen(true); }}
                              className="h-8 w-8 p-0"
                              title="View services"
                            >
                              <Settings className="h-4 w-4" />
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

      <ForecastServicesModal
        open={servicesModalOpen}
        onOpenChange={(open) => { setServicesModalOpen(open); if (!open) setServicesModalForecastId(null); }}
        forecastId={servicesModalForecastId}
      />
    </div>
  );
};