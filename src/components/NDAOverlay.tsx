import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { FileText, CheckCircle2, XCircle, Download } from 'lucide-react';

interface NDAOverlayProps {
  vaultId: string;
  roleType: 'seller' | 'investor';
  onAgree: (signatureName: string, signatureCompany: string) => void;
  onDecline: () => void;
}

export default function NDAOverlay({ vaultId, roleType, onAgree, onDecline }: NDAOverlayProps) {
  const { toast } = useToast();
  const [ndaTemplate, setNdaTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signatureName, setSignatureName] = useState('');
  const [signatureCompany, setSignatureCompany] = useState('');
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);

  const fetchNDATemplate = useCallback(async () => {
    try {
      // Fetch template
      const { data: templateData, error: templateError } = await supabase
        .from('nda_templates')
        .select('*')
        .eq('vault_id', vaultId)
        .eq('role_type', roleType)
        .single();

      if (templateError && templateError.code !== 'PGRST116') {
        throw templateError;
      }

      setNdaTemplate(templateData);

      // Get signed URL immediately if we have file_path (with longer expiry for better caching)
      if (templateData?.file_path) {
        const { data: urlData, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(templateData.file_path, 7200); // 2 hours expiry for better caching

        if (urlError) {
          console.error('Error creating signed URL:', urlError);
          toast({
            title: 'Error',
            description: 'Failed to load NDA document. Please contact administrator.',
            variant: 'destructive',
          });
        } else if (urlData) {
          setViewUrl(urlData.signedUrl);
        }
      }
      
      setIsLoadingDocument(false);
    } catch (error: any) {
      console.error('Error fetching NDA template:', error);
      toast({
        title: 'Error',
        description: 'Failed to load NDA template',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [vaultId, roleType, toast]);

  useEffect(() => {
    fetchNDATemplate();
  }, [fetchNDATemplate]);

  const handleAgree = useCallback(() => {
    if (!ndaTemplate) return;
    setIsSignatureDialogOpen(true);
  }, [ndaTemplate]);

  const handleSubmitSignature = useCallback(() => {
    if (!signatureName.trim() || !signatureCompany.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both name and company name',
        variant: 'destructive',
      });
      return;
    }
    
    // Submit signature directly - preview is already shown in the form
    onAgree(signatureName.trim(), signatureCompany.trim());
    setIsSignatureDialogOpen(false);
  }, [signatureName, signatureCompany, onAgree, toast]);

  const isPdf = useMemo(() => ndaTemplate?.file_type?.includes('pdf'), [ndaTemplate]);
  const isWord = useMemo(() => 
    ndaTemplate?.file_type?.includes('word') || 
    ndaTemplate?.file_name?.endsWith('.docx') || 
    ndaTemplate?.file_name?.endsWith('.doc'),
    [ndaTemplate]
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="surface-elevated border border-gold/20 rounded-xl p-8 max-w-md w-full mx-4">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">Loading NDA...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!ndaTemplate) {
    return null; // No NDA template, allow access
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="surface-elevated border border-gold/20 rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-gold" />
              <h2 className="font-display text-2xl text-foreground">Non-Disclosure Agreement</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto mb-6 bg-muted/30 rounded-lg p-4 border border-gold/10">
            <p className="text-sm text-muted-foreground mb-4">
              Please review the NDA document below. Fill in your name and company, then preview before signing.
            </p>
            
            {/* Document Viewer - Display exactly as uploaded */}
            {isLoadingDocument ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-muted-foreground">Loading document...</span>
              </div>
            ) : viewUrl ? (
              <div className="space-y-4">
                {/* Show document in iframe to preserve all formatting, images, fonts, graphs */}
                <div className="w-full h-[600px] border border-gold/20 rounded-lg overflow-hidden bg-white shadow-lg">
                  {ndaTemplate?.file_type?.toLowerCase().includes('pdf') || ndaTemplate?.file_name?.toLowerCase().endsWith('.pdf') ? (
                    // PDF: Use direct iframe
                    <iframe
                      src={viewUrl}
                      className="w-full h-full"
                      title="NDA Document"
                    />
                  ) : ndaTemplate?.file_type?.toLowerCase().includes('word') || ndaTemplate?.file_name?.toLowerCase().includes('.doc') ? (
                    // Word: Use Google Docs Viewer (works with signed URLs)
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(viewUrl)}&embedded=true`}
                      className="w-full h-full"
                      title="NDA Document"
                      frameBorder="0"
                    />
                  ) : (
                    // Fallback: Try direct iframe
                    <iframe
                      src={viewUrl}
                      className="w-full h-full"
                      title="NDA Document"
                    />
                  )}
                </div>
                
                {/* Download option */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(viewUrl, '_blank')}
                    className="flex-1"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Open in New Tab
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = viewUrl;
                      link.download = ndaTemplate?.file_name || 'nda.docx';
                      link.click();
                    }}
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download NDA
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 border border-gold/20 rounded-lg bg-muted/20">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Document is loading...</p>
                {ndaTemplate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    File: {ndaTemplate.file_name || 'Unknown'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-4 justify-end border-t border-gold/10 pt-4">
            <Button
              variant="outline"
              onClick={onDecline}
              className="gap-2"
            >
              <XCircle className="w-4 h-4" />
              Disagree
            </Button>
            <Button
              variant="gold"
              onClick={handleAgree}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Agree
            </Button>
          </div>
        </div>
      </div>

      {/* Signature Dialog */}
      <Dialog open={isSignatureDialogOpen} onOpenChange={setIsSignatureDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sign NDA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="signatureName">Name (Signature) *</Label>
              <Input
                id="signatureName"
                placeholder="Your full name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                className="bg-input border-gold/20"
                style={{ fontFamily: "'Kalam', 'Comic Sans MS', cursive", fontSize: '18px' }}
              />
              <p className="text-xs text-muted-foreground">This will appear in handwriting font (Kalam)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signatureCompany">Company Name *</Label>
              <Input
                id="signatureCompany"
                placeholder="Your company name"
                value={signatureCompany}
                onChange={(e) => setSignatureCompany(e.target.value)}
                className="bg-input border-gold/20"
              />
              <p className="text-xs text-muted-foreground">This will appear in normal font</p>
            </div>
            
            {signatureName.trim() && signatureCompany.trim() && (
              <div className="pt-2">
                <div className="p-4 bg-muted/30 rounded-lg border border-gold/20">
                  <p className="text-sm font-semibold mb-2">Signature Preview:</p>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-muted-foreground">Name:</span>
                      <p className="text-lg" style={{ fontFamily: "'Kalam', 'Comic Sans MS', cursive", color: '#d4af37' }}>
                        {signatureName.trim()}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Company:</span>
                      <p className="text-base">{signatureCompany.trim()}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Date:</span>
                      <p className="text-sm text-muted-foreground">
                        {new Date().toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsSignatureDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              onClick={handleSubmitSignature}
              disabled={!signatureName.trim() || !signatureCompany.trim()}
            >
              Sign & Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}

