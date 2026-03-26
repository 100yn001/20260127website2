import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NavLink: React.FC<{ to: string; currentPath: string; label: string; onClick?: () => void }> = ({ to, currentPath, label, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className={clsx(
      "relative px-2 py-1 transition-colors duration-300 outline-none focus:outline-none",
      currentPath === to ? "text-white" : "text-gray-500 hover:text-gray-300"
    )}
  >
    {label}
    {currentPath === to && (
      <motion.div
        layoutId="underline"
        className="absolute bottom-0 left-0 w-full h-[1px] bg-red-800"
      />
    )}
  </Link>
);

export const Navbar: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { to: '/', label: 'home' },
    { to: '/about', label: 'about' },
    { to: '/support', label: 'support' },
    { to: '/privacy', label: 'privacy' },
  ];

  return (
    <>
      {/* Desktop nav */}
      <nav className="fixed top-0 left-0 w-full z-50 p-6 hidden md:flex justify-end items-center mix-blend-difference">
        <div className="flex gap-8 text-lg italic">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} currentPath={currentPath} label={link.label} />
          ))}
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

      {/* Mobile hamburger button */}
      <button
        className="fixed top-5 right-5 z-[60] md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 mix-blend-difference outline-none focus:outline-none"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <motion.span
          animate={mobileOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
          className="block w-6 h-[1.5px] bg-white"
        />
        <motion.span
          animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
          className="block w-6 h-[1.5px] bg-white"
        />
        <motion.span
          animate={mobileOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
          className="block w-6 h-[1.5px] bg-white"
        />
      </button>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-8 text-2xl italic md:hidden"
          >
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} currentPath={currentPath} label={link.label} onClick={() => setMobileOpen(false)} />
            ))}
            <a
              href="/app"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2 bg-red-900 text-white rounded-full transition-opacity duration-300 hover:opacity-80 outline-none focus:outline-none not-italic text-lg"
              onClick={() => setMobileOpen(false)}
            >
              try the app
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
