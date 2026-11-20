// @ts-nocheck
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [userType, setUserType] = useState<'user' | 'owner'>('user');
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, userType }),
      });

      const responseData = await response.json();

      if (response.ok) {
        // If backend directly logs in after signup
        if (responseData.token) {
          localStorage.setItem('authToken', responseData.token);
          localStorage.setItem('userType', userType);
          localStorage.setItem('userEmail', formData.email);
          localStorage.setItem('user', JSON.stringify(responseData.user));

          toast({
            title: "Account Created",
            description: "Welcome to NestMatch! Your account has been created successfully.",
          });

          setLocation(userType === 'owner' ? '/dashboard/owner' : '/dashboard/user');
        } else {
          // Move to OTP verification step
          setStep('otp');
          toast({
            title: "OTP Sent",
            description: `Please enter the verification code sent to ${formData.email}.`,
          });
        }
      } else {
        throw new Error(responseData.message || 'Signup failed');
      }
    } catch (error: any) {
      toast({
        title: "Signup Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          otp,
          userType,
        }),
      });

      const responseData = await response.json();

      if (response.ok) {
        localStorage.setItem('authToken', responseData.token);
        localStorage.setItem('userType', userType);
        localStorage.setItem('userEmail', formData.email);
        localStorage.setItem('user', JSON.stringify(responseData.user));

        toast({
          title: "Account Created",
          description: "Welcome to NestMatch! Your account has been created successfully.",
        });

        setLocation(userType === 'owner' ? '/dashboard/owner' : '/dashboard/user');
      } else {
        throw new Error(responseData.message || 'Invalid OTP');
      }
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid or expired OTP",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Create your account</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Join thousands of satisfied users
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            {/* User Type Selection */}
            <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 mb-6">
              <Button
                type="button"
                variant={userType === 'user' ? 'default' : 'ghost'}
                onClick={() => setUserType('user')}
                className="flex-1"
              >
                I'm looking for PG
              </Button>
              <Button
                type="button"
                variant={userType === 'owner' ? 'default' : 'ghost'}
                onClick={() => setUserType('owner')}
                className="flex-1"
              >
                I'm a PG Owner
              </Button>
            </div>

            {step === 'details' ? (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" required />
                  <label htmlFor="terms" className="text-sm text-gray-900 dark:text-gray-100">
                    I agree to the{" "}
                    <Button type="button" variant="link" className="p-0 h-auto text-primary">
                      Terms of Service
                    </Button>{" "}
                    and{" "}
                    <Button type="button" variant="link" className="p-0 h-auto text-primary">
                      Privacy Policy
                    </Button>
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="otp">Enter Verification OTP</Label>
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto text-xs"
                      onClick={() => {
                        setStep('details');
                        setOtp("");
                      }}
                    >
                      Edit details
                    </Button>
                  </div>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    OTP sent to {formData.email}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || otp.length < 4}
                >
                  {isSubmitting ? "Verifying..." : "Verify & Complete Signup"}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Already have an account?{" "}
                <Link href="/login">
                  <Button type="button" variant="link" className="p-0 h-auto font-medium">
                    Sign in
                  </Button>
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}