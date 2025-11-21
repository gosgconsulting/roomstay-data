import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  reportId?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
  retryCount: number;
}

export class PerformanceTableErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ERROR-BOUNDARY] Performance table error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Log error details for debugging
    console.group('🚨 PERFORMANCE TABLE ERROR DETAILS');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Report ID:', this.props.reportId);
    console.groupEnd();
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state when reportId changes
    if (prevProps.reportId !== this.props.reportId && this.state.hasError) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: 0,
      });
    }
  }

  handleRetry = () => {
    console.log('[ERROR-BOUNDARY] Retrying performance table load...');
    
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));

    // Call parent retry function if provided
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  handleReload = () => {
    console.log('[ERROR-BOUNDARY] Reloading page...');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      const canRetry = retryCount < 3;

      return (
        <Card className="w-full max-w-2xl mx-auto mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Performance Table Error
            </CardTitle>
            <CardDescription>
              Something went wrong while loading the performance table. This could be due to:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Network connectivity issues</li>
              <li>Data source configuration problems</li>
              <li>Dimension mapping conflicts</li>
              <li>Large dataset processing timeouts</li>
            </ul>

            {error && (
              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm font-medium text-destructive mb-1">Error Details:</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {error.message}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {canRetry && (
                <Button onClick={this.handleRetry} variant="default" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again {retryCount > 0 && `(${retryCount}/3)`}
                </Button>
              )}
              
              <Button onClick={this.handleReload} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </Button>
              
              <Button 
                onClick={() => {
                  const errorDetails = {
                    message: error?.message,
                    stack: error?.stack,
                    reportId: this.props.reportId,
                    timestamp: new Date().toISOString(),
                  };
                  console.log('[ERROR-BOUNDARY] Error report:', errorDetails);
                  navigator.clipboard?.writeText(JSON.stringify(errorDetails, null, 2));
                }}
                variant="ghost" 
                size="sm"
                className="gap-2"
              >
                <Bug className="h-4 w-4" />
                Copy Error Details
              </Button>
            </div>

            {!canRetry && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Multiple retry attempts failed.</strong> Please try reloading the page or contact support if the issue persists.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}