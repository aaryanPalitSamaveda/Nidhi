// import React, { useState, useEffect } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import ChatWindow from './ChatWindow';
// import { ChatIcon, SparkleIcon } from '../Icons/Icons';
// import { useAuth } from '@/contexts/AuthContext';

// // Helper to safely get vaultId from URL
// const getVaultIdFromURL = (): string | null => {
//   const path = window.location.pathname;
  
//   const patterns = [
//     /\/admin\/vaults\/([a-zA-Z0-9-]+)/,
//     /\/client\/vault\/([a-zA-Z0-9-]+)/,
//     /\/vaults\/([a-zA-Z0-9-]+)/,
//   ];

//   for (const pattern of patterns) {
//     const match = path.match(pattern);
//     if (match && match[1]) {
//       return match[1];
//     }
//   }

//   return null;
// };

// const ChatWidget: React.FC = () => {
//   const [isOpen, setIsOpen] = useState<boolean>(false);
//   const [hasNewMessage, setHasNewMessage] = useState<boolean>(true);
//   const [currentVaultId, setCurrentVaultId] = useState<string | null>(getVaultIdFromURL());
//   const { user } = useAuth();

//   // Listen for URL changes (for SPA navigation)
//   useEffect(() => {
//     const handleUrlChange = () => {
//       const newVaultId = getVaultIdFromURL();
//       if (newVaultId !== currentVaultId) {
//         console.log('🔄 Vault changed:', currentVaultId, '→', newVaultId);
//         setCurrentVaultId(newVaultId);
//         // Close chat when vault changes so it reopens fresh
//         if (isOpen) {
//           setIsOpen(false);
//         }
//       }
//     };

//     // Check URL periodically (handles SPA navigation)
//     const interval = setInterval(handleUrlChange, 500);
    
//     // Also listen for popstate (browser back/forward)
//     window.addEventListener('popstate', handleUrlChange);

//     return () => {
//       clearInterval(interval);
//       window.removeEventListener('popstate', handleUrlChange);
//     };
//   }, [currentVaultId, isOpen]);

//   const toggleChat = (): void => {
//     if (!isOpen) {
//       // Refresh vaultId when opening chat
//       const newVaultId = getVaultIdFromURL();
//       setCurrentVaultId(newVaultId);
//       console.log('💬 Opening chat for vault:', newVaultId);
//     }
//     setIsOpen(!isOpen);
//     setHasNewMessage(false);
//   };

//   return (
//     <div className="fixed bottom-6 right-6 z-50">
//       <AnimatePresence mode="wait">
//         {isOpen ? (
//           <motion.div
//             key="chat-window"
//             initial={{ opacity: 0, scale: 0.8, y: 20 }}
//             animate={{ opacity: 1, scale: 1, y: 0 }}
//             exit={{ opacity: 0, scale: 0.8, y: 20 }}
//             transition={{ type: 'spring', damping: 25, stiffness: 300 }}
//             className="w-[400px] h-[600px] sm:w-[420px]"
//           >
//             {/* Pass userId AND vaultId to ChatWindow */}
//             <ChatWindow 
//               onClose={() => setIsOpen(false)} 
//               userId={user?.id} 
//               vaultId={currentVaultId}  // 👈 NEW: Pass current vault
//             />
//           </motion.div>
//         ) : (
//           <motion.button
//             key="chat-button"
//             initial={{ scale: 0 }}
//             animate={{ scale: 1 }}
//             exit={{ scale: 0 }}
//             whileHover={{ scale: 1.1 }}
//             whileTap={{ scale: 0.9 }}
//             onClick={toggleChat}
//             className="relative group cursor-pointer"
//           >
//             {/* Pulse Ring */}
//             <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-30" />
            
//             {/* Main Button */}
//             <div className="relative w-16 h-16 bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 
//                           rounded-full shadow-lg flex items-center justify-center
//                           transform transition-all duration-300
//                           hover:shadow-xl hover:from-amber-600 hover:to-yellow-600">
//               <ChatIcon className="w-7 h-7 text-white" />
//               <SparkleIcon className="absolute -top-1 -right-1 w-5 h-5 text-yellow-300 animate-bounce" />
//             </div>

//             {/* Vault Indicator - shows when on a vault page */}
//             {currentVaultId && (
//               <span className="absolute -bottom-1 -left-1 w-4 h-4 bg-green-500 rounded-full 
//                              flex items-center justify-center border-2 border-white shadow-lg"
//                     title="Vault-specific chat active">
//                 <span className="w-2 h-2 bg-white rounded-full" />
//               </span>
//             )}

//             {/* New Message Badge */}
//             {hasNewMessage && (
//               <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full 
//                              flex items-center justify-center text-white text-xs font-bold
//                              animate-bounce shadow-lg">
//                 1
//               </span>
//             )}

