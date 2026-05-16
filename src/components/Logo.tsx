import React, { useState } from 'react';
import { motion } from 'motion/react';

interface LogoProps {
  className?: string;
  showText?: boolean; // Kept for compatibility but we might not need it if the image has text
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const [hasError, setHasError] = useState(false);

  const sizes = {
    sm: 'h-8 md:h-10',
    md: 'h-12 md:h-16',
    lg: 'h-16 md:h-20',
    xl: 'h-24 md:h-32'
  };

  const currentHeight = sizes[size];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {hasError ? (
        <div className="text-xs text-center border-2 border-dashed border-primary p-2 rounded text-primary font-bold">
          Carica l'immagine come<br/> /public/logo.png
        </div>
      ) : (
        <motion.img
        src="/logo.png"
        alt="DoctorBike Italia Logo"
        className={`w-auto object-contain drop-shadow-sm cursor-pointer ${currentHeight}`}
        initial="hidden"
        animate="visible"
        whileHover="hover"
        whileTap="tap"
        variants={{
          hidden: { opacity: 0, scale: 0.95 },
          visible: { 
            opacity: 1, 
            scale: 1, 
            transition: { duration: 0.5, ease: "easeOut" } 
          },
          hover: { 
            scale: 1.05, 
            transition: { type: "spring", stiffness: 300, damping: 10 } 
          },
          tap: { scale: 0.95 }
        }}
          onError={() => {
            // Se non trova logo.png, mostra un messaggio che richiede il caricamento
            setHasError(true);
          }}
        />
      )}
    </div>
  );
};

