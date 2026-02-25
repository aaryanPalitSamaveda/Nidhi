/**
 * Formats byte size into human-readable string (e.g. "1.5 MB")
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return 'Unknown';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
