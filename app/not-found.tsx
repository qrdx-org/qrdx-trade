"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import ParticlesBackground from "@/components/ParticlesBackground";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <ParticlesBackground />
      
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        <div className="space-y-8">
          {/* 404 Text */}
          <div className="space-y-4">
            <h1 className="text-9xl font-bold text-white opacity-90 tracking-tight">
              404
            </h1>
            <h2 className="text-3xl sm:text-4xl font-semibold text-white">
              Page Not Found
            </h2>
            <p className="text-lg text-gray-300 max-w-md mx-auto">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
            <Button
              asChild
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <Link href="/">
                Return to Home
              </Link>
            </Button>
            
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-2 border-white text-white hover:bg-white hover:text-black px-8 py-6 text-lg font-semibold rounded-lg transition-all duration-200"
            >
              <a 
                href="https://qrdx.org/support" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Message Support
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
