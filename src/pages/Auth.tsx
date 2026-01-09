import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { signIn, signUp } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Lock, Mail, User } from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';
import logo from '@/assets/samaveda-logo.jpeg';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading } = useAuth();

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const { error, data: authData } = await signIn(data.email, data.password);
      
      if (error) {
        setIsLoading(false);
        let errorMessage = error.message || 'Invalid email or password. Please try again.';
        
        // Provide more helpful error messages
        if (error.message?.includes('Email not confirmed') || error.message?.includes('email_not_confirmed')) {
          errorMessage = 'Email not confirmed. Please check your email for a confirmation link, or contact your administrator.';
        } else if (error.message?.includes('Invalid login credentials') || error.message?.includes('invalid_credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        }
        
        toast({
          title: 'Login failed',
          description: errorMessage,
          variant: 'destructive',
        });
        return;
      }

      if (!authData?.user) {
        setIsLoading(false);
        toast({
          title: 'Login failed',
          description: 'Authentication succeeded but user data is missing. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      // Wait a moment for auth context to update
      setTimeout(() => {
        setIsLoading(false);
        navigate('/dashboard');
      }, 500);
    } catch (error: any) {
      setIsLoading(false);
      console.error('Login error:', error);
      toast({
        title: 'Login failed',
        description: error?.message || 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    const { error, data: signupData } = await signUp(data.email, data.password, data.fullName);
    
    if (error) {
      setIsLoading(false);
      let message = error.message;
      if (error.message.includes('already registered')) {
        message = 'An account with this email already exists. Please sign in instead.';
      }
      toast({
        title: 'Signup failed',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    // Wait a moment for auto-confirmation to complete, then sign in automatically
    if (signupData?.user) {
      // Try to sign in the user automatically after a brief delay
      setTimeout(async () => {
        const { error: signInError } = await signIn(data.email, data.password);
        setIsLoading(false);
        
        if (signInError) {
          // If auto sign-in fails, user can manually sign in
          toast({
            title: 'Account created',
            description: 'Your account has been created. Please sign in to continue.',
          });
          setIsLogin(true); // Switch to login form
        } else {
          toast({
            title: 'Welcome to Nidhi',
            description: 'Your account has been created and you are now signed in.',
          });
          navigate('/dashboard');
        }
      }, 2000); // Wait 2 seconds for confirmation to process
    } else {
      setIsLoading(false);
      toast({
        title: 'Account created',
        description: 'Your account has been created. Please sign in to continue.',
      });
      setIsLogin(true); // Switch to login form
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-gold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-dark" />
        <div className="absolute inset-0 bg-gradient-radial opacity-60" />
        
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
          <div className="animate-float">
            <img 
              src={logo} 
              alt="Samaveda Capital" 
              className="w-48 h-48 object-contain mb-8"
            />
          </div>
          
          <h1 className="font-display text-5xl text-gradient-gold mb-4 text-center">
            Nidhi
          </h1>
          <p className="text-muted-foreground text-xl mb-12 tracking-widest uppercase">
            Private. Secure. Yours.
          </p>
          
          <div className="grid grid-cols-3 gap-8 mt-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full border border-gold/30 flex items-center justify-center mx-auto mb-4 glow-gold">
                <Shield className="w-7 h-7 text-gold" />
              </div>
              <p className="text-sm text-muted-foreground">Bank-Grade<br/>Security</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full border border-gold/30 flex items-center justify-center mx-auto mb-4 glow-gold">
                <Lock className="w-7 h-7 text-gold" />
              </div>
              <p className="text-sm text-muted-foreground">End-to-End<br/>Encryption</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full border border-gold/30 flex items-center justify-center mx-auto mb-4 glow-gold">
                <svg className="w-7 h-7 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">Secure<br/>Datarooms</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img 
              src={logo} 
              alt="Samaveda Capital" 
              className="w-24 h-24 object-contain mb-4"
            />
            <h1 className="font-display text-3xl text-gradient-gold">Nidhi</h1>
            <p className="text-muted-foreground text-sm tracking-widest uppercase">
              Private. Secure. Yours.
            </p>
          </div>

          <div className="surface-elevated rounded-xl p-8 border border-gold/10 shadow-elevated">
            <div className="mb-8">
              <h2 className="font-display text-2xl text-foreground mb-2">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-muted-foreground text-sm">
                {isLogin 
                  ? 'Sign in to access your secure dataroom' 
                  : 'Join Nidhi to manage your documents securely'}
              </p>
            </div>

            {isLogin ? (
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      className="pl-10 bg-input border-gold/20 focus:border-gold"
                      {...loginForm.register('email')}
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <PasswordInput
                      id="password"
                      placeholder="••••••••"
                      className="pl-10 pr-10 bg-input border-gold/20 focus:border-gold"
                      {...loginForm.register('password')}
                    />
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" variant="gold" size="lg" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            ) : (
              <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-foreground">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      className="pl-10 bg-input border-gold/20 focus:border-gold"
                      {...signupForm.register('fullName')}
                    />
                  </div>
                  {signupForm.formState.errors.fullName && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.fullName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signupEmail" className="text-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signupEmail"
                      type="email"
                      placeholder="you@company.com"
                      className="pl-10 bg-input border-gold/20 focus:border-gold"
                      {...signupForm.register('email')}
                    />
                  </div>
                  {signupForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signupPassword" className="text-foreground">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <PasswordInput
                      id="signupPassword"
                      placeholder="••••••••"
                      className="pl-10 pr-10 bg-input border-gold/20 focus:border-gold"
                      {...signupForm.register('password')}
                    />
                  </div>
                  {signupForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <PasswordInput
                      id="confirmPassword"
                      placeholder="••••••••"
                      className="pl-10 pr-10 bg-input border-gold/20 focus:border-gold"
                      {...signupForm.register('confirmPassword')}
                    />
                  </div>
                  {signupForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" variant="gold" size="lg" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-gold transition-colors"
              >
                {isLogin 
                  ? "Don't have an account? Sign up" 
                  : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
