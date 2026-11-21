import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Page not found</h1>
          </div>
          <p className="mt-4 mb-6 text-sm text-gray-600 dark:text-gray-400">
            The page you are looking for does not exist or has moved.
          </p>
          <Link href="/">
            <Button>Back to Home</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
