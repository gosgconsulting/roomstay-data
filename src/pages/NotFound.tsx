import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted relative">
      <ThemeToggle className="fixed top-4 right-4 z-50" />
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
