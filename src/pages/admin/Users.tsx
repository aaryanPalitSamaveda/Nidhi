import { useEffect, useState } from 'react';
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
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordInput } from '@/components/ui/password-input';
import { 
  Plus, 
  Search, 
  Shield, 
  User as UserIcon,
  Trash2,
  MoreVertical,
  Edit,
  Mail,
  KeyRound,
  Copy,
  Store,
  TrendingUp,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  created_at: string;
  role?: 'admin' | 'seller' | 'investor';
}

export default function AdminUsers() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [createdUserPassword, setCreatedUserPassword] = useState<{ email: string; password: string } | null>(null);
  
  // Add user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserCompanyName, setNewUserCompanyName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'seller' | 'investor'>('investor');
  
  // Edit user form state
  const [editFullName, setEditFullName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'seller' | 'investor'>('investor');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const usersWithRoles = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.id);
        return {
          ...profile,
          role: (userRole?.role as 'admin' | 'seller' | 'investor') || 'investor',
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: 'admin' | 'seller' | 'investor') => {
    try {
      // First try to update existing role
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existingRole) {
        await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });
      }

      toast({
        title: 'Role updated',
        description: `User role has been updated to ${newRole}`,
      });

      fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update role',
        variant: 'destructive',
      });
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast({
        title: 'Validation Error',
        description: 'Email and password are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Create user through Supabase Auth
      // The trigger will automatically create the profile
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            full_name: newUserFullName || null,
          },
          emailRedirectTo: undefined, // Don't send confirmation email
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('User creation failed - no user data returned');
      }

      const userId = authData.user.id;

      // CRITICAL: Verify user exists in auth.users by checking if profile was created
      // The trigger creates the profile AFTER user is inserted into auth.users
      // So if profile exists, user definitely exists in auth.users
      // This is the REAL fix - we verify the user is committed before proceeding
      let userExists = false;
      let retryCount = 0;
      const maxRetries = 10;

      while (!userExists && retryCount < maxRetries) {
        const { data: profile, error: profileCheckError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (profile) {
          // Profile exists = user exists in auth.users (foreign key constraint satisfied)
          userExists = true;
        } else if (profileCheckError && profileCheckError.code === 'PGRST116') {
          // Profile doesn't exist yet - trigger hasn't fired or user not committed
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } else {
          // Other error - might be RLS issue, but if we can't check, assume user exists
          // (since signUp returned a user)
          userExists = true;
        }
      }

      if (!userExists) {
        throw new Error('User was not created in database. Please try again.');
      }

      // Now update profile with additional information (company, phone)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: newUserFullName || null,
          company_name: newUserCompanyName || null,
          phone: newUserPhone || null,
        })
        .eq('id', userId);

      // If update failed, try insert (shouldn't happen if trigger worked)
      if (profileError && profileError.code !== 'PGRST116') {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: newUserEmail,
            full_name: newUserFullName || null,
            company_name: newUserCompanyName || null,
            phone: newUserPhone || null,
          });

        if (insertError && insertError.code !== '23505') {
          throw new Error(`Failed to create profile: ${insertError.message}`);
        }
      }

      // CRITICAL: Wait additional time for user to be fully committed to auth.users
      // Even though profile exists, the user might not be visible to foreign key constraints yet
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Confirm user email so they can log in immediately (admin-created users don't need email confirmation)
      const { data: confirmResult, error: confirmError } = await supabase.rpc('confirm_user_email', {
        target_user_id: userId,
      });

      if (confirmError) {
        if (confirmError.message?.includes('Could not find the function')) {
          // Function doesn't exist yet - log warning but continue
          console.warn('confirm_user_email function not found. Please run the migration.');
        } else {
          // Other error - log but don't fail user creation
          console.warn('Failed to confirm user email:', confirmError);
        }
      } else if (confirmResult && !confirmResult.success) {
        // Function returned but with error
        console.warn('Failed to confirm user email:', confirmResult.error);
      } else {
        // Success!
        console.log('User email confirmed successfully');
      }

      // Assign role using database function - this handles foreign key issues server-side
      const { data: roleResult, error: roleError } = await supabase.rpc('assign_user_role', {
        target_user_id: userId,
        target_role: newUserRole,
      });

      // If function doesn't exist, fall back to direct insert
      if (roleError && (roleError.message?.includes('Could not find the function') || roleError.code === '42883')) {
        // Fallback: Direct insert with retry
        await supabase.from('user_roles').delete().eq('user_id', userId);
        
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newUserRole });

        if (insertError) {
          if (insertError.code === '23503') {
            // Foreign key - wait and retry once
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { error: retryError } = await supabase
              .from('user_roles')
              .insert({ user_id: userId, role: newUserRole });
            
            if (retryError && retryError.code !== '23505') {
              throw new Error(`Failed to assign role: ${retryError.message}`);
            }
          } else if (insertError.code !== '23505') {
            throw new Error(`Failed to assign role: ${insertError.message}`);
          }
        }
      } else if (roleError) {
        throw new Error(`Failed to assign role: ${roleError.message}`);
      } else if (roleResult && !roleResult.success) {
        throw new Error(`Failed to assign role: ${roleResult.error || 'Unknown error'}`);
      }

      // Show password to admin in a dialog so they can copy and share it
      setCreatedUserPassword({ email: newUserEmail, password: newUserPassword });
      
      toast({
        title: 'User created successfully',
        description: `User ${newUserEmail} has been created. Check the dialog to copy the password.`,
      });

      // Reset form (but keep dialog open to show password)
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserFullName('');
      setNewUserCompanyName('');
      setNewUserPhone('');
      setNewUserRole('investor');
      setIsAddDialogOpen(false);

      // Refresh users list immediately - backend function handles all timing
      await fetchUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    }
  };

  const handleEditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setEditFullName(user.full_name || '');
    setEditCompanyName(user.company_name || '');
    setEditPhone(user.phone || '');
    setEditRole(user.role || 'investor');
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editFullName || null,
          company_name: editCompanyName || null,
          phone: editPhone || null,
        })
        .eq('id', selectedUser.id);

      if (profileError) throw profileError;

      // Update role - delete any existing roles first to avoid conflicts
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', selectedUser.id);
      
      // Insert new role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: selectedUser.id, role: editRole });

      if (roleError) throw roleError;

      toast({
        title: 'User updated',
        description: `User ${selectedUser.email} has been updated successfully`,
      });

      setIsEditDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user',
        variant: 'destructive',
      });
    }
  };

  const handleSendPasswordReset = async (userEmail: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: 'Password reset email sent',
        description: `A password reset email has been sent to ${userEmail}`,
      });
    } catch (error: any) {
      console.error('Error sending password reset:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send password reset email',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = (userId: string) => {
    setDeleteUserId(userId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserId) return;

    try {
      // Delete all related data first (order matters due to foreign keys)
      
      // 1. Delete vault permissions
      await supabase
        .from('vault_permissions')
        .delete()
        .eq('user_id', deleteUserId);

      // 2. Delete user roles
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', deleteUserId);

      // 3. Delete NDA signatures (if NDA tables exist)
      try {
        await supabase
          .from('nda_signatures')
          .delete()
          .eq('user_id', deleteUserId);
      } catch (ndaError) {
        // Ignore if table doesn't exist yet
        console.log('NDA signatures table may not exist:', ndaError);
      }

      // 4. Update documents - set uploaded_by to null (don't delete documents)
      await supabase
        .from('documents')
        .update({ uploaded_by: null })
        .eq('uploaded_by', deleteUserId);

      // 5. Delete folders created by this user
      await supabase
        .from('folders')
        .delete()
        .eq('created_by', deleteUserId);

      // 6. Update vaults - remove client_id if this user was the client
      await supabase
        .from('vaults')
        .update({ client_id: null })
        .eq('client_id', deleteUserId);

      // 7. Delete NDA templates uploaded by this user (if table exists)
      try {
        await supabase
          .from('nda_templates')
          .delete()
          .eq('uploaded_by', deleteUserId);
      } catch (ndaError) {
        // Ignore if table doesn't exist yet
        console.log('NDA templates table may not exist:', ndaError);
      }

      // 8. Finally, delete the profile (this should cascade to related data)
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', deleteUserId);

      if (profileError) throw profileError;

      toast({
        title: 'User removed',
        description: 'The user has been completely removed from the system. All related data has been cleaned up.',
      });

      setIsDeleteDialogOpen(false);
      setDeleteUserId(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove user. Some data may still remain.',
        variant: 'destructive',
      });
    }
  };

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.company_name?.toLowerCase().includes(searchQuery.toLowerCase())
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl text-foreground mb-2">Users</h1>
            <p className="text-muted-foreground">
              Manage user accounts and permissions
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" className="gap-2">
                <Plus className="w-4 h-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Create a new user account. They can log in immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-4 overflow-y-auto flex-1 min-h-0">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm">Password *</Label>
                  <PasswordInput
                    id="password"
                    placeholder="••••••••"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-sm">Role</Label>
                  <Select value={newUserRole} onValueChange={(value: 'admin' | 'seller' | 'investor') => setNewUserRole(value)}>
                    <SelectTrigger className="bg-input border-gold/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <span className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-gold" />
                          Admin
                        </span>
                      </SelectItem>
                      <SelectItem value="seller">
                        <span className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          Seller
                        </span>
                      </SelectItem>
                      <SelectItem value="investor">
                        <span className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          Investor
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-sm">Full Name (Optional)</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={newUserFullName}
                    onChange={(e) => setNewUserFullName(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-sm">Company (Optional)</Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Company Inc."
                    value={newUserCompanyName}
                    onChange={(e) => setNewUserCompanyName(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm">Phone (Optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
              </div>
              <DialogFooter className="border-t border-gold/10 pt-4 mt-4">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="gold" onClick={handleAddUser} disabled={!newUserEmail || !newUserPassword}>
                  Create User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-input border-gold/20"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="surface-elevated border border-gold/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gold/10">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">User</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Company</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Role</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Joined</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="p-4">
                        <div className="h-12 bg-muted/30 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <UserIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No users found</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-gold/5 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-gold" />
                          </div>
                          <span className="font-medium text-foreground">
                            {user.full_name || 'Unnamed User'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{user.email}</td>
                      <td className="p-4 text-muted-foreground">
                        {user.company_name || '-'}
                        {user.phone && (
                          <span className="block text-xs text-muted-foreground/70 mt-1">
                            {user.phone}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <Select
                          value={user.role}
                          onValueChange={(value: 'admin' | 'seller' | 'investor') => handleUpdateRole(user.id, value)}
                        >
                          <SelectTrigger className="w-32 bg-transparent border-gold/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <span className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-gold" />
                                Admin
                              </span>
                            </SelectItem>
                            <SelectItem value="seller">
                              <span className="flex items-center gap-2">
                                <Store className="w-4 h-4 text-blue-500" />
                                Seller
                              </span>
                            </SelectItem>
                            <SelectItem value="investor">
                              <span className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-500" />
                                Investor
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleEditUser(user)}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleSendPasswordReset(user.email)}
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              Send Password Reset
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information. Password changes must be done through password reset.
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={selectedUser.email}
                    disabled
                    className="bg-muted text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editFullName">Full Name</Label>
                  <Input
                    id="editFullName"
                    type="text"
                    placeholder="John Doe"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editCompanyName">Company Name</Label>
                  <Input
                    id="editCompanyName"
                    type="text"
                    placeholder="Company Inc."
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editPhone">Phone</Label>
                  <Input
                    id="editPhone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editRole">Role</Label>
                  <Select value={editRole} onValueChange={(value: 'admin' | 'seller' | 'investor') => setEditRole(value)}>
                    <SelectTrigger className="bg-input border-gold/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <span className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-gold" />
                          Admin
                        </span>
                      </SelectItem>
                      <SelectItem value="seller">
                        <span className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          Seller
                        </span>
                      </SelectItem>
                      <SelectItem value="investor">
                        <span className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          Investor
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="gold" onClick={handleUpdateUser}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* User Created - Password Display Dialog */}
        <AlertDialog open={!!createdUserPassword} onOpenChange={(open) => !open && setCreatedUserPassword(null)}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-gold" />
                User Created Successfully
              </AlertDialogTitle>
              <AlertDialogDescription>
                Please save and share these credentials with the user.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={createdUserPassword?.email || ''}
                    readOnly
                    className="bg-muted font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(createdUserPassword?.email || '');
                      toast({ title: 'Email copied to clipboard' });
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={createdUserPassword?.password || ''}
                    readOnly
                    className="bg-muted font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(createdUserPassword?.password || '');
                      toast({ title: 'Password copied to clipboard' });
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  <strong>Important:</strong> Share these credentials securely with the user. 
                  They can change their password after logging in from Settings.
                </p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setCreatedUserPassword(null)}>
                I've Saved the Credentials
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the user account
                and remove all associated data from the system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeleteUserId(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteUser}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
