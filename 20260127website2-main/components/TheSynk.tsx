import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export const TheSynk: React.FC = () => {
  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center p-8 max-w-3xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="space-y-10 text-center flex flex-col items-center"
      >
        <img 
          src="/synk-icon.png" 
          alt="the synk app icon" 
          className="w-32 h-32 rounded-[28px] shadow-lg shadow-white/10"
        />

        <h1 className="text-4xl md:text-5xl text-white font-light">the synk</h1>

        <p className="text-lg md:text-xl text-gray-400 font-light max-w-md">
          coming soon to the App Store
        </p>

        <a 
          href="#" 
          onClick={(e) => e.preventDefault()}
          className="inline-block opacity-50 cursor-not-allowed"
          title="Available when the app is published"
        >
          <img
            src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83"
            alt="Download on the App Store"
            className="h-14"
          />
        </a>

        <div className="flex gap-8 pt-4">
          <Link
            to="/thesynk/support"
            className="text-lg text-gray-400 hover:text-white transition-colors duration-300 border-b border-red-900/50 pb-1"
          >
            support
          </Link>
          <Link
            to="/thesynk/privacy"
            className="text-lg text-gray-400 hover:text-white transition-colors duration-300 border-b border-red-900/50 pb-1"
          >
            privacy policy
          </Link>
        </div>
      </motion.div>
    </div>
  );
};
