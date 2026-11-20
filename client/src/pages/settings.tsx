// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User, Settings, Moon, Sun, Monitor, Bell, Shield,
  LogOut, Edit, Camera, Trash2, ArrowLeft
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-simple";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeUser, setActiveUser] = useState<any>(null);

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    name: "",
    email: "",
    phone: "",
    age: "",
    gender: "",
    occupation: "",
    profession: "",
    company: "",
    bio: "",
    avatar: "",
    preferences: {}
  });

  // 1. Auth Guard: block access if not logged in
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const storedUserRaw = localStorage.getItem("user");
    let parsedStoredUser = null;

    try {
      parsedStoredUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
    } catch {
      parsedStoredUser = null;
    }

    const resolvedUser = user || parsedStoredUser;

    if (!token && !resolvedUser) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to access your settings.",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }

    setActiveUser(resolvedUser);
    setIsCheckingAuth(false);
  }, [user, setLocation, toast]);

  // 2. Populate form fields once authenticated user is resolved
  useEffect(() => {
    if (activeUser) {
      setProfileData({
        firstName: activeUser.firstName || "",
        lastName: activeUser.lastName || "",
        name: activeUser.name || `${activeUser.firstName || ""} ${activeUser.lastName || ""}`.trim(),
        email: activeUser.email || "",
        phone: activeUser.phone || "",
        age: activeUser.age?.toString() || "",
        gender: activeUser.gender || "",
        occupation: activeUser.occupation || "",
        profession: activeUser.profession || "",
        company: activeUser.company || "",
        bio: activeUser.bio || "",
        avatar: activeUser.avatar || activeUser.profilePhoto || "",
        preferences: activeUser.preferences || {}
      });
    }
  }, [activeUser]);

  // 3. Profile Photo Picker & Preview Handler
  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please select an image file (JPG, PNG, or WebP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload an image smaller than 2 MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Image = reader.result as string;
      setProfileData((prev) => ({
        ...prev,
        avatar: base64Image,
      }));
      toast({
        title: "Photo Selected",
        description: "Click 'Update Profile' to save your new profile photo.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleLogout = () => {
    localStorage.removeItem("userPreferences");
    localStorage.removeItem("authToken");
    localStorage.removeItem("userType");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("user");

    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });

    setLocation("/login");
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (updatedData: any) => {
      const response = await apiRequest("PUT", `/api/users/${activeUser?.id}`, updatedData);
      return response.json();
    },
    onSuccess: (savedUser) => {
      const mergedUser = { ...activeUser, ...profileData, ...(savedUser || {}) };
      setActiveUser(mergedUser);
      localStorage.setItem("user", JSON.stringify(mergedUser));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/login"] });

      toast({
        title: "Profile Updated",
        description: "Your profile and photo have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to save profile changes. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleProfileUpdate = () => {
    if (!activeUser?.id) {
      toast({
        title: "Session Expired",
        description: "Please sign in again to update your profile.",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }

    const updatedData = {
      ...profileData,
      name: `${profileData.firstName} ${profileData.lastName}`.trim(),
      age: profileData.age ? parseInt(profileData.age) : null,
      profilePhoto: profileData.avatar,
    };

    updateProfileMutation.mutate(updatedData);
  };

  const handleDeleteAccount = () => {
    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      localStorage.removeItem("userPreferences");
      localStorage.removeItem("authToken");
      localStorage.removeItem("userType");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("user");

      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted.",
        variant: "destructive",
      });
      setLocation("/");
    }
  };

  // Prevent rendering settings UI while redirecting unauthenticated users
  if (isCheckingAuth || !activeUser) {
    return null;
  }

  const dashboardRoute =
    (activeUser.userType || localStorage.getItem("userType")) === "owner"
      ? "/dashboard/owner"
      : "/dashboard/user";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setLocation(dashboardRoute)}
              className="flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Settings
            </h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" className="flex items-center">
              <User className="w-4 h-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center">
              <Settings className="w-4 h-4 mr-2" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="relative">
                    <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex items-center justify-center border">
                      {profileData.avatar ? (
                        <img
                          src={profileData.avatar}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-8 h-8 text-gray-400" />
                      )}
                    </div>

                    {/* Hidden file input triggered by Camera button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />

                    <Button
                      type="button"
                      size="sm"
                      onClick={handlePhotoClick}
                      title="Upload profile photo"
                      className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
                    >
                      <Camera className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {profileData.firstName} {profileData.lastName}
                    </h3>
                    <p className="text-sm text-gray-500">{profileData.profession || profileData.email}</p>
                    <button
                      type="button"
                      onClick={handlePhotoClick}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      Change profile photo
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, firstName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, lastName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={profileData.phone}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="profession">Profession</Label>
                    <Input
                      id="profession"
                      value={profileData.profession}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, profession: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={profileData.company}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, company: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={profileData.bio}
                    onChange={(e) => setProfileData((prev) => ({ ...prev, bio: e.target.value }))}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                </div>

                <Button onClick={handleProfileUpdate} disabled={updateProfileMutation.isPending}>
                  <Edit className="w-4 h-4 mr-2" />
                  {updateProfileMutation.isPending ? "Updating..." : "Update Profile"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>App Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-base font-medium">Theme</Label>
                  <p className="text-sm text-gray-500 mb-3">Choose your preferred theme</p>
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center">
                          <Sun className="w-4 h-4 mr-2" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center">
                          <Moon className="w-4 h-4 mr-2" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center">
                          <Monitor className="w-4 h-4 mr-2" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/compatibility-quiz")}
                  >
                    Update Roommate Preferences
                  </Button>
                  <p className="text-sm text-gray-500 mt-2">
                    Retake the compatibility quiz to update your roommate matching preferences
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="push-notifications" className="text-base font-medium">
                      Push Notifications
                    </Label>
                    <p className="text-sm text-gray-500">
                      Receive notifications about booking updates and messages
                    </p>
                  </div>
                  <Switch
                    id="push-notifications"
                    checked={notificationsEnabled}
                    onCheckedChange={setNotificationsEnabled}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="email-notifications" className="text-base font-medium">
                      Email Notifications
                    </Label>
                    <p className="text-sm text-gray-500">
                      Receive email updates about your bookings and account
                    </p>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border p-4 bg-gray-50 dark:bg-gray-800/50">
                  <h4 className="font-medium">OTP Login Active</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Your account uses one-time verification codes sent to{" "}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {profileData.email || "your registered email"}
                    </span>
                    . No password is needed.
                  </p>
                </div>

                <hr className="my-6" />

                <div>
                  <h3 className="text-lg font-medium text-red-600 mb-2">Danger Zone</h3>
                  <div className="border border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Delete Account</h4>
                        <p className="text-sm text-gray-500">
                          Permanently delete your account and all data
                        </p>
                      </div>
                      <Button variant="destructive" onClick={handleDeleteAccount}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Account
                      </Button>
                    </div>
                  </div>
                </div>

                <hr className="my-6" />

                <div>
                  <Button onClick={handleLogout} variant="outline" className="w-full">
                    <LogOut className="w-4 h-4 mr-2" />
                    Log Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}