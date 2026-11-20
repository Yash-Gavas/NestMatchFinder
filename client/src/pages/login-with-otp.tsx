import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import Logo from "@/components/logo";
import { Mail, ArrowRight, ArrowLeft, AlertCircle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function LoginWithOtp() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState<"user" | "owner">("user");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Enter your email address to receive a code.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), userType }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || data.hint || "Failed to send OTP");
      }

      toast({
        title: "OTP sent",
        description:
          "Check your inbox. If this is the first time, also check your spam/junk folder.",
      });
      setStep("otp");
    } catch (err: any) {
      toast({
        title: "Could not send OTP",
        description: err.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim().length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code from your email.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: otp.trim(),
          userType,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Invalid or expired OTP");
      }

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userType", data.user?.userType || userType);
      localStorage.setItem("userEmail", data.user?.email || email);
      localStorage.setItem("user", JSON.stringify(data.user));

      toast({
        title: "Login successful",
        description: "Welcome to NestMatch!",
      });

      const role = data.user?.userType || userType;
      setLocation(role === "owner" ? "/dashboard/owner" : "/dashboard/user");
    } catch (err: any) {
      toast({
        title: "Verification failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setOtp("");
    await handleSendOtp();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Logo size="lg" showText={true} />
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Login with OTP
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Quick and secure login — no password needed
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            {step === "email" && (
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">I am a</Label>
                  <RadioGroup
                    value={userType}
                    onValueChange={(v) => setUserType(v as "user" | "owner")}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="user" id="otp-user" />
                      <Label htmlFor="otp-user">Student / Tenant</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="owner" id="otp-owner" />
                      <Label htmlFor="otp-owner">PG Owner</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                  />
                </div>

                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-100">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    <strong>First time?</strong> Check your spam or junk folder
                    for the OTP email — it can land there on the first send.
                  </p>
                </div>

                <Button
                  onClick={handleSendOtp}
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send OTP"}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>

              </div>
            )}

            {step === "otp" && (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                  }}
                  className="mb-2"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Enter the 6-digit code sent to
                  </p>
                  <p className="font-medium text-gray-900 dark:text-white mb-4">
                    {email}
                  </p>

                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-100 text-left mb-4">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                      Can&apos;t find the email? Check your{" "}
                      <strong>spam / junk</strong> folder — especially the first
                      time you request an OTP.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="otp">Verification code</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="000000"
                      className="text-center text-lg tracking-widest"
                      maxLength={6}
                      autoComplete="one-time-code"
                      onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleVerifyOtp}
                  className="w-full"
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? "Verifying..." : "Verify & Login"}
                </Button>

                <Button
                  variant="link"
                  className="w-full text-sm"
                  onClick={handleResend}
                  disabled={loading}
                >
                  Resend OTP
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
