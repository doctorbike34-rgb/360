import React from 'react';
import { motion } from 'motion/react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({ className = '', showText = true, size = 'md' }) => {
  const sizes = {
    sm: { height: 'h-8', iconW: 60, text: 'text-2xl', mt: '-mt-1' },
    md: { height: 'h-12', iconW: 90, text: 'text-4xl', mt: '-mt-2' },
    lg: { height: 'h-16', iconW: 120, text: 'text-5xl', mt: '-mt-2.5' },
    xl: { height: 'h-24', iconW: 180, text: 'text-7xl', mt: '-mt-4' }
  };

  const currentSize = sizes[size];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Precision Vector Replica of the custom bike logo */}
      <motion.svg 
        width={currentSize.iconW} 
        viewBox="0 0 125 75" 
        fill="none" 
        className="text-primary drop-shadow-sm cursor-pointer"
        xmlns="http://www.w3.org/2000/svg"
        initial="hidden"
        animate="visible"
        whileHover="hover"
        whileTap="tap"
        variants={{
          hidden: { opacity: 0, scale: 0.9, x: -10 },
          visible: { 
            opacity: 1, 
            scale: 1, 
            x: 0, 
            transition: { duration: 0.5, ease: "easeOut", staggerChildren: 0.15 } 
          },
          hover: { 
            scale: 1.05, 
            rotate: -2, 
            transition: { type: "spring", stiffness: 300, damping: 10 } 
          },
          tap: { scale: 0.95 }
        }}
      >
        <g stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          {/* Back Wheel (d-shape) */}
          <motion.path 
            variants={{
              hidden: { pathLength: 0, opacity: 0 },
              visible: { pathLength: 1, opacity: 1, transition: { duration: 0.8, ease: "easeInOut" } }
            }}
            d="M 17 30 L 50 30 L 40 47.5 A 15 15 0 1 0 30 65" 
          />
          
          {/* Front Wheel (b-shape) */}
          <motion.path 
            variants={{
              hidden: { pathLength: 0, opacity: 0 },
              visible: { pathLength: 1, opacity: 1, transition: { duration: 0.8, ease: "easeInOut" } }
            }}
            d="M 37 17 L 70 17 L 82.5 41 A 15 15 0 1 1 95 65" 
          />
        </g>
        
        {/* Rider Head */}
        <motion.circle 
          variants={{
            hidden: { scale: 0, opacity: 0 },
            visible: { scale: 1, opacity: 1, transition: { duration: 0.4, type: "spring", bounce: 0.6 } },
            hover: { y: -2, x: 2, transition: { repeat: Infinity, repeatType: "mirror", duration: 0.3 } }
          }}
          cx="78" cy="12" r="7" fill="currentColor" 
        />
      </motion.svg>
      
      {showText && (
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.6, ease: "easeOut" } }
          }}
          className={`flex flex-col items-center justify-center ${currentSize.mt}`}
        >
          <div className="flex items-baseline">
            <span 
              className={`${currentSize.text} font-black tracking-tighter text-primary`}
              style={{ fontFamily: "'Comfortaa', cursive", paddingRight: '0.05em' }}
            >
              doctorbike
            </span>
          </div>
          <div className="flex items-center gap-2 w-full -mt-1 opacity-90">
            <div className="h-[1px] flex-1 bg-primary/40" />
            <span 
              className="font-black uppercase tracking-[0.4em] text-primary"
              style={{ fontSize: size === 'sm' ? '0.45rem' : size === 'md' ? '0.6rem' : size === 'lg' ? '0.75rem' : '1rem' }}
            >
              ITALIA
            </span>
            <div className="h-[1px] flex-1 bg-primary/40 text-transparent">_</div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
