import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  FolderLock,
  Users,
  Settings,
  LogOut,
  Shield,
  FileText,
} from 'lucide-react';
import logo from '@/assets/samaveda-logo.jpeg';

const adminNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Users', href: '/admin/users' },
  { icon: FolderLock, label: 'Datarooms', href: '/admin/vaults' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

const clientNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: FolderLock, label: 'My Dataroom', href: '/vault' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, profile } = useAuth();

  const navItems = isAdmin ? adminNavItems : clientNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border/50">
        <Link to="/dashboard" className="flex items-center gap-3 group">
          <div className="relative">
            <img src={logo} alt="Nidhi" className="w-10 h-10 object-contain transition-transform duration-200 group-hover:scale-105" />
            <div className="absolute inset-0 rounded-full bg-gold/0 group-hover:bg-gold/5 blur-xl transition-all duration-200" />
          </div>
          <div>
            <h1 className="font-display text-xl text-gradient-gold tracking-tight">Nidhi</h1>
            <p className="text-[9px] text-muted-foreground/80 tracking-[0.15em] uppercase font-medium mt-0.5">
              Private. Secure. Yours.
            </p>
          </div>
        </Link>
      </div>

      {/* Role Badge */}
      <div className="px-6 py-4 border-b border-sidebar-border/50">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            isAdmin ? "bg-gold shadow-sm shadow-gold/50" : "bg-green-400"
          )} />
          <span className="text-[11px] font-semibold text-muted-foreground/90 uppercase tracking-wider">
            {isAdmin ? 'Administrator' : 'Client'}
          </span>
        </div>
        {profile?.fullName && (
          <p className="mt-2 text-sm font-medium text-foreground/95 truncate">{profile.fullName}</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-sm text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gold/10 text-gold border-l-2 border-gold shadow-sm shadow-gold/10"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-foreground border-l-2 border-transparent"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "text-gold")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
