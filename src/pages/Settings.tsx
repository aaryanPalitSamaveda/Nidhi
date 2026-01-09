import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, User, Building2, Phone, Mail, Save, Lock, Check, X } from 'lucide-react';

export default function Settings() {
  const { user, profile, isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    companyName: '',
    phone: '',
    email: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.fullName || '',
        companyName: profile.companyName || '',
        phone: '',
        email: profile.email || user?.email || '',
      });
    }
  }, [profile, user]);

  // Fetch current profile data
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        if (data) {
          setFormData({
            fullName: data.full_name || '',
            companyName: data.company_name || '',
            phone: data.phone || '',
            email: data.email || user.email || '',
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.fullName || null,
          company_name: formData.companyName || null,
          phone: formData.phone || null,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Settings updated',
        description: 'Your profile has been updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    // Validation
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'All password fields are required',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'New passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: 'Validation Error',
        description: 'New password must be at least 6 characters long',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      toast({
        title: 'Validation Error',
        description: 'New password must be different from current password',
        variant: 'destructive',
      });
      return;
    }

    setPasswordLoading(true);

    try {
      // First, verify the current password by attempting to sign in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordData.currentPassword,
      });

      if (verifyError) {
        throw new Error('Current password is incorrect');
      }

      // Small delay to ensure session is updated
      await new Promise(resolve => setTimeout(resolve, 100));

      // If verification successful, update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (updateError) throw updateError;

      // Clear password fields and close form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setIsPasswordFormOpen(false);

      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully',
      });
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to change password',
        variant: 'destructive',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-2xl text-foreground mb-2">Not Authenticated</h2>
            <p className="text-muted-foreground">Please sign in to access settings.</p>
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
          <h1 className="font-display text-4xl text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account settings and profile information
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Settings */}
          <div className="lg:col-span-2">
            <div className="surface-elevated border border-gold/10 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <h2 className="font-display text-xl text-foreground">Profile Information</h2>
                  <p className="text-sm text-muted-foreground">Update your personal details</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="pl-10 bg-muted text-muted-foreground"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="pl-10 bg-input border-gold/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      type="text"
                      placeholder="Company Inc."
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      className="pl-10 bg-input border-gold/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="pl-10 bg-input border-gold/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gold/10">
                  <Button type="submit" variant="gold" disabled={loading}>
                    <Save className="w-4 h-4 mr-2" />
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </div>

          {/* Account Info */}
          <div className="space-y-6">
            <div className="surface-elevated border border-gold/10 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-gold" />
                <h3 className="font-display text-lg text-foreground">Account Information</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Role</p>
                  <p className="text-foreground font-medium">
                    {isAdmin ? 'Administrator' : 'Client'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">User ID</p>
                  <p className="text-foreground font-mono text-xs break-all">
                    {user.id}
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-elevated border border-gold/10 rounded-xl p-6">
              {!isPasswordFormOpen ? (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-gold" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-lg text-foreground">Change Password</h3>
                      <p className="text-sm text-muted-foreground">Update your account password</p>
                    </div>
                  </div>
                  <Button 
                    variant="gold" 
                    className="w-full" 
                    onClick={() => setIsPasswordFormOpen(true)}
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Change Password
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-gold" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-foreground">Change Password</h3>
                        <p className="text-sm text-muted-foreground">Update your account password</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setIsPasswordFormOpen(false);
                        setPasswordData({
                          currentPassword: '',
                          newPassword: '',
                          confirmPassword: '',
                        });
                      }}
                      className="shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <PasswordInput
                        id="currentPassword"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        placeholder="Enter current password"
                        className="bg-input border-gold/20"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <PasswordInput
                        id="newPassword"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        placeholder="Enter new password"
                        className="bg-input border-gold/20"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <PasswordInput
                        id="confirmPassword"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        placeholder="Confirm new password"
                        className="bg-input border-gold/20"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        type="button"
                        variant="outline" 
                        className="flex-1" 
                        onClick={() => {
                          setIsPasswordFormOpen(false);
                          setPasswordData({
                            currentPassword: '',
                            newPassword: '',
                            confirmPassword: '',
                          });
                        }}
                        disabled={passwordLoading}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        variant="gold" 
                        className="flex-1" 
                        disabled={passwordLoading || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {passwordLoading ? 'Updating...' : 'Done'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


