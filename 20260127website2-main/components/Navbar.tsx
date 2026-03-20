import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <nav className="fixed top-0 left-0 w-full z-50 p-6 flex justify-end items-center mix-blend-difference">
      <div className="flex gap-8 text-lg italic">
        <Link 
          to="/"
          className={clsx(
            "relative px-2 py-1 transition-colors duration-300 outline-none focus:outline-none",
            currentPath === '/' ? "text-white" : "text-gray-500 hover:text-gray-300"
          )}
        >
          home
          {currentPath === '/' && (
            <motion.div 
              layoutId="underline" 
              className="absolute bottom-0 left-0 w-full h-[1px] bg-red-800"
            />
          )}
        </Link>
        <Link 
          to="/about"
          className={clsx(
            "relative px-2 py-1 transition-colors duration-300 outline-none focus:outline-none",
            currentPath === '/about' ? "text-white" : "text-gray-500 hover:text-gray-300"
          )}
        >
          about
          {currentPath === '/about' && (
            <motion.div 
              layoutId="underline" 
              className="absolute bottom-0 left-0 w-full h-[1px] bg-red-800"
            />
          )}
        </Link>
        <Link 
          to="/support"
          className={clsx(
            "relative px-2 py-1 transition-colors duration-300 outline-none focus:outline-none",
            currentPath === '/support' ? "text-white" : "text-gray-500 hover:text-gray-300"
          )}
        >
          support
          {currentPath === '/support' && (
            <motion.div 
              layoutId="underline" 
              className="absolute bottom-0 left-0 w-full h-[1px] bg-red-800"
            />
          )}
        </Link>
        <Link 
          to="/privacy"
          className={clsx(
            "relative px-2 py-1 transition-colors duration-300 outline-none focus:outline-none",
            currentPath === '/privacy' ? "text-white" : "text-gray-500 hover:text-gray-300"
          )}
        >
          privacy
          {currentPath === '/privacy' && (
            <motion.div 
              layoutId="underline" 
              className="absolute bottom-0 left-0 w-full h-[1px] bg-red-800"
            />
          )}
        </Link>
        <a
          href="/app"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1 bg-red-900 text-white rounded-full transition-opacity duration-300 hover:opacity-80 outline-none focus:outline-none not-italic"
        >
          try the app
        </a>
      </div>
    </nav>
  );
};
