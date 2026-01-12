import { X, CheckCircle2, AlertCircle, Upload } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FileUploadProgress {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

interface FileUploadProgressProps {
  uploads: FileUploadProgress[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function FileUploadProgress({ uploads, onRemove, onRetry }: FileUploadProgressProps) {
  if (uploads.length === 0) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="space-y-3 p-4 bg-card border border-gold/20 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Uploading {uploads.length} file{uploads.length > 1 ? 's' : ''}
        </h3>
        <div className="text-sm text-muted-foreground">
          {uploads.filter(u => u.status === 'success').length} / {uploads.length} complete
        </div>
      </div>
      
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className={cn(
              "p-3 rounded-lg border transition-all",
              upload.status === 'error' && "border-destructive/50 bg-destructive/5",
              upload.status === 'success' && "border-green-500/50 bg-green-500/5",
              upload.status === 'uploading' && "border-gold/30 bg-muted/30"
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                    upload.status === 'success' && "bg-green-500",
                    upload.status === 'error' && "bg-destructive",
                    upload.status === 'uploading' && "bg-gold"
                  )}>
                    {upload.status === 'success' && (
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    )}
                    {upload.status === 'error' && (
                      <AlertCircle className="w-3 h-3 text-white" />
                    )}
                    {upload.status === 'uploading' && (
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    )}
                  </div>
                  <p className="font-medium text-sm text-foreground truncate">
                    {upload.file.name}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground ml-7">
                  {formatFileSize(upload.file.size)}
                </p>
              </div>
              
              {(upload.status === 'error' || upload.status === 'success') && onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => onRemove(upload.id)}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>

            {upload.status === 'uploading' && (
              <div className="mt-2 space-y-1">
                <Progress value={upload.progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">
                  {upload.progress.toFixed(0)}%
                </p>
              </div>
            )}

            {upload.status === 'error' && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-destructive">{upload.error || 'Upload failed'}</p>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => onRetry(upload.id)}
                  >
                    Retry Upload
                  </Button>
                )}
              </div>
            )}

            {upload.status === 'success' && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2 ml-7">
                Upload complete
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
