import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { runSystemHealthCheck, type SystemHealthReport } from '@/lib/report-health-check';

interface SystemHealthMonitorProps {
  reportId?: string;
  onIssueDetected?: (issues: string[]) => void;
}

export function SystemHealthMonitor({ reportId, onIssueDetected }: SystemHealthMonitorProps) {
  const [healthReport, setHealthReport] = useState<SystemHealthReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const runHealthCheck = async () => {
    setIsChecking(true);
    try {
      const report = await runSystemHealthCheck();
      setHealthReport(report);
      setLastCheck(new Date());
      
      // Notify parent of issues
      if (onIssueDetected) {
        const allIssues = [
          ...report.systemIssues,
          ...report.reportStatuses.flatMap(r => r.issues)
        ];
        if (allIssues.length > 0) {
          onIssueDetected(allIssues);
        }
      }
    } catch (error) {
      console.error('[HEALTH-MONITOR] Health check failed:', error);
    } finally {
      setIsChecking(false);
    }
  };

  // Run health check on mount and periodically
  useEffect(() => {
    runHealthCheck();
    
    // Run health check every 5 minutes
    const interval = setInterval(runHealthCheck, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Run health check when reportId changes
  useEffect(() => {
    if (reportId && lastCheck) {
      runHealthCheck();
    }
  }, [reportId]);

  if (!healthReport) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Only show if there are issues or if explicitly monitoring a specific report
  const hasIssues = healthReport.overallStatus !== 'healthy' || 
                   healthReport.systemIssues.length > 0 ||
                   healthReport.reportStatuses.some(r => r.status !== 'healthy');

  if (!hasIssues && !reportId) {
    return null;
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(healthReport.overallStatus)}
            <CardTitle className="text-sm">System Health</CardTitle>
            <Badge className={getStatusColor(healthReport.overallStatus)}>
              {healthReport.overallStatus}
            </Badge>
          </div>
          <Button
            onClick={runHealthCheck}
            disabled={isChecking}
            size="sm"
            variant="ghost"
          >
            <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription className="text-xs">
          Last checked: {lastCheck?.toLocaleTimeString() || 'Never'}
        </CardDescription>
      </CardHeader>

      {hasIssues && (
        <CardContent className="pt-0">
          {/* System Issues */}
          {healthReport.systemIssues.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-medium text-red-700 mb-2">System Issues</h4>
              <ul className="text-xs space-y-1">
                {healthReport.systemIssues.map((issue, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-red-700">{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Report Issues */}
          {healthReport.reportStatuses.filter(r => r.status !== 'healthy').length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-yellow-700 mb-2">Report Issues</h4>
              <div className="space-y-2">
                {healthReport.reportStatuses
                  .filter(r => r.status !== 'healthy')
                  .slice(0, 3) // Show only first 3 problematic reports
                  .map((report) => (
                    <div key={report.reportId} className="text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(report.status)}
                        <span className="font-medium">{report.reportName}</span>
                        <Badge className={`text-xs ${getStatusColor(report.status)}`}>
                          {report.status}
                        </Badge>
                      </div>
                      {report.issues.length > 0 && (
                        <ul className="ml-6 space-y-1">
                          {report.issues.slice(0, 2).map((issue, index) => (
                            <li key={index} className="text-muted-foreground">
                              • {issue}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}