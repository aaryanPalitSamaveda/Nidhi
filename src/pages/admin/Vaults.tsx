import { CIMGenerationPanel } from '../../components/CIMGenerationPanel';
import { FraudAnalysisPanel } from '../../components/FraudAnalysisPanel';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus,
  Search,
  FolderLock,
  ArrowUpRight,
  Trash2,
  MoreVertical,
  Users,
  Shield,
  Store,
  TrendingUp,
  Edit2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface VaultUser {
  id: string;
  email: string;
  full_name: string | null;
  isAdmin?: boolean;
  role?: 'admin' | 'seller' | 'investor';
  ndaStatus?: 'signed' | 'unsigned' | 'not_required';
}

interface Vault {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  created_by: string;
  created_at: string;
  client?: { email: string; full_name: string | null } | null;
  users?: VaultUser[];
}

interface ClientOption {
  id: string;
  email: string;
  full_name: string | null;
}

export default function AdminVaults() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newVault, setNewVault] = useState({ name: '', description: '', clientId: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [renamingVault, setRenamingVault] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    fetchVaults();
    fetchClients();
  }, []);

  const fetchVaults = async () => {
    try {
      const { data, error } = await supabase
        .from('vaults')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch client info and all users with access for each vault
      const vaultsWithUsers = await Promise.all(
        (data || []).map(async (vault) => {
          // Fetch client info if client_id exists
          let client = null;
          if (vault.client_id) {
            const { data: clientData } = await supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', vault.client_id)
              .single();
            client = clientData;
          }

          // Fetch all users with permissions for this vault
          const { data: permissionsData } = await supabase
            .from('vault_permissions')
            .select('user_id')
            .eq('vault_id', vault.id);

          // Extract unique users from permissions
          const usersMap = new Map<string, VaultUser>();
          if (permissionsData && permissionsData.length > 0) {
            // Get unique user IDs
            const userIds = [...new Set(permissionsData.map((p: any) => p.user_id))];

            // Fetch user profiles
            const { data: userProfiles } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .in('id', userIds);

            // Fetch admin roles for these users
            const { data: adminRoles } = await supabase
              .from('user_roles')
              .select('user_id')
              .in('user_id', userIds)
              .eq('role', 'admin');

            const adminUserIds = new Set(adminRoles?.map((r: any) => r.user_id) || []);

            if (userProfiles) {
              // Get roles for these users
              const { data: userRoles } = await supabase
                .from('user_roles')
                .select('user_id, role')
                .in('user_id', userIds);

              const roleMap = new Map<string, string>();
              userRoles?.forEach(ur => {
                roleMap.set(ur.user_id, ur.role);
              });

              // Check if NDA templates exist for this vault (for seller or investor)
              const { data: ndaTemplates } = await supabase
                .from('nda_templates')
                .select('id, role_type')
                .eq('vault_id', vault.id);

              const hasSellerNDA = ndaTemplates?.some(t => t.role_type === 'seller') || false;
              const hasInvestorNDA = ndaTemplates?.some(t => t.role_type === 'investor') || false;

              // Fetch NDA signatures for sellers and investors
              const sellerAndInvestorIds = userProfiles
                .filter(p => {
                  const role = roleMap.get(p.id);
                  return role === 'seller' || role === 'investor';
                })
                .map(p => p.id);

              let ndaSignaturesMap = new Map<string, string>();
              if (sellerAndInvestorIds.length > 0 && (hasSellerNDA || hasInvestorNDA)) {
                const { data: signatures } = await supabase
                  .from('nda_signatures')
                  .select('user_id, status')
                  .eq('vault_id', vault.id)
                  .in('user_id', sellerAndInvestorIds);

                if (signatures) {
                  signatures.forEach(sig => {
                    ndaSignaturesMap.set(sig.user_id, sig.status);
                  });
                }
              }

              userProfiles.forEach((profile) => {
                const userRole = roleMap.get(profile.id) || 'investor';
                let ndaStatus: 'signed' | 'unsigned' | 'not_required' = 'not_required';

                if (userRole === 'seller' && hasSellerNDA) {
                  const signatureStatus = ndaSignaturesMap.get(profile.id);
                  if (signatureStatus === 'signed') {
                    ndaStatus = 'signed';
                  } else {
                    ndaStatus = 'unsigned';
                  }
                } else if (userRole === 'investor' && hasInvestorNDA) {
                  const signatureStatus = ndaSignaturesMap.get(profile.id);
                  if (signatureStatus === 'signed') {
                    ndaStatus = 'signed';
                  } else {
                    ndaStatus = 'unsigned';
                  }
                }

                usersMap.set(profile.id, {
                  id: profile.id,
                  email: profile.email,
                  full_name: profile.full_name,
                  isAdmin: adminUserIds.has(profile.id),
                  role: userRole as 'admin' | 'seller' | 'investor',
                  ndaStatus,
                });
              });
            }
          }

          // Also include the creator if not already in the list
          if (vault.created_by && !usersMap.has(vault.created_by)) {
            const { data: creatorData } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .eq('id', vault.created_by)
              .single();

            // Get creator role
            const { data: creatorRole } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', vault.created_by)
              .maybeSingle();

            if (creatorData) {
              const role = (creatorRole?.role as 'admin' | 'seller' | 'investor') || 'investor';
              usersMap.set(vault.created_by, {
                id: creatorData.id,
                email: creatorData.email,
                full_name: creatorData.full_name,
                isAdmin: role === 'admin',
                role,
                ndaStatus: 'not_required', // Admins don't need NDA
              });
            }
          }

          return {
            ...vault,
            client,
            users: Array.from(usersMap.values())
          };
        })
      );

      setVaults(vaultsWithUsers);
    } catch (error) {
      console.error('Error fetching vaults:', error);
      toast({
        title: 'Error',
        description: 'Failed to load datarooms',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleCreateVault = async () => {
    if (!newVault.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a dataroom name',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    try {
      // Create the vault
      const { data: vault, error: vaultError } = await supabase
        .from('vaults')
        .insert({
          name: newVault.name,
          description: newVault.description || null,
          client_id: newVault.clientId || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (vaultError) throw vaultError;

      // If a client is assigned, create permissions with full access
      if (newVault.clientId) {
        await supabase
          .from('vault_permissions')
          .insert({
            vault_id: vault.id,
            user_id: newVault.clientId,
            can_view: true,
            can_edit: true,
            can_upload: true,
            can_delete: true, // Clients get full access including delete
          });
      }

      toast({
        title: 'Dataroom created',
        description: `${newVault.name} has been created successfully`,
      });

      setNewVault({ name: '', description: '', clientId: '' });
      setIsCreateDialogOpen(false);
      fetchVaults();
    } catch (error) {
      console.error('Error creating vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to create dataroom',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameVault = async () => {
    if (!renamingVault || !renameValue.trim()) return;

    try {
      const { error } = await supabase
        .from('vaults')
        .update({ name: renameValue.trim() })
        .eq('id', renamingVault.id);

      if (error) throw error;

      toast({
        title: 'Dataroom renamed',
        description: `"${renamingVault.name}" has been renamed to "${renameValue.trim()}"`,
      });

      setRenamingVault(null);
      setRenameValue('');
      fetchVaults();
    } catch (error: any) {
      console.error('Error renaming vault:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to rename dataroom',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteVault = async (vaultId: string, vaultName: string) => {
    if (!confirm(`Are you sure you want to delete "${vaultName}"? This will delete all documents inside.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('vaults')
        .delete()
        .eq('id', vaultId);

      if (error) throw error;

      toast({
        title: 'Dataroom deleted',
        description: `${vaultName} has been deleted`,
      });

      fetchVaults();
    } catch (error) {
      console.error('Error deleting vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete dataroom',
        variant: 'destructive',
      });
    }
  };

  const filteredVaults = vaults.filter((vault) =>
    vault.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vault.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vault.client?.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-2xl text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-foreground mb-2">Datarooms</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Create and manage secure datarooms for your clients
            </p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold">
                <Plus className="w-4 h-4 mr-2" />
                Create Dataroom
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-gold/20">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Create New Dataroom</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Dataroom Name</Label>
                  <Input
                    placeholder="e.g., Project Alpha Dataroom"
                    value={newVault.name}
                    onChange={(e) => setNewVault({ ...newVault, name: e.target.value })}
                    className="bg-input border-gold/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Textarea
                    placeholder="Brief description of this dataroom..."
                    value={newVault.description}
                    onChange={(e) => setNewVault({ ...newVault, description: e.target.value })}
                    className="bg-input border-gold/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Assign to Client (Optional)</Label>
                  <Select
                    value={newVault.clientId}
                    onValueChange={(value) => setNewVault({ ...newVault, clientId: value })}
                  >
                    <SelectTrigger className="bg-input border-gold/20">
                      <SelectValue placeholder="Select a client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.full_name || client.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="gold"
                  className="w-full"
                  onClick={handleCreateVault}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create Dataroom'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search datarooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-input border-gold/20 text-sm sm:text-base"
            />
          </div>
        </div>

        {/* Vaults Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted/30 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredVaults.length === 0 ? (
          <div className="text-center py-16 surface-elevated border border-gold/10 rounded-xl">
            <FolderLock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-2xl text-foreground mb-2">No Datarooms Found</h2>
            <p className="text-muted-foreground mb-6">
              {searchQuery
                ? 'No datarooms match your search criteria'
                : 'Create your first dataroom to get started'}
            </p>
            {!searchQuery && (
              <Button variant="gold" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Dataroom
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredVaults.map((vault) => (
              <div
                key={vault.id}
                className="group card-refined rounded-sm p-4 sm:p-6 hover:border-gold/40 transition-all duration-300 hover:shadow-gold/30"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center">
                    <FolderLock className="w-6 h-6 text-gold" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/admin/vaults/${vault.id}/permissions`}>
                          <Users className="w-4 h-4 mr-2" />
                          Manage Access
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setRenamingVault({ id: vault.id, name: vault.name });
                          setRenameValue(vault.name);
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Rename Dataroom
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteVault(vault.id, vault.name)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Dataroom
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <h3 className="font-display text-xl text-foreground mb-2">{vault.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {vault.description || 'No description'}
                </p>

                {vault.users && vault.users.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Users className="w-4 h-4 shrink-0" />
                      <span className="font-medium">People with access ({vault.users.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-2 ml-6">
                      {vault.users.map((user) => (
                        <span
                          key={user.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gold/10 text-gold border border-gold/20"
                        >
                          {user.role === 'admin' || user.isAdmin ? (
                            <Shield className="w-3 h-3 opacity-70 text-gold" />
                          ) : user.role === 'seller' ? (
                            <Store className="w-3 h-3 opacity-70 text-blue-500" />
                          ) : user.role === 'investor' ? (
                            <TrendingUp className="w-3 h-3 opacity-70 text-green-500" />
                          ) : null}
                          {user.full_name || user.email}
                          {(user.role === 'seller' || user.role === 'investor') && user.ndaStatus && (
                            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              user.ndaStatus === 'signed'
                                ? 'bg-green-500/20 text-green-600 border border-green-500/30'
                                : 'bg-red-500/20 text-red-600 border border-red-500/30'
                            }`}>
                              {user.ndaStatus === 'signed' ? 'NDA Signed' : 'NDA Unsigned'}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gold/10">
                  <span className="text-xs text-muted-foreground">
                    Created {new Date(vault.created_at).toLocaleDateString()}
                  </span>
                  <Link to={`/admin/vaults/${vault.id}`}>
                    <Button variant="ghost" size="sm" className="text-gold hover:text-gold">
                      Open <ArrowUpRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rename Dataroom Dialog */}
      <Dialog open={renamingVault !== null} onOpenChange={(open) => {
        if (!open) {
          setRenamingVault(null);
          setRenameValue('');
        }
      }}>
        <DialogContent className="bg-card border-gold/20">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Rename Dataroom</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Dataroom Name</Label>
              <Input
                placeholder="Enter new dataroom name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="bg-input border-gold/20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameVault();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setRenamingVault(null);
                  setRenameValue('');
                }}
              >
                Cancel
              </Button>
              <Button variant="gold" onClick={handleRenameVault} disabled={!renameValue.trim()}>
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
<div className="mt-12">
        <FraudAnalysisPanel />
      </div>
    <div className="mt-12">
        <CIMGenerationPanel />
      </div>
    </DashboardLayout>
  );
}