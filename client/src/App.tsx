import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Navbar from "@/components/navbar";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute, PublicOnlyRoute, DashboardRedirect } from "@/components/route-guards";
import Home from "@/pages/home";
import About from "@/pages/about";
import Contact from "@/pages/contact";
import CityMap from "@/pages/city-map";
import PGDetails from "@/pages/pg-details";
import CompatibilityQuiz from "@/pages/compatibility-quiz";
import Settings from "@/pages/settings";
import Signup from "@/pages/signup";
import LoginWithOtp from "@/pages/login-with-otp";
import UserDashboard from "@/pages/user-dashboard-simple";
import OwnerDashboard from "@/pages/owner-dashboard-simple";
import BookingSimple from "@/pages/booking-simple";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Public pages */}
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/city-map" component={CityMap} />
      <Route path="/pg-details" component={PGDetails} />
      <Route path="/compatibility-quiz" component={CompatibilityQuiz} />

      {/* Login / signup: logged-in users are sent on to their dashboard */}
      <Route path="/login">{() => <PublicOnlyRoute component={LoginWithOtp} />}</Route>
      <Route path="/login-otp">{() => <PublicOnlyRoute component={LoginWithOtp} />}</Route>
      <Route path="/signup">{() => <PublicOnlyRoute component={Signup} />}</Route>

      {/* Private pages: must be logged in */}
      <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>
      <Route path="/booking">{() => <ProtectedRoute component={BookingSimple} role="user" />}</Route>
      <Route path="/dashboard/user">{() => <ProtectedRoute component={UserDashboard} role="user" />}</Route>
      <Route path="/dashboard/owner">{() => <ProtectedRoute component={OwnerDashboard} role="owner" />}</Route>

      {/* Aliases that used to be linked to but never existed */}
      <Route path="/dashboard" component={DashboardRedirect} />
      <Route path="/owner-dashboard" component={DashboardRedirect} />
      <Route path="/user-dashboard" component={DashboardRedirect} />
      <Route path="/home">{() => <Redirect to="/" replace />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <div className="min-h-screen bg-background">
              <Navbar />
              <Router />
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
