import React from 'react';
import { motion, Variants } from 'framer-motion';

export const Home: React.FC = () => {
  // Animation settings
  const wordFadeIn: Variants = {
    hidden: { opacity: 0, filter: 'blur(10px)' },
    visible: (delay: number) => ({ 
      opacity: 1, 
      filter: 'blur(0px)',
      transition: { duration: 1.5, ease: "easeInOut", delay } 
    })
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4">
      <h1 className="text-4xl md:text-6xl lg:text-7xl font-normal tracking-wide text-center leading-tight">
        <motion.span 
          custom={0.5}
          initial="hidden"
          animate="visible"
          variants={wordFadeIn}
          className="inline-block mr-3 md:mr-6"
        >
          what
        </motion.span>
        
        <motion.span 
          custom={2.0}
          initial="hidden"
          animate="visible"
          variants={wordFadeIn}
          className="inline-block mr-3 md:mr-6"
        >
          is
        </motion.span>
        
        <motion.span 
          custom={3.5}
          initial="hidden"
          animate="visible"
          variants={wordFadeIn}
          className="inline-block text-red-900 font-medium mr-3 md:mr-6"
        >
          {`{your name}`}
        </motion.span>

        <motion.span 
          custom={5.0}
          initial="hidden"
          animate="visible"
          variants={wordFadeIn}
          className="inline-block"
        >
          ?
        </motion.span>
      </h1>
    </div>
  );
};
