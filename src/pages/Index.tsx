import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Lock, FolderLock, ArrowRight } from 'lucide-react';
import logo from '@/assets/samaveda-logo.jpeg';

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-gradient-dark" />
      <div className="fixed inset-0 bg-gradient-radial opacity-40" />
      
      {/* Floating Orbs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl animate-float" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Samaveda Capital" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="font-display text-xl text-gradient-gold">Nidhi</h1>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">
              Private. Secure. Yours.
            </p>
          </div>
        </div>
        
        <Link to="/auth">
          <Button variant="gold-outline">Sign In</Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-8 text-center">
        <div className="animate-slide-up">
          <div className="mb-8">
            <img 
              src={logo} 
              alt="Samaveda Capital" 
              className="w-32 h-32 object-contain mx-auto animate-float"
            />
          </div>
          
          <h1 className="font-display text-7xl md:text-8xl lg:text-9xl mb-6 font-bold">
            <span className="gold-shimmer">Nidhi</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground/90 mb-4 tracking-[0.2em] uppercase font-medium letter-spacing-wider">
            Private. Secure. Yours.
          </p>
          
          <p className="text-base md:text-lg text-muted-foreground/80 max-w-2xl mx-auto mb-12 leading-relaxed">
            The secure dataroom for modern investment banking. 
            Bank-grade security for your most sensitive documents.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link to="/auth" className="group">
              <Button variant="gold" size="xl" className="text-lg font-semibold px-12 py-7 min-w-[240px] shadow-2xl">
                Access Your Dataroom
                <ArrowRight className="w-5 h-5 ml-3 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-4xl mx-auto animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="text-center group">
            <div className="w-16 h-16 rounded-full border border-gold/40 flex items-center justify-center mx-auto mb-5 shadow-sm shadow-gold/10 group-hover:border-gold/70 group-hover:shadow-gold/20 transition-all duration-300">
              <Shield className="w-7 h-7 text-gold" />
            </div>
            <h3 className="font-display text-lg text-foreground mb-2 font-semibold">Bank-Grade Security</h3>
            <p className="text-sm text-muted-foreground/80 leading-relaxed">
              Enterprise-level encryption and access controls protect your sensitive data.
            </p>
          </div>
          
          <div className="text-center group">
            <div className="w-16 h-16 rounded-full border border-gold/40 flex items-center justify-center mx-auto mb-5 shadow-sm shadow-gold/10 group-hover:border-gold/70 group-hover:shadow-gold/20 transition-all duration-300">
              <FolderLock className="w-7 h-7 text-gold" />
            </div>
            <h3 className="font-display text-lg text-foreground mb-2 font-semibold">Secure Datarooms</h3>
            <p className="text-sm text-muted-foreground/80 leading-relaxed">
              Create isolated datarooms for each deal with granular permission controls.
            </p>
          </div>
          
          <div className="text-center group">
            <div className="w-16 h-16 rounded-full border border-gold/40 flex items-center justify-center mx-auto mb-5 shadow-sm shadow-gold/10 group-hover:border-gold/70 group-hover:shadow-gold/20 transition-all duration-300">
              <Lock className="w-7 h-7 text-gold" />
            </div>
            <h3 className="font-display text-lg text-foreground mb-2 font-semibold">Full Control</h3>
            <p className="text-sm text-muted-foreground/80 leading-relaxed">
              You decide who sees what. Complete audit trails for compliance.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Samaveda Capital. All rights reserved.</p>
      </footer>
    </div>
  );
}
