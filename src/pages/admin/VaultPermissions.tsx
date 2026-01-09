import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  Users,
  Plus,
  Trash2,
  Mail,
  Shield,
  User,
  Check,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface VaultInfo {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface VaultPermission {
  id: string;
  user_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_upload: boolean;
  can_delete: boolean;
  user?: UserProfile;
}

export default function VaultPermissions() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [permissions, setPermissions] = useState<VaultPermission[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPermissions, setNewPermissions] = useState({
    can_view: true,
    can_edit: false,
    can_upload: false,
    can_delete: false,
  });
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (vaultId) {
      fetchVaultInfo();
      fetchPermissions();
      fetchAllUsers();
    }
  }, [vaultId]);

  const fetchVaultInfo = async () => {
    if (!vaultId) return;
    
    try {
      const { data, error } = await supabase
        .from('vaults')
        .select('id, name, description, client_id')
        .eq('id', vaultId)
        .single();

      if (error) throw error;
      setVault(data);
    } catch (error) {
      console.error('Error fetching vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dataroom information',
        variant: 'destructive',
      });
    }
  };

  const fetchPermissions = async () => {
    if (!vaultId) return;
    
    try {
      const { data, error } = await supabase
        .from('vault_permissions')
        .select('*')
        .eq('vault_id', vaultId);

      if (error) throw error;

      // Fetch user profiles for each permission
      const permissionsWithUsers = await Promise.all(
        (data || []).map(async (perm) => {
          const { data: userData } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('id', perm.user_id)
            .single();
          
          return { ...perm, user: userData || null };
        })
      );

      setPermissions(permissionsWithUsers);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load permissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .order('email');

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleAddUser = async () => {
    if (!vaultId || !selectedUserId) {
      toast({
        title: 'Error',
        description: 'Please select a user',
        variant: 'destructive',
      });
      return;
    }

    // Check if user already has permissions
    const existing = permissions.find(p => p.user_id === selectedUserId);
    if (existing) {
      toast({
        title: 'Error',
        description: 'This user already has access to this dataroom',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('vault_permissions')
        .insert({
          vault_id: vaultId,
          user_id: selectedUserId,
          can_view: newPermissions.can_view,
          can_edit: newPermissions.can_edit,
          can_upload: newPermissions.can_upload,
          can_delete: newPermissions.can_delete,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User access added successfully',
      });

      setIsAddDialogOpen(false);
      setSelectedUserId('');
      setNewPermissions({
        can_view: true,
        can_edit: false,
        can_upload: false,
        can_delete: false,
      });
      fetchPermissions();
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to add user access',
        variant: 'destructive',
      });
    }
  };

  const handleUpdatePermissions = async (
    permissionId: string,
    updates: Partial<VaultPermission>
  ) => {
    try {
      const { error } = await supabase
        .from('vault_permissions')
        .update(updates)
        .eq('id', permissionId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Permissions updated successfully',
      });

      fetchPermissions();
    } catch (error: any) {
      console.error('Error updating permissions:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update permissions',
        variant: 'destructive',
      });
    }
  };

  const handleDeletePermission = async () => {
    if (!userToDelete || !vaultId) return;

    try {
      const { error } = await supabase
        .from('vault_permissions')
        .delete()
        .eq('vault_id', vaultId)
        .eq('user_id', userToDelete);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User access removed successfully',
      });

      setUserToDelete(null);
      fetchPermissions();
    } catch (error: any) {
      console.error('Error deleting permission:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to remove user access',
        variant: 'destructive',
      });
    }
  };

  // Get users that don't already have permissions
  const availableUsers = allUsers.filter(
    (user) => !permissions.some((p) => p.user_id === user.id)
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
        <div className="mb-8">
          <Link to="/admin/vaults">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Datarooms
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-4xl text-foreground mb-2">
                Manage Access: {vault?.name || 'Loading...'}
              </h1>
              <p className="text-muted-foreground">
                Control who can access this dataroom and what they can do
              </p>
            </div>
            
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="gold">
                  <Plus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-gold/20 max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Add User Access</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Select User</Label>
                    <Select
                      value={selectedUserId}
                      onValueChange={setSelectedUserId}
                    >
                      <SelectTrigger className="bg-input border-gold/20">
                        <SelectValue placeholder="Choose a user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.full_name || user.email} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-gold/10">
                    <Label>Permissions</Label>
                    
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="can_view"
                          checked={newPermissions.can_view}
                          onCheckedChange={(checked) =>
                            setNewPermissions({ ...newPermissions, can_view: checked === true })
                          }
                        />
                        <Label htmlFor="can_view" className="cursor-pointer font-normal">
                          View - Can view folders and documents
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="can_edit"
                          checked={newPermissions.can_edit}
                          onCheckedChange={(checked) =>
                            setNewPermissions({ ...newPermissions, can_edit: checked === true })
                          }
                        />
                        <Label htmlFor="can_edit" className="cursor-pointer font-normal">
                          Edit - Can create and rename folders
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="can_upload"
                          checked={newPermissions.can_upload}
                          onCheckedChange={(checked) =>
                            setNewPermissions({ ...newPermissions, can_upload: checked === true })
                          }
                        />
                        <Label htmlFor="can_upload" className="cursor-pointer font-normal">
                          Upload - Can upload documents
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="can_delete"
                          checked={newPermissions.can_delete}
                          onCheckedChange={(checked) =>
                            setNewPermissions({ ...newPermissions, can_delete: checked === true })
                          }
                        />
                        <Label htmlFor="can_delete" className="cursor-pointer font-normal">
                          Delete - Can delete folders and documents
                        </Label>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="gold"
                    className="w-full"
                    onClick={handleAddUser}
                    disabled={!selectedUserId || availableUsers.length === 0}
                  >
                    Add Access
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Permissions List */}
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
          </div>
        ) : permissions.length === 0 ? (
          <div className="text-center py-16 surface-elevated border border-gold/10 rounded-xl">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-2xl text-foreground mb-2">No Users Have Access</h2>
            <p className="text-muted-foreground mb-6">
              Add users to grant them access to this dataroom
            </p>
            <Button variant="gold" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First User
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {permissions.map((permission) => (
              <div
                key={permission.id}
                className="surface-elevated border border-gold/10 rounded-xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg text-foreground">
                        {permission.user?.full_name || 'Unknown User'}
                      </h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {permission.user?.email || permission.user_id}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUserToDelete(permission.user_id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gold/10">
                  {[
                    { key: 'can_view', label: 'View' },
                    { key: 'can_edit', label: 'Edit' },
                    { key: 'can_upload', label: 'Upload' },
                    { key: 'can_delete', label: 'Delete' },
                  ].map(({ key, label }) => {
                    const permissionKey = key as keyof typeof permission;
                    const hasPermission = permission[permissionKey] as boolean;
                    
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                      >
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        <button
                          onClick={() =>
                            handleUpdatePermissions(permission.id, {
                              [key]: !hasPermission,
                            })
                          }
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                            hasPermission
                              ? 'bg-gold/20 text-gold'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {hasPermission ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={userToDelete !== null}
          onOpenChange={(open) => !open && setUserToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove User Access?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove this user's access to the dataroom. They will no longer be able to
                view or interact with any content in this dataroom.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePermission}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove Access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}


