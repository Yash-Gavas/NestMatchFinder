import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, LogIn, LogOut, UserPlus, Settings, Menu, X } from "lucide-react";
import Logo from "@/components/logo";
import { useAuth, dashboardFor } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";

const linkClass =
  "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";

export default function Navbar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => location === path;
  const close = () => setMenuOpen(false);

  const handleLogout = () => {
    close();
    logout();
    toast({ title: "Logged out", description: "You have been logged out successfully." });
    setLocation("/");
  };

  const fullName = user
    ? user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
    : "";

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/">
              <div className="flex-shrink-0 cursor-pointer" onClick={close}>
                <Logo size="md" showText={true} />
              </div>
            </Link>
            <div className="hidden md:block ml-10">
              <div className="flex items-center space-x-1">
                <Link href="/">
                  <Button
                    variant="ghost"
                    className={isActive("/") ? "text-gray-900 dark:text-white" : linkClass}
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Home
                  </Button>
                </Link>
                {user && (
                  <Link href={dashboardFor(user)}>
                    <Button variant="ghost" className={linkClass}>
                      Dashboard
                    </Button>
                  </Link>
                )}
                <Link href="/about">
                  <Button variant="ghost" className={linkClass}>About</Button>
                </Link>
                <Link href="/contact">
                  <Button variant="ghost" className={linkClass}>Contact</Button>
                </Link>
                {user && (
                  <Link href="/settings">
                    <Button variant="ghost" className={linkClass}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {fullName}
                </span>
                <Button onClick={handleLogout} variant="outline">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className={linkClass}>
                    <LogIn className="mr-2 h-4 w-4" />
                    Login
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Sign up
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 space-y-1">
          <Link href="/"><Button variant="ghost" className={`w-full justify-start ${linkClass}`} onClick={close}>Home</Button></Link>
          {user && (
            <Link href={dashboardFor(user)}><Button variant="ghost" className={`w-full justify-start ${linkClass}`} onClick={close}>Dashboard</Button></Link>
          )}
          <Link href="/about"><Button variant="ghost" className={`w-full justify-start ${linkClass}`} onClick={close}>About</Button></Link>
          <Link href="/contact"><Button variant="ghost" className={`w-full justify-start ${linkClass}`} onClick={close}>Contact</Button></Link>
          {user ? (
            <>
              <Link href="/settings"><Button variant="ghost" className={`w-full justify-start ${linkClass}`} onClick={close}>Settings</Button></Link>
              <div className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">{fullName}</div>
              <Button variant="outline" className="w-full" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost" className={`w-full justify-start ${linkClass}`} onClick={close}>Login</Button></Link>
              <Link href="/signup"><Button className="w-full" onClick={close}>Sign up</Button></Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