//             {/* Tooltip */}
//             <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 
//                           transition-opacity duration-200 pointer-events-none">
//               <div className="bg-slate-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
//                 {currentVaultId ? 'Ask about this vault\'s documents' : 'Ask about your documents'}
//                 <div className="absolute bottom-0 right-4 transform translate-y-1/2 rotate-45 
//                               w-2 h-2 bg-slate-800" />
//               </div>
//             </div>
//           </motion.button>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// };

// export default ChatWidget;

// import React, { useState, useEffect } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import ChatWindow from './ChatWindow';
// import { ChatIcon, SparkleIcon } from '../Icons/Icons';
// import { useAuth } from '@/contexts/AuthContext';

// // Helper to safely get vaultId from URL
// const getVaultIdFromURL = (): string | null => {
//   const path = window.location.pathname;
  
//   // If on dashboard or other non-vault pages, return null
//   if (path === '/dashboard' || 
//       path === '/admin/dashboard' || 
//       path === '/client/dashboard' ||
//       path === '/' ||
//       !path.includes('vault')) {
//     return null;
//   }
  
//   const patterns = [
//     /\/admin\/vaults\/([a-zA-Z0-9-]+)/,
//     /\/client\/vault\/([a-zA-Z0-9-]+)/,
//     /\/vaults\/([a-zA-Z0-9-]+)/,
//   ];

//   for (const pattern of patterns) {
//     const match = path.match(pattern);
//     if (match && match[1]) {
//       return match[1];
//     }
//   }

//   return null;
// };

// const ChatWidget: React.FC = () => {
//   const [isOpen, setIsOpen] = useState<boolean>(false);
//   const [hasNewMessage, setHasNewMessage] = useState<boolean>(true);
//   const [currentVaultId, setCurrentVaultId] = useState<string | null>(getVaultIdFromURL());
//   const { user } = useAuth();

//   // Listen for URL changes (for SPA navigation)
//   useEffect(() => {
//     const handleUrlChange = () => {
//       const newVaultId = getVaultIdFromURL();
//       if (newVaultId !== currentVaultId) {
//         console.log('🔄 Vault changed:', currentVaultId, '→', newVaultId);
//         setCurrentVaultId(newVaultId);
//         // Close chat when vault changes so it reopens fresh
//         if (isOpen) {
//           setIsOpen(false);
//         }
//       }
//     };

//     // Check URL periodically (handles SPA navigation)
//     const interval = setInterval(handleUrlChange, 500);
    
//     // Also listen for popstate (browser back/forward)
//     window.addEventListener('popstate', handleUrlChange);

//     return () => {
//       clearInterval(interval);
//       window.removeEventListener('popstate', handleUrlChange);
//     };
//   }, [currentVaultId, isOpen]);

//   const toggleChat = (): void => {
//     if (!isOpen) {
//       // Refresh vaultId when opening chat
//       const newVaultId = getVaultIdFromURL();
//       setCurrentVaultId(newVaultId);
//       console.log('💬 Opening chat for vault:', newVaultId);
//     }
//     setIsOpen(!isOpen);
//     setHasNewMessage(false);
//   };

//   return (
//     <div className="fixed bottom-6 right-6 z-50">
//       <AnimatePresence mode="wait">
//         {isOpen ? (
//           <motion.div
//             key="chat-window"
//             initial={{ opacity: 0, scale: 0.8, y: 20 }}
//             animate={{ opacity: 1, scale: 1, y: 0 }}
//             exit={{ opacity: 0, scale: 0.8, y: 20 }}
//             transition={{ type: 'spring', damping: 25, stiffness: 300 }}
//             className="w-[400px] h-[600px] sm:w-[420px]"
//           >
//             {/* Pass userId AND vaultId to ChatWindow */}
//             <ChatWindow 
//               onClose={() => setIsOpen(false)} 
//               userId={user?.id} 
//               vaultId={currentVaultId}  // 👈 NEW: Pass current vault
//             />
//           </motion.div>
//         ) : (
//           <motion.button
//             key="chat-button"
//             initial={{ scale: 0 }}
//             animate={{ scale: 1 }}
//             exit={{ scale: 0 }}
//             whileHover={{ scale: 1.1 }}
//             whileTap={{ scale: 0.9 }}
//             onClick={toggleChat}
//             className="relative group cursor-pointer"
//           >
//             {/* Pulse Ring */}
//             <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-30" />
            
//             {/* Main Button */}
//             <div className="relative w-16 h-16 bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 
//                           rounded-full shadow-lg flex items-center justify-center
//                           transform transition-all duration-300
//                           hover:shadow-xl hover:from-amber-600 hover:to-yellow-600">
//               <ChatIcon className="w-7 h-7 text-white" />
//               <SparkleIcon className="absolute -top-1 -right-1 w-5 h-5 text-yellow-300 animate-bounce" />
//             </div>

//             {/* Vault Indicator - shows when on a vault page */}
//             {currentVaultId && (
//               <span className="absolute -bottom-1 -left-1 w-4 h-4 bg-green-500 rounded-full 
//                              flex items-center justify-center border-2 border-white shadow-lg"
//                     title="Vault-specific chat active">
//                 <span className="w-2 h-2 bg-white rounded-full" />
//               </span>
//             )}

