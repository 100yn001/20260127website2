import React from 'react';
import { motion } from 'framer-motion';

export const About: React.FC = () => {
  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center p-8 max-w-3xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="space-y-8 text-center"
      >
        <h2 className="text-sm md:text-base tracking-[0.3em] uppercase text-red-900 mb-4 inline-block">
          est 2025
        </h2>
        
        <p className="text-xl md:text-3xl text-white font-light">
          contact: contact@yourname.media
        </p>
      </motion.div>
    </div>
  );
};
