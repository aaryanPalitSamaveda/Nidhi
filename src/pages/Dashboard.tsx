import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  FolderLock, 
  Users, 
  FileText, 
  ArrowUpRight,
  Plus,
  Shield,
  Activity
} from 'lucide-react';

interface Stats {
  totalVaults: number;
  totalUsers: number;
  totalDocuments: number;
}

export default function Dashboard() {
  const { isAdmin, profile, user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalVaults: 0, totalUsers: 0, totalDocuments: 0 });
  const [recentVaults, setRecentVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Parallelize all queries for better performance
      const [vaultsCountResult, recentVaultsResult, docsCountResult, usersCountResult] = await Promise.all([
        supabase
          .from('vaults')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('vaults')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('documents')
          .select('*', { count: 'exact', head: true }),
        isAdmin ? supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true }) : Promise.resolve({ count: null })
      ]);

      if (isAdmin) {
        setStats({
          totalVaults: vaultsCountResult.count || 0,
          totalUsers: usersCountResult.count || 0,
          totalDocuments: docsCountResult.count || 0,
        });
      } else {
        setStats({
          totalVaults: vaultsCountResult.count || 0,
          totalUsers: 0,
          totalDocuments: docsCountResult.count || 0,
        });
      }

      setRecentVaults(recentVaultsResult.data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const statCards = isAdmin
    ? [
        { icon: FolderLock, label: 'Total Datarooms', value: stats.totalVaults, href: '/admin/vaults' },
        { icon: Users, label: 'Total Users', value: stats.totalUsers, href: '/admin/users' },
        { icon: FileText, label: 'Documents', value: stats.totalDocuments, href: '/admin/vaults' },
      ]
    : [
        { icon: FolderLock, label: 'My Datarooms', value: stats.totalVaults, href: '/vault' },
        { icon: FileText, label: 'Documents', value: stats.totalDocuments, href: '/vault' },
      ];

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-foreground mb-2">
            Welcome back{profile?.fullName ? `, ${profile.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isAdmin 
              ? 'Manage your datarooms and client access from here.' 
              : 'Access your secure datarooms.'}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Link
                key={stat.label}
                to={stat.href}
                className="group card-refined rounded-sm p-6 hover:border-gold/40 transition-all duration-300 hover:shadow-gold/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                  <p className="text-muted-foreground/80 text-xs font-medium uppercase tracking-wider mb-2">{stat.label}</p>
                  <p className="font-display text-5xl text-foreground font-semibold">{stat.value}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
                    <Icon className="w-6 h-6 text-gold" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-gold opacity-0 group-hover:opacity-100 transition-opacity">
                  View details <ArrowUpRight className="w-4 h-4 ml-1" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions */}
        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Link to="/admin/vaults">
              <Button variant="gold-outline" size="lg" className="w-full justify-start">
                <Plus className="w-5 h-5 mr-3" />
                Create New Dataroom
              </Button>
            </Link>
            <Link to="/admin/users">
              <Button variant="outline" size="lg" className="w-full justify-start">
                <Users className="w-5 h-5 mr-3" />
                Manage Users
              </Button>
            </Link>
          </div>
        )}

        {/* Recent Vaults */}
        <div className="card-refined rounded-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-foreground">Recent Datarooms</h2>
            <Link to={isAdmin ? '/admin/vaults' : '/vault'}>
              <Button variant="ghost" size="sm">
                View All <ArrowUpRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentVaults.length === 0 ? (
            <div className="text-center py-12">
              <FolderLock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No datarooms created yet</p>
              {isAdmin && (
                <Link to="/admin/vaults">
                  <Button variant="gold" className="mt-4">
                    Create Your First Dataroom
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {recentVaults.map((vault) => (
                <Link
                  key={vault.id}
                  to={isAdmin ? `/admin/vaults/${vault.id}` : `/vault/${vault.id}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                      <FolderLock className="w-5 h-5 text-gold" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{vault.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {vault.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-gold transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-8 p-4 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-4">
          <Shield className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">Bank-Grade Security</p>
            <p className="text-sm text-muted-foreground">
              All your documents are encrypted and stored securely. Only authorized users can access your datarooms.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
