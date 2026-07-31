import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { Link } from 'react-router-dom';

const wordFadeIn: Variants = {
  hidden: { opacity: 0, filter: 'blur(10px)' },
  visible: (delay: number) => ({
    opacity: 1,
    filter: 'blur(0px)',
    transition: { duration: 1.5, ease: 'easeInOut', delay }
  })
};

const letterLine: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.2, ease: 'easeOut' }
  }
};

export const About: React.FC = () => {
  const [phase, setPhase] = useState<'question' | 'letter'>('question');

  useEffect(() => {
    if (phase !== 'question') return;
    const t = setTimeout(() => setPhase('letter'), 8000);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-8 cursor-default"
      onClick={() => phase === 'question' && setPhase('letter')}
    >
      <AnimatePresence mode="wait">
        {phase === 'question' ? (
          <motion.h1
            key="question"
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
            className="text-4xl md:text-6xl lg:text-7xl font-normal tracking-wide text-center leading-tight"
          >
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
          </motion.h1>
        ) : (
          <motion.div
            key="letter"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.5, delayChildren: 0.3 } } }}
            className="max-w-md w-full text-left space-y-1"
          >
            <motion.p
              variants={letterLine}
              className="text-xl md:text-2xl text-gray-400 font-light leading-snug"
            >
              your scenarios, your characters,{' '}
              <span className="text-red-900 font-medium">your name</span>.
            </motion.p>
            <motion.div variants={letterLine}>
              <a
                href="/"
                className="group text-xl md:text-2xl font-light text-gray-400 hover:text-white transition-colors duration-300"
              >
                try the app{' '}
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
              </a>
            </motion.div>
            <motion.div variants={letterLine}>
              <a
                href="mailto:support@yourname.media"
                className="group text-xl md:text-2xl font-light text-gray-400 hover:text-white transition-colors duration-300"
              >
                support{' '}
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
              </a>
            </motion.div>
            <motion.div variants={letterLine}>
              <Link
                to="/privacy"
                className="group text-xl md:text-2xl font-light text-gray-400 hover:text-white transition-colors duration-300"
              >
                privacy policy{' '}
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