//             {/* New Message Badge */}
//             {hasNewMessage && (
//               <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full 
//                              flex items-center justify-center text-white text-xs font-bold
//                              animate-bounce shadow-lg">
//                 1
//               </span>
//             )}

//             {/* Tooltip */}
//             <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 
//                           transition-opacity duration-200 pointer-events-none">
//               <div className="bg-slate-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
//                 {currentVaultId ? 'Ask about this vault\'s documents' : 'Ask about your documents'}
//                 <div className="absolute bottom-0 right-4 transform translate-y-1/2 rotate-45 
//                               w-2 h-2 bg-slate-800" />
//               </div>
//             </div>
//           </motion.button>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// };

// export default ChatWidget;

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ChatWindow from './ChatWindow';
import { ChatIcon, SparkleIcon } from '../Icons/Icons';
import { useAuth } from '@/contexts/AuthContext';

// Helper to safely get vaultId from URL
const getVaultIdFromURL = (): string | null => {
  const path = window.location.pathname;
  
  // If on dashboard or other non-vault pages, return null
  if (path === '/dashboard' || 
      path === '/admin/dashboard' || 
      path === '/client/dashboard' ||
      path === '/') {
    return null;
  }
  
  // Check if path contains 'vault' 
  if (!path.includes('vault')) {
    return null;
  }
  
  const patterns = [
    /\/admin\/vaults\/([a-zA-Z0-9-]+)/,    // /admin/vaults/:id
    /\/client\/vault\/([a-zA-Z0-9-]+)/,    // /client/vault/:id
    /\/vaults\/([a-zA-Z0-9-]+)/,           // /vaults/:id
    /^\/vault\/([a-zA-Z0-9-]+)/,           // /vault/:id (CLIENT - this is the key one!)
  ];

  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match && match[1]) {
      console.log('✅ Vault detected:', match[1]);
      return match[1];
    }
  }

  return null;
};

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [hasNewMessage, setHasNewMessage] = useState<boolean>(true);
  const [currentVaultId, setCurrentVaultId] = useState<string | null>(getVaultIdFromURL());
  const { user } = useAuth();

  // Listen for URL changes (for SPA navigation)
  useEffect(() => {
    const handleUrlChange = () => {
      const newVaultId = getVaultIdFromURL();
      if (newVaultId !== currentVaultId) {
        console.log('🔄 Vault changed:', currentVaultId, '→', newVaultId);
        setCurrentVaultId(newVaultId);
        // Close chat when vault changes so it reopens fresh
        if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    // Check URL periodically (handles SPA navigation)
    const interval = setInterval(handleUrlChange, 500);
    
    // Also listen for popstate (browser back/forward)
    window.addEventListener('popstate', handleUrlChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [currentVaultId, isOpen]);

  const toggleChat = (): void => {
    if (!isOpen) {
      // Refresh vaultId when opening chat
      const newVaultId = getVaultIdFromURL();
      setCurrentVaultId(newVaultId);
      console.log('💬 Opening chat for vault:', newVaultId);
    }
    setIsOpen(!isOpen);
    setHasNewMessage(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence mode="wait">
        {isOpen ? (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-[400px] h-[600px] sm:w-[420px]"
          >
            {/* Pass userId AND vaultId to ChatWindow */}
            <ChatWindow 
              onClose={() => setIsOpen(false)} 
              userId={user?.id} 
              vaultId={currentVaultId}
            />
          </motion.div>
        ) : (
          <motion.button
            key="chat-button"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleChat}
            className="relative group cursor-pointer"
          >
            {/* Pulse Ring */}
            <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-30" />
            
            {/* Main Button */}
            <div className="relative w-16 h-16 bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 
                          rounded-full shadow-lg flex items-center justify-center
                          transform transition-all duration-300
                          hover:shadow-xl hover:from-amber-600 hover:to-yellow-600">
              <ChatIcon className="w-7 h-7 text-white" />
              <SparkleIcon className="absolute -top-1 -right-1 w-5 h-5 text-yellow-300 animate-bounce" />
            </div>

            {/* Vault Indicator - shows when on a vault page */}
            {currentVaultId && (
              <span className="absolute -bottom-1 -left-1 w-4 h-4 bg-green-500 rounded-full 
                             flex items-center justify-center border-2 border-white shadow-lg"
                    title="Vault-specific chat active">
                <span className="w-2 h-2 bg-white rounded-full" />
              </span>
            )}

            {/* New Message Badge */}
            {hasNewMessage && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full 
                             flex items-center justify-center text-white text-xs font-bold
                             animate-bounce shadow-lg">
                1
              </span>
            )}

            {/* Tooltip */}
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 
                          transition-opacity duration-200 pointer-events-none">
              <div className="bg-slate-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                {currentVaultId ? 'Ask about this vault\'s documents' : 'Ask about your documents'}
                <div className="absolute bottom-0 right-4 transform translate-y-1/2 rotate-45 
                              w-2 h-2 bg-slate-800" />
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatWidget;