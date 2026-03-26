import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { io, Socket } from 'socket.io-client';
import { INFLUENCER_CATEGORIES, INFLUENCER_BLOCKS, GENERAL_CATEGORIES, GENERAL_BLOCKS, ALL_CATEGORIES, ALL_BLOCKS } from './constants';
import { Block, CategoryId, WorkMode, PromptSession, CustomCategory, CustomBlock, User, NewsItem, SavedPrompt } from './types';
import { generateCohesivePrompt, analyzeChatInput, suggestRelatedBlocks, analyzeImageForPrompt, PromptSegment, enhancePrompt, adaptPromptToModel } from './services/geminiService';
import { auth, db, signInWithGoogle, logOut, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, setDoc, deleteDoc, getDoc, updateDoc, where } from 'firebase/firestore';

export default function App() {
  const [selectedBlocks, setSelectedBlocks] = useState<Block[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>('result');
  const [workMode, setWorkMode] = useState<WorkMode>('prompting');
  
  // Prompt compilation state
  const [promptSegments, setPromptSegments] = useState<PromptSegment[]>([]);
  const [compiledPrompt, setCompiledPrompt] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  
  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [customInstructions, setCustomInstructions] = useState<string[]>([]);
  
  // Suggestions state
  const [suggestions, setSuggestions] = useState<Block[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionPage, setSuggestionPage] = useState(0);
  const SUGGESTIONS_PER_PAGE = 5;

  // Global Toggles
  const [isNsfwEnabled, setIsNsfwEnabled] = useState(false);
  const [isSubstitutionEnabled, setIsSubstitutionEnabled] = useState(false);
  const [showNsfwWarning, setShowNsfwWarning] = useState(false);

  // Languages
  const [outputLanguage, setOutputLanguage] = useState<'es' | 'en'>('en');

  // Undo History
  const [undoStack, setUndoStack] = useState<{blocks: Block[], instructions: string[]}[]>([]);

  // Banned Words
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [bannedWordInput, setBannedWordInput] = useState('');
  const [isBannedWordsLocked, setIsBannedWordsLocked] = useState(true);

  // Hover state for highlighting
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  // Mobile Sidebar State
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);

  // History & Favorites
  const [promptHistory, setPromptHistory] = useState<PromptSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [favoriteBlocks, setFavoriteBlocks] = useState<string[]>([]);
  const [showMoreCategory, setShowMoreCategory] = useState<CategoryId | null>(null);
  
  // Save History Modal
  const [showSaveHistoryModal, setShowSaveHistoryModal] = useState(false);
  const [saveHistoryTitle, setSaveHistoryTitle] = useState('');
  const [isGeneratingHistoryTitle, setIsGeneratingHistoryTitle] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryTitle, setEditingHistoryTitle] = useState('');

  // Custom Categories
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([]);
  const [editingCustomBlock, setEditingCustomBlock] = useState<string | null>(null);
  const [newCustomBlockTitle, setNewCustomBlockTitle] = useState('');
  const [newCustomBlockText, setNewCustomBlockText] = useState('');

  // Flow State
  const [flowStory, setFlowStory] = useState('');
  const [generatedStory, setGeneratedStory] = useState('');
  const [flowCount, setFlowCount] = useState(5);
  const [flowFinalPromptPosition, setFlowFinalPromptPosition] = useState<string>('-');
  const [generatedFlow, setGeneratedFlow] = useState<{title: string, description: string, prompt: string}[]>([]);
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false);

  // Recreation Clean State
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [cleanOptions, setCleanOptions] = useState<string[]>([]);
  const [originalRecreationPrompt, setOriginalRecreationPrompt] = useState<string | null>(null);
  const [isCleaningPrompt, setIsCleaningPrompt] = useState(false);

  // Community State
  const [communityFeed, setCommunityFeed] = useState([
    { id: '1', title: 'Cyberpunk Girl', prompt: 'cyberpunk aesthetic, neon lights, rainy street, 35mm lens', user: 'Mariano43', image: 'https://picsum.photos/seed/cyberpunk/100/100' },
    { id: '2', title: 'Vintage Portrait', prompt: 'vintage polaroid photo, film grain, direct flash photography, casual spontaneous', user: 'AnaPhoto', image: 'https://picsum.photos/seed/vintage/100/100' },
    { id: '3', title: 'Studio Fashion', prompt: 'professional studio, haute couture fashion photography, hard light, 85mm lens', user: 'StudioPro', image: 'https://picsum.photos/seed/studio/100/100' }
  ]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTitle, setShareTitle] = useState('');

  // Coworking State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [coworkingTopics, setCoworkingTopics] = useState<any[]>([]);
  const [activeTopic, setActiveTopic] = useState<any | null>(null);
  const [coworkingMessages, setCoworkingMessages] = useState<any[]>([]);
  const [coworkingInput, setCoworkingInput] = useState('');
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDescription, setNewTopicDescription] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [newNewsTitle, setNewNewsTitle] = useState('');
  const [newNewsContent, setNewNewsContent] = useState('');
  const [inviteInput, setInviteInput] = useState('');

  // Admin State
  const [adminTab, setAdminTab] = useState<'users' | 'news' | 'subs' | 'content'>('users');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedAdminUser, setSelectedAdminUser] = useState<User | null>(null);
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [showConfirmSubModal, setShowConfirmSubModal] = useState(false);
  const [pendingSubChange, setPendingSubChange] = useState<{userId: string, tier: 'free' | 'premium' | 'admin'} | null>(null);
  const [adminConfirmEmail, setAdminConfirmEmail] = useState('');
  const ADMIN_EMAIL = 'wanted123455a@gmail.com';

  // News State
  const [news, setNews] = useState<NewsItem[]>([]);
  const [unreadNewsCount, setUnreadNewsCount] = useState(0);
  const [lastViewedNewsDate, setLastViewedNewsDate] = useState<number>(0);
  const [sharePrompt, setSharePrompt] = useState('');
  const [shareImage, setShareImage] = useState('');
  
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [expandedPost, setExpandedPost] = useState<any | null>(null);

  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
  const [blockSearch, setBlockSearch] = useState('');

  // Target Model & Prompt Config
  const [targetModel, setTargetModel] = useState<string>('scenecraft');
  const [promptCharLimit, setPromptCharLimit] = useState<number>(2000);
  const [showSettings, setShowSettings] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [uiStyle, setUiStyle] = useState<'modern' | 'glass' | 'brutalist'>('modern');
  const [colorTheme, setColorTheme] = useState<'emerald' | 'blue' | 'purple' | 'rose' | 'amber'>('emerald');
  const [showTutorial, setShowTutorial] = useState(false);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('scenecraft_language') || 'es';
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('scenecraft_settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setTheme(settings.theme || 'dark');
      setUiStyle(settings.uiStyle || 'modern');
      setColorTheme(settings.colorTheme || 'emerald');
      setIsNsfwEnabled(settings.isNsfwEnabled || false);
      setPromptCharLimit(settings.promptCharLimit || 2000);
      if (settings.outputLanguage) setOutputLanguage(settings.outputLanguage);
    }
  }, []);
  const LANGUAGES = [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' },
    { code: 'ko', name: '한국어' },
    { code: 'ru', name: 'Русский' }
  ];

  const translations: Record<string, Record<string, string>> = {
    en: {
      'Influencer': 'Escena',
      'Herramientas': 'Tools',
      'Espacio': 'Space',
      'Comunidad': 'Community',
      'Escena': 'Scene',
      'Recreación': 'Recreation',
      'Variaciones': 'Variations',
      'Prompting General': 'General Prompting',
      'Flow': 'Flow',
      'Feed': 'Feed',
      'Co-Working': 'Co-Working',
      'Historial': 'History',
      'Generar Ahora': 'Generate Now',
      'Copiado exitosamente en el portapapeles': 'Copied successfully to clipboard'
    },
    // Add other languages as needed, defaulting to Spanish if not found
  };

  const t = (key: string) => {
    if (language === 'es') return key;
    return translations[language]?.[key] || key;
  };

  // Tab Grouping
  const [activeTabGroup, setActiveTabGroup] = useState<'tools' | 'community' | 'admin'>('tools');

  // Recreation Enhancements
  const [recreationSubjectImage, setRecreationSubjectImage] = useState<string | null>(null);
  const [recreationReferenceImage, setRecreationReferenceImage] = useState<string | null>(null);
  const [showSmartphoneModal, setShowSmartphoneModal] = useState(false);
  const [smartphoneModel, setSmartphoneModel] = useState('');
  const [showSaveStyleModal, setShowSaveStyleModal] = useState(false);
  const [styleName, setStyleName] = useState('');
  const [savedStyles, setSavedStyles] = useState<{name: string, prompt: string, type: 'full' | 'partial'}[]>(() => {
    const saved = localStorage.getItem('scenecraft_saved_styles');
    return saved ? JSON.parse(saved) : [];
  });

  const handleSaveStyle = (name: string, type: 'full' | 'partial') => {
    if (!name.trim()) return;
    const newStyle = {
      name,
      prompt: extractedPrompt || '',
      type
    };
    const updatedStyles = [...savedStyles, newStyle];
    setSavedStyles(updatedStyles);
    localStorage.setItem('scenecraft_saved_styles', JSON.stringify(updatedStyles));
    setShowSaveStyleModal(false);
    setStyleName('');
  };
  const [saveStyleOptions, setSaveStyleOptions] = useState({
    subject: true,
    background: true,
    quality: true,
    lighting: true,
    style: true,
    perception: true
  });

  const activeCategories = workMode === 'influencer' ? INFLUENCER_CATEGORIES : GENERAL_CATEGORIES;
  const activeBlocks = workMode === 'influencer' ? INFLUENCER_BLOCKS : GENERAL_BLOCKS;
  const [saveStyleTitle, setSaveStyleTitle] = useState('');

  // Smartphone Modal State
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Copy Toast State
  const [copyToast, setCopyToast] = useState<{show: boolean, message: string}>({show: false, message: ''});

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyToast({show: true, message: t('Copiado exitosamente en el portapapeles')});
    setTimeout(() => setCopyToast({show: false, message: ''}), 3000);
  };

  // Bust Size Modal State
  const handleAlquimiaGenerate = async () => {
    if (alquimiaImages.every(img => img === null)) {
      setAlquimiaError("Por favor, sube al menos una imagen.");
      return;
    }

    setAlquimiaLoading(true);
    setAlquimiaError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              { text: "Analiza estas imágenes y genera 5 prompts distintos y coherentes que combinen elementos de todas ellas (sujetos, entorno, iluminación, estilo, etc.). Varía los ángulos de cámara, distancias, poses, interacciones y estilos fotográficos. Devuelve los prompts en un array JSON de strings." },
              ...alquimiaImages.filter(img => img !== null).map(img => ({
                inlineData: {
                  mimeType: "image/jpeg",
                  data: img!.split(',')[1]
                }
              }))
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });

      const newPrompts = JSON.parse(response.text);
      
      // Save current to history before updating
      if (alquimiaPrompts.length > 0) {
        setAlquimiaHistory(prev => [{ prompts: alquimiaPrompts, timestamp: Date.now() }, ...prev].slice(0, 10));
      }

      setAlquimiaPrompts(newPrompts);
    } catch (error) {
      console.error("Alquimia error:", error);
      setAlquimiaError("Ocurrió un error al generar los prompts. Por favor, intenta de nuevo.");
    } finally {
      setAlquimiaLoading(false);
    }
  };

  // My Prompts State
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);

  useEffect(() => {
    const localSavedPrompts = localStorage.getItem('local_savedPrompts');
    if (localSavedPrompts) {
      setSavedPrompts(JSON.parse(localSavedPrompts));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('local_savedPrompts', JSON.stringify(savedPrompts));
  }, [savedPrompts]);

  const handleSaveCurrentPrompt = () => {
    if (!compiledPrompt) return;
    const id = `saved_prompt_${Date.now()}`;
    const newPrompt: SavedPrompt = {
      id,
      title: `Prompt ${savedPrompts.length + 1}`,
      prompt: compiledPrompt,
      authorId: currentUser?.uid || 'local_user',
      createdAt: Date.now()
    };
    setSavedPrompts(prev => [newPrompt, ...prev]);
  };

  // Sorting & Filtering State
  const [historySort, setHistorySort] = useState<'date' | 'title'>('date');
  const [communitySort, setCommunitySort] = useState<'newest' | 'popular'>('newest');
  const [communitySearch, setCommunitySearch] = useState('');

  const [isManualGeneration, setIsManualGeneration] = useState(() => {
    const saved = localStorage.getItem('scenecraft_manual_gen');
    return saved ? JSON.parse(saved) : false;
  });
  const [aiTargetType, setAiTargetType] = useState(() => {
    const saved = localStorage.getItem('scenecraft_ai_target');
    return saved ? saved : 'midjourney';
  });
  const [manualPromptReady, setManualPromptReady] = useState(false);

  // Admin & User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [deletedPrompts, setDeletedPrompts] = useState<PromptSession[]>([]);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  
  // Alquimia State
  const [alquimiaImages, setAlquimiaImages] = useState<(string | null)[]>(Array(6).fill(null));
  const [alquimiaPrompts, setAlquimiaPrompts] = useState<string[]>([]);
  const [alquimiaHistory, setAlquimiaHistory] = useState<{prompts: string[], timestamp: number}[]>([]);
  const [alquimiaLoading, setAlquimiaLoading] = useState(false);
  const [alquimiaError, setAlquimiaError] = useState<string | null>(null);

  // Session History (Temporary, not persisted)
  const [sessionHistory, setSessionHistory] = useState<{prompt: string, timestamp: number}[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [bustSize, setBustSize] = useState('');
  const [showBustModal, setShowBustModal] = useState(false);

  // Scene Structure UI State
  const [sceneStructureHeight, setSceneStructureHeight] = useState<number>(200);
  const [isSceneStructureExpanded, setIsSceneStructureExpanded] = useState(false);
  const [isSceneStructureCollapsed, setIsSceneStructureCollapsed] = useState(false);
  const [isResizingScene, setIsResizingScene] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCurrentUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: userData.displayName || firebaseUser.displayName || 'User',
              hashtag: userData.hashtag || Math.random().toString(36).substring(2, 6).toUpperCase(),
              photoURL: userData.photoURL || firebaseUser.photoURL || '',
              isAdmin: userData.role === 'admin',
              freePromptsUsed: userData.freePromptsUsed || 0,
              isSubscribed: userData.isSubscribed || false,
              subscriptionTier: userData.subscriptionTier || 'free'
            });
          } else {
            // Create new user
            const newUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || '',
              role: 'user',
              createdAt: serverTimestamp()
            };
            await setDoc(userDocRef, newUser);
            setCurrentUser({
              ...newUser,
              hashtag: Math.random().toString(36).substring(2, 6).toUpperCase(),
              isAdmin: false,
              freePromptsUsed: 0,
              isSubscribed: false,
              subscriptionTier: 'free'
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setCurrentUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await logOut();
      setCurrentUser(null);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // Load from localStorage on mount
  useEffect(() => {
    // Initialize Socket
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('initial-data', (data) => {
      setCoworkingTopics(data.topics);
    });

    newSocket.on('new-message', (message) => {
      setCoworkingMessages(prev => [...prev, message]);
    });

    newSocket.on('topic-created', (topic) => {
      setCoworkingTopics(prev => [...prev, topic]);
    });

    newSocket.on('message-history', (messages) => {
      setCoworkingMessages(messages);
    });

    newSocket.on('invitation-received', (data) => {
      // Show a simple alert for now, could be a toast
      alert(`¡Invitación recibida! ${data.inviter} te ha invitado al tema: ${data.topicTitle}`);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socket && currentUser) {
      socket.emit('register-user', currentUser);
    }
  }, [socket, currentUser]);

  const handleInviteUser = (identifier: string) => {
    if (!socket || !activeTopic) return;
    socket.emit('invite-user', {
      topicId: activeTopic.id,
      identifier: identifier, // Can be email or Name#Hashtag
      inviter: currentUser?.displayName + '#' + currentUser?.hashtag
    });
    setInviteInput('');
    setShowInviteModal(false);
  };
  const handleUpdateUsername = async (newName: string) => {
    if (!currentUser) return;
    const hashtag = currentUser.hashtag || Math.floor(1000 + Math.random() * 9000).toString();
    const updatedUser = { ...currentUser, displayName: newName, hashtag };
    setCurrentUser(updatedUser);
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { displayName: newName });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  useEffect(() => {
    if (currentUser && !currentUser.hashtag) {
      handleUpdateUsername(currentUser.displayName || 'User');
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setPromptHistory([]);
      return;
    }

    const q = query(
      collection(db, 'prompts'),
      where('authorId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prompts: PromptSession[] = [];
      snapshot.forEach((doc) => {
        prompts.push(doc.data() as PromptSession);
      });
      setPromptHistory(prompts.sort((a, b) => b.date - a.date));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'prompts');
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      
      // Load custom categories and blocks from localStorage if not logged in
      const localCategories = localStorage.getItem('local_customCategories');
      if (localCategories) {
        setCustomCategories(JSON.parse(localCategories));
      } else {
        setCustomCategories([]);
      }

      const localBlocks = localStorage.getItem('local_customBlocks');
      if (localBlocks) {
        setCustomBlocks(JSON.parse(localBlocks));
      } else {
        setCustomBlocks([]);
      }
      return;
    }

    // Load Custom Blocks
    const qCustomBlocks = query(collection(db, 'customBlocks'), where('authorId', '==', currentUser.uid));
    const unsubCustomBlocks = onSnapshot(qCustomBlocks, (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach(doc => loaded.push(doc.data()));
      setCustomBlocks(loaded);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customBlocks'));

    // Load Custom Categories
    const qCustomCategories = query(collection(db, 'customCategories'), where('authorId', '==', currentUser.uid));
    const unsubCustomCategories = onSnapshot(qCustomCategories, (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach(doc => loaded.push(doc.data()));
      setCustomCategories(loaded);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customCategories'));

    return () => {
      unsubCustomBlocks();
      unsubCustomCategories();
    };
  }, [currentUser]);

  useEffect(() => {
    const qNews = query(collection(db, 'news'), orderBy('date', 'desc'));
    const unsubNews = onSnapshot(qNews, (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach(doc => loaded.push(doc.data()));
      setNews(loaded);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'news'));
    return () => unsubNews();
  }, []);

  // Save to localStorage when states change
  useEffect(() => {
    localStorage.setItem('scenecraft_settings', JSON.stringify({
      theme,
      uiStyle,
      colorTheme,
      isNsfwEnabled,
      promptCharLimit,
      outputLanguage
    }));
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-style', uiStyle);
    document.documentElement.setAttribute('data-color', colorTheme);
  }, [theme, uiStyle, colorTheme, isNsfwEnabled, promptCharLimit, outputLanguage]);

  // Resizing logic for Scene Structure
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingScene) return;
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.7, e.clientY - 150)); // Adjusted offset
      setSceneStructureHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizingScene(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingScene) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingScene]);

  useEffect(() => {
    localStorage.setItem('favoriteBlocks', JSON.stringify(favoriteBlocks));
  }, [favoriteBlocks]);

  useEffect(() => {
    localStorage.setItem('communityFeed', JSON.stringify(communityFeed));
  }, [communityFeed]);

  // Compile prompt whenever dependencies change
  useEffect(() => {
    const compile = async () => {
      if (!isBannedWordsLocked) return; // Pause prompting if banned words are unlocked
      
      // If manual generation is enabled, don't auto-compile
      if (isManualGeneration && !manualPromptReady) {
        return;
      }

      if (selectedBlocks.length === 0 && customInstructions.length === 0) {
        setPromptSegments([]);
        setCompiledPrompt('');
        return;
      }
      setIsCompiling(true);
      const segments = await generateCohesivePrompt(
        selectedBlocks, 
        customInstructions,
        isNsfwEnabled,
        isSubstitutionEnabled,
        bannedWords,
        outputLanguage
      );
      setPromptSegments(segments);
      setCompiledPrompt(segments.map(s => s.text).join(''));
      setIsCompiling(false);
      
      // Reset manual prompt ready flag after compilation
      if (manualPromptReady) {
        setManualPromptReady(false);
      }
    };
    
    const timeoutId = setTimeout(compile, 800);
    return () => clearTimeout(timeoutId);
  }, [selectedBlocks, customInstructions, isNsfwEnabled, isSubstitutionEnabled, bannedWords, isBannedWordsLocked, outputLanguage, isManualGeneration, manualPromptReady]);

  // Track session history
  useEffect(() => {
    if (compiledPrompt && compiledPrompt.trim() !== '') {
      const timer = setTimeout(() => {
        setSessionHistory(prev => {
          // Don't add if it's the same as the last one
          if (prev.length > 0 && prev[0].prompt === compiledPrompt) return prev;
          return [{ prompt: compiledPrompt, timestamp: Date.now() }, ...prev].slice(0, 50);
        });
      }, 3000); // 3 second stability check to avoid spamming history
      return () => clearTimeout(timer);
    }
  }, [compiledPrompt]);

  const handleManualGenerate = () => {
    setManualPromptReady(true);
  };

  const handleMagicEnhance = async () => {
    if (!compiledPrompt) return;
    setIsCompiling(true);
    try {
      const enhanced = await enhancePrompt(compiledPrompt);
      setCompiledPrompt(enhanced);
      setIsEditingPrompt(true);
      
      // Add to session history
      const newEntry = {
        prompt: enhanced,
        timestamp: Date.now(),
        type: 'enhanced' as const
      };
      setSessionHistory(prev => [newEntry, ...prev]);
    } catch (error) {
      console.error("Error enhancing prompt:", error);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleTargetModelChange = async (model: string) => {
    setTargetModel(model);
    if (!compiledPrompt) return;
    setIsCompiling(true);
    const adapted = await adaptPromptToModel(compiledPrompt, model);
    setCompiledPrompt(adapted);
    setIsEditingPrompt(true);
    setIsCompiling(false);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { setWorkMode('influencer'); setActiveTabGroup('tools'); }
        if (e.key === '2') { setWorkMode('prompting'); setActiveTabGroup('tools'); }
        if (e.key === '4') { setWorkMode('community'); setActiveTabGroup('community'); }
        if (e.key === 's') { e.preventDefault(); setShowSaveHistoryModal(true); }
        if (e.key === 'z') { 
          if (undoStack.length > 0) {
            const last = undoStack[undoStack.length - 1];
            setSelectedBlocks(last.blocks);
            setCustomInstructions(last.instructions);
            setUndoStack(prev => prev.slice(0, -1));
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, selectedBlocks, customInstructions]);

  // Fetch suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (selectedBlocks.length === 0) {
        setSuggestions([]);
        return;
      }
      setIsSuggesting(true);
      const suggestedIds = await suggestRelatedBlocks(selectedBlocks);
      const newSuggestions = suggestedIds
        .map(id => ALL_BLOCKS.find(b => b.id === id))
        .filter((b): b is Block => b !== undefined);
      setSuggestions(newSuggestions);
      setSuggestionPage(0);
      setIsSuggesting(false);
    };

    const timeoutId = setTimeout(fetchSuggestions, 1500);
    return () => clearTimeout(timeoutId);
  }, [selectedBlocks]);

  // Recreation Tab State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [extractedPrompt, setExtractedPrompt] = useState<string | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setExtractedPrompt(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!uploadedImage) return;
    setIsAnalyzingImage(true);
    try {
      const prompt = await analyzeImageForPrompt(uploadedImage);
      setExtractedPrompt(prompt);
    } catch (error) {
      console.error("Error analyzing image:", error);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleRefreshSuggestions = async () => {
    if (selectedBlocks.length === 0) return;
    setIsSuggesting(true);
    const suggestedIds = await suggestRelatedBlocks(selectedBlocks);
    const newSuggestions = suggestedIds
      .map(id => ALL_BLOCKS.find(b => b.id === id))
      .filter((b): b is Block => b !== undefined);
    setSuggestions(newSuggestions);
    setSuggestionPage(0);
    setIsSuggesting(false);
  };

  const totalSuggestionPages = Math.ceil(suggestions.length / SUGGESTIONS_PER_PAGE);
  const currentSuggestions = suggestions.slice(suggestionPage * SUGGESTIONS_PER_PAGE, (suggestionPage + 1) * SUGGESTIONS_PER_PAGE);

  const toggleBlock = (block: Block) => {
    if (block.isNsfw && !isNsfwEnabled) {
      setShowNsfwWarning(true);
      return;
    }
    
    // Special case for Smartphone
    if (block.id === 'pro_6' && !selectedBlocks.find(b => b.id === 'pro_6')) {
      setShowSmartphoneModal(true);
      return;
    }

    // Special case for Bust Size
    if (block.id === 'bod_5' && !selectedBlocks.find(b => b.id === 'bod_5')) {
      setShowBustModal(true);
      return;
    }
    
    setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
    
    setSelectedBlocks(prev => {
      const exists = prev.find(b => b.id === block.id);
      if (exists) {
        return prev.filter(b => b.id !== block.id);
      }
      return [...prev, block];
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    setSelectedBlocks(previousState.blocks);
    setCustomInstructions(previousState.instructions);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);

    setIsChatting(true);
    // Add the chat input directly as a custom instruction
    setCustomInstructions(prev => [...prev, chatInput.trim()]);
    setChatInput('');
    
    // Reset textarea height
    const textarea = document.querySelector('textarea[placeholder="Ej: Hazlo más casual, cambia a luz de neón, añade un espejo..."]') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = 'auto';
    }

    setIsChatting(false);
  };

  const removeCustomInstruction = (index: number) => {
    setCustomInstructions(prev => prev.filter((_, i) => i !== index));
  };

  const saveToHistory = () => {
    if (!compiledPrompt) return;
    setSaveHistoryTitle('');
    setShowSaveHistoryModal(true);
  };

  const generateHistoryTitle = async () => {
    if (!compiledPrompt) return;
    setIsGeneratingHistoryTitle(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Genera un título corto y descriptivo (máximo 5 palabras) para este prompt de generación de imágenes: "${compiledPrompt}"`,
      });
      if (response.text) {
        setSaveHistoryTitle(response.text.trim().replace(/["']/g, ''));
      }
    } catch (error) {
      console.error("Error generating title:", error);
    } finally {
      setIsGeneratingHistoryTitle(false);
    }
  };

  const confirmSaveHistory = async () => {
    if (!compiledPrompt || !currentUser) return;
    const newSession: PromptSession = {
      id: Date.now().toString(),
      title: saveHistoryTitle || 'Prompt sin título',
      date: Date.now(),
      mode: workMode,
      selectedBlocks: JSON.stringify(selectedBlocks),
      customInstructions: [...customInstructions],
      compiledPrompt,
      isFavorite: false,
      likes: 0, // For sorting
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      isPublic: false
    };
    
    try {
      await setDoc(doc(db, 'prompts', newSession.id), newSession);
      setShowSaveHistoryModal(false);
      setSaveHistoryTitle('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `prompts/${newSession.id}`);
    }
  };

  const confirmSmartphoneModel = () => {
    const smartphoneBlock = ALL_BLOCKS.find(b => b.id === 'pro_6');
    if (smartphoneBlock) {
      const customBlock: Block = {
        ...smartphoneBlock,
        label: `Celular (${smartphoneModel || 'Modelo genérico'})`,
        value: `smartphone, ${smartphoneModel || 'modern smartphone'}`
      };
      setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
      setSelectedBlocks(prev => [...prev, customBlock]);
    }
    setShowSmartphoneModal(false);
    setSmartphoneModel('');
  };

  const confirmBustSize = () => {
    const bustBlock = ALL_BLOCKS.find(b => b.id === 'bod_5');
    if (bustBlock) {
      const customBlock: Block = {
        ...bustBlock,
        label: `Busto (${bustSize || 'Medida natural'})`,
        value: `specific bust size, bra cup ${bustSize || 'natural'}, proportional chest`
      };
      setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
      setSelectedBlocks(prev => [...prev, customBlock]);
    }
    setShowBustModal(false);
    setBustSize('');
  };

  const deleteHistoryItem = async (id: string) => {
    const toDelete = promptHistory.find(p => p.id === id);
    if (toDelete) {
      setDeletedPrompts(prev => [toDelete, ...prev]);
    }
    try {
      await deleteDoc(doc(db, 'prompts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `prompts/${id}`);
    }
  };

  const renameHistoryItem = async (id: string, newTitle: string) => {
    try {
      await updateDoc(doc(db, 'prompts', id), { title: newTitle });
      setEditingHistoryId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prompts/${id}`);
    }
  };

  const toggleFavoriteBlock = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteBlocks(prev => 
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const toggleFavorite = async (id: string) => {
    const session = promptHistory.find(s => s.id === id);
    if (!session) return;
    try {
      await updateDoc(doc(db, 'prompts', id), { isFavorite: !session.isFavorite });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prompts/${id}`);
    }
  };

  const loadSession = (session: PromptSession) => {
    setWorkMode(session.mode as WorkMode);
    try {
      setSelectedBlocks(JSON.parse(session.selectedBlocks as unknown as string));
    } catch (e) {
      setSelectedBlocks([]);
    }
    setCustomInstructions(session.customInstructions || []);
    setShowHistory(false);
  };

  const handleAddBannedWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (bannedWordInput.trim() && !bannedWords.includes(bannedWordInput.trim())) {
      setBannedWords(prev => [...prev, bannedWordInput.trim()]);
      setBannedWordInput('');
    }
  };

  const removeBannedWord = (word: string) => {
    setBannedWords(prev => prev.filter(w => w !== word));
  };

  const handleAddCustomBlock = async (categoryId: string) => {
    const newBlock: CustomBlock = {
      id: `custom_${Date.now()}`,
      categoryId,
      label: 'Nueva Subcategoría',
      value: '',
      title: 'Nueva Subcategoría',
      promptText: '',
      isCustom: true,
      isNsfw: false,
      authorId: currentUser?.uid || 'local_user'
    };
    
    if (currentUser) {
      try {
        await setDoc(doc(db, 'customBlocks', newBlock.id), newBlock);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `customBlocks/${newBlock.id}`);
      }
    } else {
      setCustomBlocks(prev => {
        const updated = [...prev, newBlock];
        localStorage.setItem('local_customBlocks', JSON.stringify(updated));
        return updated;
      });
    }
    setEditingCustomBlock(newBlock.id);
    setNewCustomBlockTitle(newBlock.title);
    setNewCustomBlockText(newBlock.promptText);
  };

  const saveCustomBlock = async () => {
    if (!editingCustomBlock) return;
    
    const nsfwKeywords = ['desnuda', 'desnudo', 'sexo', 'pezones', 'vagina', 'pene', 'glúteos', 'lencería', 'transparente', 'naked', 'nude', 'sex', 'nipples', 'ass', 'lingerie'];
    const isNsfw = nsfwKeywords.some(word => newCustomBlockText.toLowerCase().includes(word) || newCustomBlockTitle.toLowerCase().includes(word));

    if (isNsfw && !isNsfwEnabled) {
      setShowNsfwWarning(true);
      return; // Prevent saving if NSFW is off and content is NSFW
    }

    if (currentUser) {
      try {
        await updateDoc(doc(db, 'customBlocks', editingCustomBlock), {
          label: newCustomBlockTitle,
          title: newCustomBlockTitle,
          value: newCustomBlockText,
          promptText: newCustomBlockText,
          isNsfw
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `customBlocks/${editingCustomBlock}`);
      }
    } else {
      setCustomBlocks(prev => {
        const updated = prev.map(b => b.id === editingCustomBlock ? {
          ...b,
          label: newCustomBlockTitle,
          title: newCustomBlockTitle,
          value: newCustomBlockText,
          promptText: newCustomBlockText,
          isNsfw
        } : b);
        localStorage.setItem('local_customBlocks', JSON.stringify(updated));
        return updated;
      });
    }
    setEditingCustomBlock(null);
  };

  const renderIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName];
    return IconComponent ? <IconComponent size={18} /> : <Icons.Circle size={18} />;
  };

  const getCategoryColor = (categoryId: string | null) => {
    if (!categoryId) return '';
    if (categoryId === 'custom') return 'text-white bg-white/10';
    const cat = ALL_CATEGORIES.find(c => c.id === categoryId);
    return cat?.color || 'text-zinc-300';
  };

  return (
    <div className={`h-screen text-zinc-200 flex flex-col overflow-hidden ${uiStyle === 'glass' ? 'bg-transparent' : 'bg-[#0A0A0A]'} ${uiStyle === 'brutalist' ? 'font-mono' : 'font-sans'}`}>
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl flex flex-col sticky top-0 z-[100]">
        {/* Row 1: Logo and Actions */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 md:border-none">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden p-2 text-zinc-400 hover:text-white bg-zinc-900/50 rounded-lg border border-white/5"
              onClick={() => setShowLeftSidebar(!showLeftSidebar)}
            >
              <Icons.Menu size={20} />
            </button>
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 hidden sm:flex">
              <Icons.Zap size={18} />
            </div>
            <h1 className="font-semibold tracking-tight text-white hidden sm:block">SceneCraft AI</h1>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button 
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors p-2 rounded-lg hover:bg-zinc-800 hidden sm:block"
              title="Deshacer"
            >
              <Icons.Undo2 size={18} />
            </button>
            <button 
              onClick={saveToHistory}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-medium text-xs md:text-sm px-3 md:px-4 py-1.5 rounded-full transition-colors flex items-center gap-2"
            >
              <Icons.Save size={14} />
              <span className="hidden sm:inline">Guardar</span>
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                title="Más opciones"
              >
                <Icons.MoreVertical size={20} />
              </button>
              
              {/* Header Dropdown Menu */}
              <AnimatePresence>
                {showHeaderMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[110]"
                  >
                    <div className="p-2 flex flex-col gap-1">
                      <button 
                        onClick={() => { setShowHistory(true); setShowHeaderMenu(false); }}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors w-full text-left"
                      >
                        <Icons.BookMarked size={16} />
                        <span>Historial</span>
                      </button>
                      <button 
                        onClick={() => { setShowSettings(true); setShowHeaderMenu(false); }}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors w-full text-left"
                      >
                        <Icons.Settings size={16} />
                        <span>Configuración de la cuenta</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              className="md:hidden p-2 text-zinc-400 hover:text-white bg-zinc-900/50 rounded-lg border border-white/5"
              onClick={() => setShowRightSidebar(!showRightSidebar)}
            >
              <Icons.PanelRight size={20} />
            </button>
          </div>
        </div>

        {/* Row 2: Mother Tabs (Scrollable on mobile) */}
        <div className="flex items-center justify-start md:justify-center overflow-x-auto no-scrollbar px-4 py-2 gap-1 bg-zinc-900/20">
          <button 
            onClick={() => { setActiveTabGroup('tools'); setWorkMode('influencer'); }}
            className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shrink-0 ${activeTabGroup === 'tools' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t('Herramientas')}
          </button>
          <button 
            onClick={() => { setActiveTabGroup('community'); setWorkMode('community'); }}
            className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shrink-0 ${activeTabGroup === 'community' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t('Comunidad')}
          </button>
          {currentUser?.isAdmin && (
            <button 
              onClick={() => { setActiveTabGroup('admin'); setWorkMode('admin'); }}
              className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shrink-0 ${activeTabGroup === 'admin' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Admin
            </button>
          )}
        </div>

        {/* Row 3: Sub Tabs Row (Scrollable on mobile) */}
        <div className="flex items-center justify-start md:justify-center overflow-x-auto no-scrollbar px-4 py-2 border-t border-white/5">
          <div className="flex items-center gap-2 shrink-0">
            {activeTabGroup === 'tools' && (
              <>
                <button onClick={() => setWorkMode('influencer')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'influencer' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Escena')}</button>
                <button onClick={() => setWorkMode('prompting')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'prompting' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Prompting General')}</button>
                <button onClick={() => setWorkMode('recreation')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'recreation' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Recreación')}</button>
                <button onClick={() => setWorkMode('variations')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'variations' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Variaciones')}</button>
                <button onClick={() => setWorkMode('flow')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'flow' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Flow')}</button>
                <button onClick={() => setWorkMode('alquimia')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'alquimia' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Alquimia')}</button>
              </>
            )}
            {activeTabGroup === 'community' && (
              <>
                <button onClick={() => setWorkMode('community')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'community' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-zinc-400 hover:text-orange-300'}`}>{t('Feed')}</button>
                <button 
                  onClick={() => {
                    console.log("Switching to coworking mode");
                    setWorkMode('coworking');
                  }} 
                  className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'coworking' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-zinc-400 hover:text-orange-300'}`}
                >
                  {t('Co-Working')}
                </button>
              </>
            )}
            {activeTabGroup === 'admin' && (
              <button onClick={() => setWorkMode('admin')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-zinc-400 hover:text-red-300'}`}>Admin Panel</button>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* Global Tooltip Panel */}
        <AnimatePresence>
          {hoveredBlock && ALL_BLOCKS.find(b => b.id === hoveredBlock)?.categoryId === 'lens' && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-800/90 backdrop-blur-md border border-emerald-500/30 rounded-xl p-3 shadow-2xl max-w-sm w-full pointer-events-none"
            >
              <div className="flex items-center gap-2 mb-1">
                <Icons.Camera size={14} className="text-emerald-400" />
                <div className="text-sm text-white font-medium">
                  {ALL_BLOCKS.find(b => b.id === hoveredBlock)?.label}
                </div>
              </div>
              <div className="text-xs text-zinc-300 leading-relaxed">
                {hoveredBlock === 'len_1' && 'Amplio campo de visión, ideal para paisajes o arquitectura. Puede distorsionar bordes.'}
                {hoveredBlock === 'len_2' && 'Perspectiva natural, similar a la vista humana. Excelente para reportajes y calle.'}
                {hoveredBlock === 'len_3' && 'El estándar. Muy versátil, ideal para retratos de medio cuerpo y uso general.'}
                {hoveredBlock === 'len_4' && 'Clásico para retratos. Comprime el fondo y favorece las facciones del rostro.'}
                {hoveredBlock === 'len_5' && 'Acerca objetos lejanos y comprime mucho la perspectiva. Fondo muy desenfocado.'}
                {hoveredBlock === 'len_6' && 'Captura mucha información del entorno. Útil en espacios cerrados.'}
                {hoveredBlock === 'len_12' && 'Estilo natural de smartphone, gran profundidad de campo, procesamiento digital visible.'}
                {!['len_1', 'len_2', 'len_3', 'len_4', 'len_5', 'len_6', 'len_12'].includes(hoveredBlock) && 'Efecto de lente específico para alterar la estética de la imagen.'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Column: Categories & Blocks */}
        {(workMode === 'prompting' || workMode === 'influencer' || workMode === 'recreation' || workMode === 'variations') && (
          <>
            {/* Mobile Backdrop */}
            <AnimatePresence>
              {showLeftSidebar && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowLeftSidebar(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] md:hidden"
                />
              )}
            </AnimatePresence>

            <aside className={`${showLeftSidebar ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 fixed md:relative left-0 top-0 bottom-0 w-80 border-r border-white/10 flex flex-col bg-[#0F0F0F] shrink-0 z-[150] md:z-40 h-full`}>
              {/* Mobile Close Button */}
              <div className="md:hidden p-4 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Categorías</span>
                <button onClick={() => setShowLeftSidebar(false)} className="p-2 text-zinc-400 hover:text-white">
                  <Icons.X size={20} />
                </button>
              </div>
              
              <div className="flex flex-col h-1/2 border-b border-white/10">
              <div className="p-4 pb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Categorías Visuales</h2>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
                <div className="flex flex-col gap-1">
                  {activeCategories.map(cat => (
                    <motion.button
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      onMouseEnter={() => setHoveredCategory(cat.id)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeCategory === cat.id 
                          ? 'bg-zinc-800 text-white' 
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cat.color}>{renderIcon(cat.icon)}</div>
                        <span>{cat.label}</span>
                      </div>
                      {selectedBlocks.filter(b => b.categoryId === cat.id).length > 0 && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {selectedBlocks.filter(b => b.categoryId === cat.id).length}
                        </span>
                      )}
                    </motion.button>
                  ))}
                  
                  {/* Custom Categories Section */}
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2 px-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mis Categorías</h2>
                      <button 
                        onClick={async () => {
                          const id = `custom_cat_${Date.now()}`;
                          const newCat: CustomCategory = { id, name: 'Nueva Categoría', icon: 'Folder', color: 'emerald', authorId: currentUser?.uid || 'local_user', parentId: null };
                          
                          if (currentUser) {
                            try {
                              await setDoc(doc(db, 'customCategories', id), newCat);
                            } catch (error) {
                              handleFirestoreError(error, OperationType.CREATE, `customCategories/${id}`);
                            }
                          } else {
                            setCustomCategories(prev => {
                              const updated = [...prev, newCat];
                              localStorage.setItem('local_customCategories', JSON.stringify(updated));
                              return updated;
                            });
                          }
                          setActiveCategory(id);
                        }}
                        className="text-zinc-400 hover:text-emerald-400"
                      >
                        <Icons.Plus size={14} />
                      </button>
                    </div>
                    {/* My Prompts Section */}
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="flex items-center justify-between mb-2 px-2">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Mis Prompts</h2>
                        <button 
                          onClick={handleSaveCurrentPrompt}
                          className="text-zinc-400 hover:text-emerald-400"
                          title="Guardar prompt actual"
                        >
                          <Icons.Plus size={14} />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {savedPrompts.map(p => (
                          <div key={p.id} className="group relative">
                            <button
                              onClick={() => {
                                // Logic to add prompt to scene as a topic
                                const newBlock: Block = {
                                  id: `prompt_block_${Date.now()}`,
                                  categoryId: 'scene',
                                  label: p.title,
                                  value: p.prompt,
                                  isCustom: true
                                };
                                setSelectedBlocks(prev => [...prev, newBlock]);
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <Icons.FileText size={18} className="text-zinc-500" />
                                <span className="truncate max-w-[140px]">{p.title}</span>
                              </div>
                            </button>
                            <button 
                              onClick={() => setSavedPrompts(prev => prev.filter(item => item.id !== p.id))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Icons.Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Blocks Panel */}
            <div className="flex flex-col h-1/2 bg-[#141414]">
              <div className="flex-1 overflow-y-auto p-4 pb-8 custom-scrollbar">
                <div className="mb-4 bg-zinc-900/50 border border-white/5 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                    <Icons.MousePointerClick size={14} />
                    {activeCategory.startsWith('custom_cat_') 
                      ? customCategories.find(c => c.id === activeCategory)?.name || 'Categoría Personalizada'
                      : ALL_CATEGORIES.find(c => c.id === activeCategory)?.label || 'Selecciona opciones'}
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-1">Haz clic en los bloques para añadirlos a tu prompt.</p>
                </div>

                {activeCategory.startsWith('custom_cat_') ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <input 
                      type="text"
                      value={customCategories.find(c => c.id === activeCategory)?.name || ''}
                      onChange={async (e) => {
                        const newName = e.target.value;
                        if (currentUser) {
                          try {
                            await updateDoc(doc(db, 'customCategories', activeCategory), { name: newName });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, `customCategories/${activeCategory}`);
                          }
                        } else {
                          setCustomCategories(prev => {
                            const updated = prev.map(c => c.id === activeCategory ? { ...c, name: newName } : c);
                            localStorage.setItem('local_customCategories', JSON.stringify(updated));
                            return updated;
                          });
                        }
                      }}
                      className="bg-transparent text-sm font-medium text-white focus:outline-none border-b border-transparent focus:border-emerald-500/50"
                    />
                    <button 
                      onClick={async () => {
                        if (currentUser) {
                          try {
                            await deleteDoc(doc(db, 'customCategories', activeCategory));
                            // Also delete associated blocks
                            const blocksToDelete = customBlocks.filter(b => b.categoryId === activeCategory);
                            for (const block of blocksToDelete) {
                              await deleteDoc(doc(db, 'customBlocks', block.id));
                            }
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, `customCategories/${activeCategory}`);
                          }
                        } else {
                          setCustomCategories(prev => {
                            const updated = prev.filter(c => c.id !== activeCategory);
                            localStorage.setItem('local_customCategories', JSON.stringify(updated));
                            return updated;
                          });
                          setCustomBlocks(prev => {
                            const updated = prev.filter(b => b.categoryId !== activeCategory);
                            localStorage.setItem('local_customBlocks', JSON.stringify(updated));
                            return updated;
                          });
                        }
                        setActiveCategory(ALL_CATEGORIES[0].id);
                      }}
                      className="text-red-500/50 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors"
                      title="Eliminar Categoría"
                    >
                      <Icons.Trash2 size={14} />
                    </button>
                  </div>
                  <button onClick={() => handleAddCustomBlock(activeCategory)} className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1">
                    <Icons.Plus size={12} /> Añadir Subcategoría
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {customBlocks.filter(b => b.categoryId === activeCategory).map(block => {
                    const isSelected = selectedBlocks.some(b => b.id === block.id);
                    if (editingCustomBlock === block.id) {
                      return (
                        <div key={block.id} className="bg-zinc-900 p-3 rounded-lg border border-emerald-500/30 flex flex-col gap-2">
                          <input 
                            value={newCustomBlockTitle} 
                            onChange={e => setNewCustomBlockTitle(e.target.value)}
                            placeholder="Título"
                            className="bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none"
                          />
                          <textarea 
                            value={newCustomBlockText}
                            onChange={e => setNewCustomBlockText(e.target.value)}
                            placeholder="Fragmento de prompt..."
                            className="bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none resize-none h-20"
                          />
                          <button onClick={saveCustomBlock} className="bg-emerald-500 text-black text-xs py-1 rounded font-medium">Guardar</button>
                        </div>
                      );
                    }
                    return (
                      <div key={block.id} className="flex items-center gap-2">
                        <button
                          onClick={() => toggleBlock(block)}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-all text-left ${
                            isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                          }`}
                        >
                          {block.title}
                        </button>
                        <button 
                          onClick={() => {
                            setEditingCustomBlock(block.id);
                            setNewCustomBlockTitle(block.title);
                            setNewCustomBlockText(block.promptText);
                          }}
                          className="p-2 text-zinc-500 hover:text-white bg-zinc-900 rounded-lg border border-white/5"
                        >
                          <Icons.Edit2 size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (currentUser) {
                              try {
                                await deleteDoc(doc(db, 'customBlocks', block.id));
                              } catch (error) {
                                handleFirestoreError(error, OperationType.DELETE, `customBlocks/${block.id}`);
                              }
                            } else {
                              setCustomBlocks(prev => {
                                const updated = prev.filter(b => b.id !== block.id);
                                localStorage.setItem('local_customBlocks', JSON.stringify(updated));
                                return updated;
                              });
                            }
                          }}
                          className="p-2 text-red-500/50 hover:text-red-400 bg-zinc-900 rounded-lg border border-white/5"
                        >
                          <Icons.Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    {activeCategories.find(c => c.id === activeCategory)?.label}
                    <button 
                      onClick={() => setShowMoreCategory(activeCategory)}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                    >
                      (Ver más)
                    </button>
                  </h3>
                  <div className="relative group">
                    <Icons.Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input 
                      type="text"
                      value={blockSearch}
                      onChange={(e) => setBlockSearch(e.target.value)}
                      placeholder="Filtrar..."
                      className="bg-zinc-900 border border-white/5 rounded-full pl-7 pr-3 py-1 text-[10px] text-white focus:outline-none focus:border-emerald-500/50 w-24 transition-all focus:w-32"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Favorites first and always visible */}
                  {activeBlocks.filter(b => b.categoryId === activeCategory && favoriteBlocks.includes(b.id)).map(block => {
                    const isSelected = selectedBlocks.some(b => b.id === block.id);
                    return (
                      <motion.div 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={`fav-${block.id}`} 
                        className="relative group"
                      >
                        <button
                          onClick={() => toggleBlock(block)}
                          onMouseEnter={() => setHoveredBlock(block.id)}
                          onMouseLeave={() => setHoveredBlock(null)}
                          className={`px-3 py-2 rounded-lg text-sm border transition-all text-left flex items-center gap-2 ${
                            isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                          }`}
                        >
                          <Icons.Heart size={12} className="text-red-400 fill-red-400" />
                          {block.label}
                        </button>
                      </motion.div>
                    );
                  })}

                  {/* Regular blocks (excluding favorites already shown) */}
                  {activeBlocks.filter(b => {
                    const matchesCategory = b.categoryId === activeCategory;
                    const isNotFav = !favoriteBlocks.includes(b.id);
                    const searchLower = blockSearch.toLowerCase();
                    return matchesCategory && isNotFav && (b.label.toLowerCase().includes(searchLower) || b.value.toLowerCase().includes(searchLower));
                  })
                    .slice(0, 12).map(block => {
                    const isSelected = selectedBlocks.some(b => b.id === block.id);
                    return (
                      <motion.div 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={block.id} 
                        className="relative group"
                      >
                        <button
                          onClick={() => toggleBlock(block)}
                          onMouseEnter={() => setHoveredBlock(block.id)}
                          onMouseLeave={() => setHoveredBlock(null)}
                          className={`px-3 py-2 rounded-lg text-sm border transition-all text-left flex items-center gap-2 ${
                            isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                          }`}
                        >
                          {block.label}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          </div>
          </aside>
          </>
        )}

        {/* Center Column: Workspace */}
        <section className="flex-1 flex flex-col min-w-0 bg-[#0A0A0A]">
          {/* Global Toggles */}
          <div className="px-6 py-3 border-b border-white/10 flex items-center gap-6 bg-zinc-900/30">
            {news.length > 0 && (
              <div className="flex-1 overflow-hidden">
                <motion.div 
                  animate={{ x: [0, -1000] }}
                  transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                  className="flex items-center gap-8 whitespace-nowrap"
                >
                  {news.map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                      <span className="text-emerald-400">● NOTICIA:</span>
                      <span className="text-zinc-400">{item.title}</span>
                    </div>
                  ))}
                </motion.div>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900/50 rounded-full border border-white/5">
                <Icons.User size={12} className="text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                  {currentUser?.isSubscribed ? 'Plan Premium' : 'Plan Gratuito'}
                </span>
              </div>
            </div>
          </div>

          {(workMode === 'prompting' || workMode === 'influencer') && (
            <>
              {/* Active Blocks Map */}
              <div 
                className={`relative border-b border-white/10 flex flex-col bg-[#0F0F0F]/50 group/scene transition-all duration-300 ${isSceneStructureCollapsed ? 'h-12 overflow-hidden' : ''}`}
                style={{ height: isSceneStructureCollapsed ? '48px' : (window.innerWidth < 768 ? '25vh' : sceneStructureHeight) }}
              >
                <div className="px-6 py-3 flex items-center justify-between border-b border-white/5 bg-[#0A0A0A]/50 shrink-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                    <Icons.Layers size={14} />
                    Estructura de la Escena
                  </h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsSceneStructureCollapsed(!isSceneStructureCollapsed)}
                      className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase"
                      title={isSceneStructureCollapsed ? "Expandir estructura" : "Colapsar estructura"}
                    >
                      {isSceneStructureCollapsed ? <Icons.ChevronDown size={12} /> : <Icons.ChevronUp size={12} />}
                      <span className="hidden sm:inline">{isSceneStructureCollapsed ? 'Expandir' : 'Colapsar'}</span>
                    </button>
                    {!isSceneStructureCollapsed && (
                      <button 
                        onClick={() => setIsSceneStructureExpanded(true)}
                        className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase"
                        title="Ampliar estructura"
                      >
                        <Icons.Maximize2 size={12} />
                        <span className="hidden sm:inline">Gestionar</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-wrap content-start gap-2">
                  <AnimatePresence>
                    {selectedBlocks.length === 0 && customInstructions.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="w-full h-full min-h-[60px] flex items-center justify-center text-zinc-600 text-sm italic border border-dashed border-white/10 rounded-xl"
                      >
                        Selecciona bloques a la izquierda o pide algo en el chat para comenzar.
                      </motion.div>
                    ) : (
                      <>
                        {selectedBlocks.map(block => {
                          const cat = ALL_CATEGORIES.find(c => c.id === block.categoryId);
                          return (
                            <motion.div
                              layout
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              key={block.id}
                              onMouseEnter={() => setHoveredCategory(block.categoryId)}
                              onMouseLeave={() => setHoveredCategory(null)}
                              className={`flex items-center gap-2 bg-zinc-800 border px-3 py-1.5 rounded-full text-sm text-zinc-200 group cursor-default transition-colors ${hoveredCategory === block.categoryId ? 'border-emerald-500/50' : 'border-white/10'}`}
                            >
                              <span className={`text-xs ${cat?.color || 'text-zinc-500'}`}>{cat?.label || 'Custom'}:</span>
                              <span>{block.label}</span>
                              <button 
                                onClick={() => toggleBlock(block)}
                                className="text-zinc-500 hover:text-red-400 transition-colors ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                              >
                                <Icons.X size={14} />
                              </button>
                            </motion.div>
                          );
                        })}
                        {customInstructions.map((inst, idx) => (
                          <motion.div
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            key={`inst_${idx}`}
                            onMouseEnter={() => setHoveredCategory('custom')}
                            onMouseLeave={() => setHoveredCategory(null)}
                            className={`flex items-center gap-2 bg-zinc-800 border px-3 py-1.5 rounded-full text-sm text-zinc-200 group transition-colors ${hoveredCategory === 'custom' ? 'border-emerald-500/50' : 'border-white/10'}`}
                          >
                            <span className="text-xs text-emerald-400">Chat:</span>
                            <span className="truncate max-w-[200px]">{inst}</span>
                            <button 
                              onClick={() => {
                                const newInst = window.prompt('Editar instrucción:', inst);
                                if (newInst !== null && newInst.trim() !== '') {
                                  setCustomInstructions(prev => prev.map((item, i) => i === idx ? newInst.trim() : item));
                                }
                              }}
                              className="text-zinc-500 hover:text-blue-400 transition-colors ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            >
                              <Icons.Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => removeCustomInstruction(idx)}
                              className="text-zinc-500 hover:text-red-400 transition-colors ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            >
                              <Icons.X size={14} />
                            </button>
                          </motion.div>
                        ))}
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {/* Vertical Resizer Handle */}
                <div 
                  onMouseDown={() => setIsResizingScene(true)}
                  className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-emerald-500/50 transition-colors z-10 flex items-center justify-center group/handle"
                >
                  <div className="w-12 h-0.5 bg-white/10 rounded-full group-hover/handle:bg-white/30 transition-colors" />
                </div>
              </div>

              {/* Compiled Prompt */}
              <div className="flex-1 p-6 flex flex-col min-h-0 relative" style={{ height: window.innerWidth < 768 ? '65vh' : 'auto' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                      <Icons.Terminal size={14} />
                      Prompt Final
                    </h2>

                    {/* Magic Enhance Button */}
                    <button 
                      onClick={handleMagicEnhance}
                      disabled={!compiledPrompt || isCompiling}
                      className="p-1.5 text-zinc-500 hover:text-emerald-400 transition-colors bg-zinc-900/50 rounded-lg border border-white/5 group"
                      title="Magic Enhance (IA)"
                    >
                      <Icons.Wand2 size={14} className={isCompiling ? 'animate-pulse' : 'group-hover:rotate-12 transition-transform'} />
                    </button>

                    {/* Character Limit Counter */}
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-2 py-1 rounded border border-white/5">
                      <Icons.Type size={12} className="text-zinc-500" />
                      <input 
                        type="number" 
                        value={promptCharLimit}
                        onChange={(e) => setPromptCharLimit(parseInt(e.target.value) || 0)}
                        className="bg-transparent text-[10px] text-zinc-300 font-bold w-10 focus:outline-none"
                        placeholder="Limit"
                        title="Límite de caracteres"
                      />
                      <div className="h-3 w-px bg-white/10 mx-1"></div>
                      <span className={`text-[10px] font-bold ${promptCharLimit > 0 && compiledPrompt.length > promptCharLimit ? 'text-red-500' : 'text-zinc-500'}`}>
                        {compiledPrompt.length}{promptCharLimit > 0 ? ` / ${promptCharLimit}` : ''}
                      </span>
                      {promptCharLimit > 0 && compiledPrompt.length > promptCharLimit && (
                        <button 
                          onClick={async () => {
                            setIsCompiling(true);
                            try {
                              const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                              const response = await ai.models.generateContent({
                                model: "gemini-3-flash-preview",
                                contents: `Optimiza y acorta el siguiente prompt para que tenga menos de ${promptCharLimit} caracteres, manteniendo los elementos más importantes.
                                
                                Prompt: "${compiledPrompt}"
                                
                                Devuelve ÚNICAMENTE el prompt optimizado.`,
                              });
                              if (response.text) {
                                setCompiledPrompt(response.text.trim());
                                setIsEditingPrompt(true);
                              }
                            } catch (error) {
                              console.error("Error optimizing prompt:", error);
                            } finally {
                              setIsCompiling(false);
                            }
                          }}
                          className="ml-1 p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                          title="Optimizar para el límite"
                        >
                          <Icons.Zap size={10} />
                        </button>
                      )}
                    </div>
                    {isManualGeneration && (
                      <button 
                        onClick={handleManualGenerate}
                        disabled={selectedBlocks.length === 0 && customInstructions.length === 0}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black text-xs font-bold rounded-lg transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1"
                      >
                        <Icons.Play size={12} /> GENERAR AHORA
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {!isBannedWordsLocked && (
                      <span className="text-xs text-red-400 font-medium flex items-center gap-1 animate-pulse">
                        <Icons.AlertTriangle size={12} /> Prompting pausado (Candado abierto)
                      </span>
                    )}
                    {isCompiling && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <Icons.Loader2 size={12} className="animate-spin" />
                        Compilando...
                      </div>
                    )}
                    
                    {/* IA Target Dropdown */}
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-2 py-1 rounded border border-white/5">
                      <Icons.Settings size={12} className="text-zinc-500" />
                      <select 
                        value={targetModel}
                        onChange={(e) => {
                          setTargetModel(e.target.value);
                          localStorage.setItem('scenecraft_target_model', e.target.value);
                        }}
                        className="bg-transparent text-[10px] text-zinc-300 font-bold focus:outline-none uppercase tracking-wider"
                        title="IA Target (Optimización)"
                      >
                        <option value="scenecraft">SceneCraft Soul</option>
                        <option value="midjourney">Midjourney (V6+)</option>
                        <option value="stable-diffusion">Stable Diffusion (XL/3)</option>
                        <option value="dalle-3">DALL-E 3</option>
                        <option value="flux">Flux.1 (Pro/Dev)</option>
                        <option value="nanobanana">Nanobanana Pro</option>
                        <option value="novelai">NovelAI.net</option>
                        <option value="chatgpt">ChatGPT (Vision)</option>
                        <option value="ideogram">Ideogram</option>
                        <option value="firefly">Adobe Firefly</option>
                        <option value="leonardo">Leonardo AI</option>
                        <option value="krea">Krea.ai</option>
                        <option value="starryai">StarryAI</option>
                        <option value="code">Generación de Código</option>
                      </select>
                    </div>

                    <button 
                      onClick={() => setShowSessionHistory(true)}
                      className="p-1.5 text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1.5 bg-zinc-900/50 rounded-lg border border-white/5"
                      title="Historial de Sesión (Temporal)"
                    >
                      <Icons.History size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Historial</span>
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 relative rounded-xl border border-white/10 bg-zinc-950 overflow-hidden flex flex-col group">
                  {isEditingPrompt ? (
                    <textarea
                      value={compiledPrompt}
                      onChange={(e) => setCompiledPrompt(e.target.value)}
                      onBlur={() => setIsEditingPrompt(false)}
                      autoFocus
                      className="flex-1 w-full bg-transparent p-6 text-zinc-300 font-mono text-sm resize-none focus:outline-none custom-scrollbar leading-relaxed"
                    />
                  ) : (
                    <div 
                      className="flex-1 w-full p-6 font-mono text-sm overflow-y-auto custom-scrollbar leading-relaxed cursor-text whitespace-pre-wrap"
                    >
                      {promptSegments.length > 0 ? promptSegments.map((seg, i) => {
                        const isHovered = hoveredCategory && (hoveredCategory === seg.categoryId || (hoveredCategory === 'custom' && seg.categoryId === 'custom'));
                        const colorClass = getCategoryColor(seg.categoryId);
                        
                        return (
                          <span 
                            key={i} 
                            className={`transition-colors duration-200 ${isHovered ? 'bg-emerald-500/20 text-white' : colorClass || 'text-zinc-300'}`}
                            onMouseEnter={() => setHoveredCategory(seg.categoryId)}
                            onMouseLeave={() => setHoveredCategory(null)}
                          >
                            {seg.text}
                          </span>
                        );
                      }) : (
                        <span className="text-zinc-600 italic">El prompt generado aparecerá aquí...</span>
                      )}
                    </div>
                  )}
                  
                  <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button 
                      onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-white/5"
                      title={isEditingPrompt ? "Ver resaltado" : "Editar texto plano"}
                    >
                      {isEditingPrompt ? <Icons.Eye size={16} /> : <Icons.Edit3 size={16} />}
                    </button>
                    <button 
                      onClick={() => handleCopyPrompt(compiledPrompt)}
                      className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
                      title="Copiar prompt"
                    >
                      <Icons.Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-6 pt-0">
                <form onSubmit={handleChatSubmit} className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Icons.MessageSquare size={18} />
                  </div>
                  <textarea
                    value={chatInput}
                    onChange={(e) => {
                      setChatInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit(e as any);
                      }
                    }}
                    placeholder="Ej: Hazlo más casual, cambia a luz de neón, añade un espejo..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl py-4 pl-12 pr-16 text-zinc-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-zinc-600 resize-none custom-scrollbar"
                    disabled={isChatting || !isBannedWordsLocked}
                    rows={1}
                    style={{ minHeight: '56px', maxHeight: '150px' }}
                  />
                  <button 
                    type="submit"
                    disabled={isChatting || !chatInput.trim() || !isBannedWordsLocked}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors"
                  >
                    {isChatting ? <Icons.Loader2 size={16} className="animate-spin" /> : <Icons.ArrowUp size={16} />}
                  </button>
                </form>
              </div>
            </>
          )}

          {workMode === 'recreation' && (
            <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-2xl flex flex-col gap-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-white mb-2">Recreación de Imagen</h2>
                  <p className="text-zinc-400 text-sm">Sube una imagen de referencia para extraer un prompt detallado.</p>
                </div>

                <div 
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-colors ${uploadedImage ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 hover:border-white/20 bg-zinc-900/50'}`}
                >
                  {uploadedImage ? (
                    <div className="w-full flex flex-col items-center gap-4">
                      <img src={uploadedImage} alt="Uploaded reference" className="max-h-[300px] rounded-lg object-contain" />
                      <div className="flex gap-3">
                        <button 
                          onClick={() => {
                            setUploadedImage(null);
                            setImageUrlInput('');
                          }}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                          Cambiar Imagen
                        </button>
                        <button 
                          onClick={analyzeImage}
                          disabled={isAnalyzingImage || !!extractedPrompt}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors flex items-center gap-2"
                        >
                          {isAnalyzingImage ? (
                            <><Icons.Loader2 size={16} className="animate-spin" /> Analizando...</>
                          ) : extractedPrompt ? (
                            <><Icons.Check size={16} /> Analizado</>
                          ) : (
                            <><Icons.Sparkles size={16} /> Extraer Prompt</>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Icons.ImagePlus size={48} className="text-zinc-600 mb-4" />
                      <p className="text-zinc-400 text-sm mb-4 text-center">Arrastra y suelta una imagen aquí, o haz clic para seleccionar.</p>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors mb-6"
                      >
                        Seleccionar Archivo
                      </button>
                      
                      <div className="w-full max-w-md flex items-center gap-2">
                        <div className="h-px bg-white/10 flex-1"></div>
                        <span className="text-xs text-zinc-500 uppercase font-medium">O usa un enlace</span>
                        <div className="h-px bg-white/10 flex-1"></div>
                      </div>
                      
                      <div className="w-full max-w-md mt-6 flex gap-2">
                        <input 
                          type="url" 
                          placeholder="Pega la URL de la imagen aquí..." 
                          value={imageUrlInput}
                          onChange={(e) => setImageUrlInput(e.target.value)}
                          className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                        />
                        <button 
                          onClick={() => {
                            if (imageUrlInput) {
                              setUploadedImage(imageUrlInput);
                              setExtractedPrompt(null);
                            }
                          }}
                          disabled={!imageUrlInput}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                        >
                          Cargar URL
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {extractedPrompt && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4"
                  >
                    <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <Icons.FileText size={16} /> Prompt Extraído
                    </h3>
                    <p className="text-zinc-300 text-sm leading-relaxed font-mono bg-black/30 p-4 rounded-xl border border-white/5">
                      {extractedPrompt}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowCleanModal(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/10 transition-colors flex items-center gap-1.5"
                        >
                          <Icons.Eraser size={14} /> Limpiar Prompt
                        </button>
                        {originalRecreationPrompt && extractedPrompt !== originalRecreationPrompt && (
                          <button 
                            onClick={() => setExtractedPrompt(originalRecreationPrompt)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/10 transition-colors flex items-center gap-1.5"
                          >
                            <Icons.Undo size={14} /> Revertir
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowSaveStyleModal(true)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/10 transition-colors flex items-center gap-2"
                        >
                          <Icons.Bookmark size={16} /> Guardar Estilo
                        </button>
                        <button 
                          onClick={() => setShowComparisonModal(true)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-colors flex items-center gap-2"
                        >
                          <Icons.GitMerge size={16} /> Integrar a la Escena
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {workMode === 'variations' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Variaciones del Prompt</h2>
                    <p className="text-zinc-400 text-sm">Genera variaciones de tu prompt actual cambiando aspectos específicos.</p>
                  </div>
                  <button 
                    onClick={() => setWorkMode('prompting')}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
                  >
                    <Icons.ArrowLeft size={16} /> Volver a Prompting
                  </button>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-zinc-400">Prompt Base</h3>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-sm text-zinc-300 min-h-[100px] font-mono">
                    {compiledPrompt || <span className="text-zinc-600 italic">No hay prompt actual para variar. Ve a la pestaña de Prompting y crea uno.</span>}
                  </div>
                </div>

                {compiledPrompt && (
                  <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar snap-x">
                    {[
                      { title: "Cambiar Pose", icon: Icons.User, basePrompt: "Mantén todo igual pero cambia la pose del sujeto a:" },
                      { title: "Cambiar Iluminación", icon: Icons.Sun, basePrompt: "Mantén todo igual pero cambia la iluminación a:" },
                      { title: "Cambiar Entorno", icon: Icons.Map, basePrompt: "Mantén el sujeto igual pero colócalo en:" },
                      { title: "Cambiar Estilo", icon: Icons.Palette, basePrompt: "Mantén el contenido igual pero cambia el estilo artístico a:" },
                      { title: "Cambiar Ropa", icon: Icons.Shirt, basePrompt: "Mantén todo igual pero cambia la ropa del sujeto a:" },
                      { title: "Cambiar Expresión", icon: Icons.Smile, basePrompt: "Mantén todo igual pero cambia la expresión facial a:" },
                      { title: "Cambiar Clima", icon: Icons.CloudRain, basePrompt: "Mantén todo igual pero cambia el clima a:" },
                      { title: "Cambiar Hora del Día", icon: Icons.Clock, basePrompt: "Mantén todo igual pero cambia la hora del día a:" },
                      { title: "Cambiar Ángulo de Cámara", icon: Icons.Camera, basePrompt: "Mantén todo igual pero cambia el ángulo de la cámara a:" },
                      { title: "Cambiar Paleta de Colores", icon: Icons.Droplet, basePrompt: "Mantén todo igual pero cambia la paleta de colores a:" },
                      { title: "Añadir Elemento", icon: Icons.PlusCircle, basePrompt: "Mantén todo igual pero añade el siguiente elemento:" },
                      { title: "Quitar Elemento", icon: Icons.MinusCircle, basePrompt: "Mantén todo igual pero quita el siguiente elemento:" },
                      { title: "Cambiar Edad", icon: Icons.UserPlus, basePrompt: "Mantén todo igual pero cambia la edad del sujeto a:" },
                      { title: "Cambiar Época", icon: Icons.Hourglass, basePrompt: "Mantén todo igual pero sitúa la escena en la época:" },
                      { title: "Cambiar Emoción General", icon: Icons.Heart, basePrompt: "Mantén todo igual pero cambia la emoción general de la imagen a:" },
                    ].map((variation, idx) => (
                      <div
                        key={idx}
                        className="min-w-[280px] p-6 rounded-2xl border border-white/5 bg-zinc-900 flex flex-col items-center text-center gap-4 snap-center"
                      >
                        <div className="p-3 bg-zinc-950 rounded-xl text-emerald-400">
                          <variation.icon size={24} />
                        </div>
                        <div className="font-medium text-white">{variation.title}</div>
                        <div className="text-xs text-zinc-500">{variation.basePrompt}</div>
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            const input = (e.target as any).elements.customInput.value;
                            if (!input.trim()) return;
                            setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                            setCustomInstructions(prev => [...prev, `${variation.basePrompt} ${input}`]);
                            setWorkMode('prompting');
                          }}
                          className="w-full flex flex-col gap-2 mt-auto"
                        >
                          <input 
                            name="customInput"
                            type="text" 
                            placeholder="Ej: algo dramático..." 
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                          />
                          <button 
                            type="submit"
                            className="w-full py-2 rounded-lg text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
                          >
                            Aplicar
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {workMode === 'flow' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Flujo de Prompts (Storytelling)</h2>
                    <p className="text-zinc-400 text-sm">Crea una historia o secuencia de eventos basada en tu prompt actual.</p>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-zinc-400">Prompt Final (Bloqueado)</h3>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-sm text-zinc-300 min-h-[100px] font-mono opacity-70">
                    {compiledPrompt || <span className="text-zinc-600 italic">No hay prompt actual. Ve a la pestaña de Prompting y crea uno.</span>}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-white">Configuración de la Historia</h3>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-zinc-400">Describe la historia o el contexto general:</label>
                    <textarea 
                      value={flowStory}
                      onChange={(e) => setFlowStory(e.target.value)}
                      placeholder="Ej: Un día pesado en el trabajo, desde que se levanta hasta que regresa a casa exhausto..."
                      className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-xs text-zinc-400">Número de prompts (Max 20):</label>
                      <input 
                        type="number" 
                        min="2" max="20"
                        value={flowCount}
                        onChange={(e) => setFlowCount(Math.min(20, Math.max(2, parseInt(e.target.value) || 5)))}
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-xs text-zinc-400">Posición del Prompt Final:</label>
                      <select 
                        value={flowFinalPromptPosition}
                        onChange={(e) => setFlowFinalPromptPosition(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="-">Automático (Según coherencia)</option>
                        {Array.from({length: flowCount}).map((_, i) => (
                          <option key={i} value={i + 1}>Posición {i + 1}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={async () => {
                      setIsGeneratingFlow(true);
                      try {
                        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY });
                        const response = await ai.models.generateContent({
                          model: 'gemini-3-flash-preview',
                          contents: `Crea una secuencia de ${flowCount} prompts en inglés para generar imágenes que cuenten la siguiente historia: "${flowStory}".
                          El prompt original (que debe ser uno de los prompts en la secuencia) es: "${compiledPrompt}".
                          ${flowFinalPromptPosition !== '-' ? `El prompt original DEBE estar en la posición ${flowFinalPromptPosition} de la secuencia.` : 'El prompt original debe integrarse donde tenga más sentido narrativo.'}
                          
                          Asegúrate de mantener la coherencia visual (mismo personaje, estilo, iluminación si aplica) a lo largo de la secuencia.`,
                          config: {
                            responseMimeType: "application/json",
                            responseSchema: {
                              type: Type.OBJECT,
                              properties: {
                                story: { type: Type.STRING, description: "La historia completa y detallada en español que conecta todas las escenas." },
                                prompts: {
                                  type: Type.ARRAY,
                                  items: {
                                    type: Type.OBJECT,
                                    properties: {
                                      title: { type: Type.STRING, description: "Un título corto en español para la escena." },
                                      description: { type: Type.STRING, description: "Una breve descripción en español de lo que sucede." },
                                      prompt: { type: Type.STRING, description: "El prompt detallado en inglés para generar la imagen." },
                                      isOriginal: { type: Type.BOOLEAN, description: "true si es el prompt original, false en caso contrario." }
                                    },
                                    required: ["title", "description", "prompt", "isOriginal"]
                                  }
                                }
                              },
                              required: ["story", "prompts"]
                            }
                          }
                        });
                        
                        const jsonStr = response.text || '{}';
                        const parsedFlow = JSON.parse(jsonStr);
                        setGeneratedFlow(parsedFlow.prompts || []);
                        setGeneratedStory(parsedFlow.story || '');
                      } catch (error) {
                        console.error("Error generating flow:", error);
                        // Fallback in case of error
                        setGeneratedFlow([
                          { title: 'Error', description: 'Hubo un error al generar el flujo.', prompt: 'Error generating flow.', isOriginal: false }
                        ]);
                      } finally {
                        setIsGeneratingFlow(false);
                      }
                    }}
                    disabled={isGeneratingFlow || !compiledPrompt || !flowStory.trim()}
                    className="mt-2 w-full py-3 rounded-xl font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500 flex items-center justify-center gap-2"
                  >
                    {isGeneratingFlow ? <Icons.Loader2 size={18} className="animate-spin" /> : <Icons.Wand2 size={18} />}
                    {isGeneratingFlow ? 'Generando Flujo...' : 'Generar Historia'}
                  </button>
                </div>

                {generatedFlow.length > 0 && (
                  <div className="flex flex-col gap-4 mt-4">
                    {generatedStory && (
                      <div className="bg-zinc-900 border border-white/5 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-emerald-400 mb-2">Historia Narrativa</h3>
                        <p className="text-sm text-zinc-300 leading-relaxed">{generatedStory}</p>
                      </div>
                    )}
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Icons.ListOrdered size={20} className="text-emerald-400" />
                      Flujo Generado
                    </h3>
                    <div className="flex flex-col gap-3">
                      {generatedFlow.map((item, index) => (
                        <div key={index} className={`bg-zinc-900 border ${item.isOriginal ? 'border-emerald-500/50' : 'border-white/5'} rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden`}>
                          {item.isOriginal && (
                            <div className="absolute top-0 right-0 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                              <Icons.Lock size={10} /> PROMPT ORIGINAL
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${item.isOriginal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                {index + 1}
                              </span>
                              <h4 className="font-medium text-white">{item.title}</h4>
                            </div>
                            <button 
                              onClick={() => handleCopyPrompt(item.prompt)}
                              className="text-zinc-500 hover:text-emerald-400 transition-colors" 
                              title="Copiar prompt"
                            >
                              <Icons.Copy size={16} />
                            </button>
                          </div>
                          <p className="text-xs text-zinc-400">{item.description}</p>
                          <div className="bg-black/30 p-3 rounded-lg text-sm text-zinc-300 font-mono mt-1">
                            {item.prompt}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {workMode === 'community' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Comunidad e Inspiración</h2>
                    <p className="text-zinc-400 text-sm">Explora prompts creados por otros usuarios, inspírate y comparte tus creaciones.</p>
                  </div>
                  <button 
                    onClick={() => setShowShareModal(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-colors flex items-center gap-2"
                  >
                    <Icons.Upload size={16} /> Compartir Prompt
                  </button>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-4">
                  <div className="relative flex-1 w-full">
                    <Icons.Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text"
                      value={communitySearch}
                      onChange={(e) => setCommunitySearch(e.target.value)}
                      placeholder="Buscar por título o prompt..."
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <span className="text-xs text-zinc-500 whitespace-nowrap">Ordenar por:</span>
                    <select 
                      value={communitySort}
                      onChange={(e) => setCommunitySort(e.target.value as any)}
                      className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer flex-1 md:flex-none"
                    >
                      <option value="newest">Más recientes</option>
                      <option value="popular">Más populares</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                  {communityFeed
                    .filter(post => {
                      const searchLower = communitySearch.toLowerCase();
                      return post.title.toLowerCase().includes(searchLower) || post.prompt.toLowerCase().includes(searchLower);
                    })
                    .sort((a, b) => {
                      if (communitySort === 'newest') return parseInt(b.id) - parseInt(a.id);
                      // Simulate popularity with id for now or random
                      return (b.title.length) - (a.title.length);
                    })
                    .map(post => (
                    <div 
                      key={post.id} 
                      className="bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden flex flex-col group hover:border-white/20 transition-all cursor-pointer"
                      onClick={() => setExpandedPost(post)}
                    >
                      <div className="h-40 bg-zinc-800 relative overflow-hidden">
                        <img src={post.image} alt={post.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent"></div>
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                          <h3 className="font-semibold text-white truncate">{post.title}</h3>
                        </div>
                      </div>
                      <div className="p-4 flex flex-col gap-3 flex-1">
                        <p className="text-xs text-zinc-400 font-mono line-clamp-3 flex-1">
                          {post.prompt}
                        </p>
                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser(post.user);
                              setShowUserProfileModal(true);
                            }}
                            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                              <Icons.User size={12} />
                            </div>
                            {post.user}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                              setCustomInstructions([post.prompt]);
                              setSelectedBlocks([]);
                              setWorkMode('prompting');
                            }}
                            className="text-zinc-500 hover:text-emerald-400 transition-colors" 
                            title="Llevar a Prompting"
                          >
                            <Icons.ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {workMode === 'alquimia' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Alquimia de Prompts</h2>
                    <p className="text-zinc-400 text-sm">Combina hasta 6 imágenes para generar prompts únicos y coherentes.</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAlquimiaHistory([])}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-2"
                    >
                      <Icons.Trash2 size={16} /> Limpiar Historial
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {alquimiaImages.map((img, idx) => (
                    <div key={idx} className="aspect-[3/4] bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden relative group flex flex-col items-center justify-center">
                      {img ? (
                        <>
                          <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => {
                                const newImages = [...alquimiaImages];
                                newImages[idx] = null;
                                setAlquimiaImages(newImages);
                              }}
                              className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-colors"
                            >
                              <Icons.X size={20} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <button 
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (re) => {
                                  const newImages = [...alquimiaImages];
                                  newImages[idx] = re.target?.result as string;
                                  setAlquimiaImages(newImages);
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                          className="flex flex-col items-center gap-2 text-zinc-600 hover:text-emerald-400 transition-colors"
                        >
                          <Icons.Upload size={24} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Subir</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleAlquimiaGenerate}
                  disabled={alquimiaLoading || alquimiaImages.every(img => img === null)}
                  className="w-full py-4 rounded-2xl font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {alquimiaLoading ? <Icons.Loader2 size={24} className="animate-spin" /> : <Icons.Zap size={24} />}
                  {alquimiaLoading ? 'ANALIZANDO Y TRANSMUTANDO...' : 'GENERAR ALQUIMIA'}
                </button>

                {alquimiaError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm flex items-center gap-3">
                    <Icons.AlertCircle size={18} />
                    {alquimiaError}
                  </div>
                )}

                {alquimiaPrompts.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Icons.Sparkles size={20} className="text-emerald-400" />
                      Resultados de la Transmutación
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {alquimiaPrompts.map((p, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className="bg-zinc-900 border border-white/5 rounded-2xl p-5 flex flex-col gap-3 group relative"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Variación {i + 1}</span>
                            <button 
                              onClick={() => handleCopyPrompt(p)}
                              className="p-2 text-zinc-500 hover:text-emerald-400 transition-colors"
                            >
                              <Icons.Copy size={16} />
                            </button>
                          </div>
                          <p className="text-sm text-zinc-300 leading-relaxed font-mono line-clamp-4 group-hover:line-clamp-none transition-all">
                            {p}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {alquimiaHistory.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-zinc-500 mb-4 flex items-center gap-2">
                      <Icons.History size={20} />
                      Historial de Alquimia
                    </h3>
                    <div className="space-y-4">
                      {alquimiaHistory.map((h, i) => (
                        <div key={i} className="bg-zinc-900/30 border border-white/5 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-zinc-600">{new Date(h.timestamp).toLocaleString()}</span>
                            <button 
                              onClick={() => setAlquimiaPrompts(h.prompts)}
                              className="text-xs text-emerald-500 hover:underline"
                            >
                              Restaurar este lote
                            </button>
                          </div>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                            {h.prompts.map((p, pi) => (
                              <div key={pi} className="min-w-[200px] bg-zinc-950 p-3 rounded-lg text-[10px] text-zinc-500 line-clamp-2">
                                {p}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {workMode === 'coworking' && (
            <div className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden">
              <div className="flex-1 flex overflow-hidden">
                {/* Topics Sidebar */}
                <div className="w-80 border-r border-white/5 bg-[#0F0F0F] flex flex-col">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <Icons.MessageSquare size={18} className="text-orange-400" />
                      Coworking
                    </h3>
                    <button 
                      onClick={() => setShowCreateTopicModal(true)}
                      className="p-2 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                    >
                      <Icons.Plus size={18} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {coworkingTopics.map(topic => (
                      <button
                        key={topic.id}
                        onClick={() => {
                          setActiveTopic(topic);
                          socket?.emit('join-topic', topic.id);
                        }}
                        className={`w-full p-3 rounded-xl text-left transition-all ${activeTopic?.id === topic.id ? 'bg-orange-500/20 border border-orange-500/30' : 'hover:bg-white/5 border border-transparent'}`}
                      >
                        <div className="font-bold text-white text-sm truncate">{topic.title}</div>
                        <div className="text-xs text-zinc-500 truncate">{topic.description}</div>
                      </button>
                    ))}
                    {coworkingTopics.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <Icons.MessageSquare size={48} className="text-zinc-700 mb-4" />
                        <p className="text-zinc-500 text-sm">No hay temas de coworking aún.</p>
                        <button 
                          onClick={() => setShowCreateTopicModal(true)}
                          className="mt-4 px-4 py-2 bg-orange-500 text-black rounded-lg text-sm font-bold hover:bg-orange-400 transition-colors"
                        >
                          Crear Primer Tema
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col bg-[#0A0A0A]">
                  {activeTopic ? (
                    <>
                      <div className="p-4 border-b border-white/5 bg-[#0F0F0F] flex items-center justify-between">
                        <div>
                          <h3 className="text-white font-bold">{activeTopic.title}</h3>
                          <p className="text-xs text-zinc-500">{activeTopic.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setShowInviteModal(true)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors flex items-center gap-2"
                          >
                            <Icons.UserPlus size={14} /> Invitar
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {coworkingMessages.filter(m => m.topicId === activeTopic.id).map((msg, idx) => (
                          <div key={idx} className={`flex flex-col ${msg.userId === currentUser?.uid ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold text-zinc-500">{msg.userName}#{msg.userHashtag}</span>
                            </div>
                            <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${msg.userId === currentUser?.uid ? 'bg-orange-500 text-black rounded-tr-none' : 'bg-zinc-800 text-white rounded-tl-none'}`}>
                              {msg.text}
                            </div>
                            <span className="text-[10px] text-zinc-600 mt-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 bg-[#0F0F0F] border-t border-white/5">
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!coworkingInput.trim() || !activeTopic || !socket || !currentUser) return;
                            const message = {
                              topicId: activeTopic.id,
                              userId: currentUser.uid,
                              userName: currentUser.displayName,
                              userHashtag: currentUser.hashtag,
                              text: coworkingInput,
                              timestamp: Date.now()
                            };
                            socket.emit('send-message', { topicId: activeTopic.id, message });
                            setCoworkingInput('');
                          }}
                          className="flex items-center gap-2"
                        >
                          <input 
                            type="text"
                            value={coworkingInput}
                            onChange={(e) => setCoworkingInput(e.target.value)}
                            placeholder="Escribe un mensaje..."
                            className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
                          />
                          <button 
                            type="submit"
                            className="p-2 rounded-xl bg-orange-500 text-black hover:bg-orange-400 transition-colors"
                          >
                            <Icons.Send size={20} />
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 mb-6">
                        <Icons.MessageSquare size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Bienvenido al Coworking</h3>
                      <p className="text-zinc-500 max-w-md">Selecciona un tema de la izquierda para empezar a colaborar con otros usuarios en tiempo real.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {workMode === 'admin' && currentUser?.isAdmin && (
            <div className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden">
              <div className="p-8 border-b border-white/10 flex items-center justify-between bg-[#0F0F0F]">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Icons.ShieldCheck size={28} className="text-emerald-400" />
                    Panel de Administración
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1">Gestiona usuarios, suscripciones y contenido de la plataforma.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-zinc-900 p-1 rounded-xl border border-white/5">
                    <button 
                      onClick={() => setAdminTab('users')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'users' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Usuarios
                    </button>
                    <button 
                      onClick={() => setAdminTab('news')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'news' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Noticias
                    </button>
                    <button 
                      onClick={() => setAdminTab('subs')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'subs' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Suscripciones
                    </button>
                    <button 
                      onClick={() => setAdminTab('content')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'content' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Contenido
                    </button>
                  </div>
                  <div className="bg-zinc-900 px-4 py-2 rounded-xl border border-white/5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Icons.Users size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase font-bold">Usuarios Totales</div>
                      <div className="text-lg font-bold text-white">{allUsers.length + 1}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <AnimatePresence mode="wait">
                  {adminTab === 'news' && (
                    <motion.div 
                      key="news"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Icons.Newspaper size={20} className="text-emerald-400" />
                          Noticias y Actualizaciones
                        </h3>
                        <button 
                          onClick={() => setShowNewsModal(true)}
                          className="text-xs bg-emerald-500 text-black px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-400 transition-colors"
                        >
                          Publicar Noticia
                        </button>
                      </div>
                      <div className="flex flex-col gap-4">
                        {news.map(item => (
                          <div key={item.id} className="bg-zinc-950 border border-white/10 rounded-xl p-4 group">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-bold text-white">{item.title}</h4>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, 'news', item.id));
                                  } catch (error) {
                                    handleFirestoreError(error, OperationType.DELETE, `news/${item.id}`);
                                  }
                                }} className="text-red-400 hover:text-red-300">
                                  <Icons.Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            <p className="text-sm text-zinc-400 leading-relaxed">{item.content}</p>
                            <div className="text-[10px] text-zinc-600 mt-3 font-mono">
                              {new Date(item.date).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {adminTab === 'users' && (
                    <motion.div 
                      key="users"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6"
                    >
                      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <Icons.UserCog size={20} className="text-emerald-400" />
                        Gestión de Usuarios
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-zinc-500 border-b border-white/10">
                              <th className="pb-3 font-medium">Usuario</th>
                              <th className="pb-3 font-medium">Estado</th>
                              <th className="pb-3 font-medium">Prompts</th>
                              <th className="pb-3 font-medium text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            <tr className="group">
                              <td className="py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-zinc-800" />
                                  <div>
                                    <div className="font-medium text-white">{currentUser?.email}</div>
                                    <div className="text-[10px] text-emerald-400 uppercase font-bold">Admin / Creador</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4">
                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">Activo</span>
                              </td>
                              <td className="py-4 text-zinc-400">∞</td>
                              <td className="py-4 text-right">
                                <span className="text-zinc-600 italic text-xs">Propietario</span>
                              </td>
                            </tr>
                            {/* Mock users for demonstration */}
                            {[1, 2, 3].map(i => (
                              <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                                <td className="py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-zinc-800" />
                                    <div>
                                      <div className="font-medium text-white">usuario_{i}@ejemplo.com</div>
                                      <div className="text-[10px] text-zinc-500 uppercase font-bold">Usuario Estándar</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4">
                                  <span className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-0.5 rounded-full">Gratis</span>
                                </td>
                                <td className="py-4 text-zinc-400">0/2</td>
                                <td className="py-4 text-right">
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Regalar Suscripción">
                                      <Icons.Gift size={16} />
                                    </button>
                                    <button className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Bloquear Usuario">
                                      <Icons.UserX size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}

                  {adminTab === 'subs' && (
                    <motion.div 
                      key="subs"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <Icons.CreditCard size={18} className="text-emerald-400" />
                          Tier Free
                        </h4>
                        <div className="text-3xl font-bold text-white mb-2">$0 <span className="text-sm text-zinc-500 font-normal">/mes</span></div>
                        <ul className="text-sm text-zinc-400 space-y-2 mb-6">
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> 10 prompts diarios</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> Acceso básico</li>
                          <li className="flex items-center gap-2"><Icons.X size={14} className="text-red-400" /> Sin Magic Enhance</li>
                        </ul>
                        <button className="w-full py-2 bg-zinc-800 text-white rounded-xl text-xs font-bold hover:bg-zinc-700 transition-colors">Configurar</button>
                      </div>
                      <div className="bg-zinc-900/50 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-emerald-500 text-black text-[10px] font-bold px-3 py-1 rounded-bl-xl">POPULAR</div>
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <Icons.Zap size={18} className="text-emerald-400" />
                          Tier Pro
                        </h4>
                        <div className="text-3xl font-bold text-white mb-2">$9.99 <span className="text-sm text-zinc-500 font-normal">/mes</span></div>
                        <ul className="text-sm text-zinc-400 space-y-2 mb-6">
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> 100 prompts diarios</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> Magic Enhance</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> Sin anuncios</li>
                        </ul>
                        <button className="w-full py-2 bg-emerald-500 text-black rounded-xl text-xs font-bold hover:bg-emerald-400 transition-colors">Configurar</button>
                      </div>
                      <div className="bg-zinc-900/50 border border-purple-500/30 rounded-2xl p-6">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <Icons.Crown size={18} className="text-purple-400" />
                          Tier Elite
                        </h4>
                        <div className="text-3xl font-bold text-white mb-2">$24.99 <span className="text-sm text-zinc-500 font-normal">/mes</span></div>
                        <ul className="text-sm text-zinc-400 space-y-2 mb-6">
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> Prompts ilimitados</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> Soporte prioritario</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> Acceso anticipado</li>
                        </ul>
                        <button className="w-full py-2 bg-purple-500 text-white rounded-xl text-xs font-bold hover:bg-purple-400 transition-colors">Configurar</button>
                      </div>
                    </motion.div>
                  )}

                  {adminTab === 'content' && (
                    <motion.div 
                      key="content"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6"
                    >
                      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <Icons.Image size={20} className="text-emerald-400" />
                        Moderación de Contenido
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                          <div key={i} className="aspect-square bg-zinc-950 rounded-xl border border-white/10 overflow-hidden relative group">
                            <img src={`https://picsum.photos/seed/content-${i}/300/300`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <button className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-colors">
                                <Icons.Trash2 size={18} />
                              </button>
                              <button className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition-colors">
                                <Icons.Check size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                      <Icons.Sliders size={20} className="text-emerald-400" />
                      Controles de Plataforma
                    </h3>
                    <div className="flex flex-col gap-4">
                      <div className="p-4 bg-zinc-950 border border-white/10 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">Mantenimiento Global</div>
                          <div className="text-xs text-zinc-500">Bloquea el acceso a todos los usuarios</div>
                        </div>
                        <button className="w-10 h-5 bg-zinc-800 rounded-full relative">
                          <div className="absolute top-1 left-1 w-3 h-3 bg-zinc-600 rounded-full" />
                        </button>
                      </div>
                      <div className="p-4 bg-zinc-950 border border-white/10 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">Nuevas Funciones (Spoilers)</div>
                          <div className="text-xs text-zinc-500">Muestra pestañas en construcción</div>
                        </div>
                        <button className="w-10 h-5 bg-emerald-500 rounded-full relative">
                          <div className="absolute top-1 right-1 w-3 h-3 bg-white rounded-full" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Icons.Info size={20} className="text-emerald-400" />
                      Estado del Sistema
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Versión App</span>
                        <span className="text-zinc-300">v2.4.0-beta</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Base de Datos</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Conectado (Firebase)
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">API Gemini</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Activa
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Copilot & Banned Words */}
        {(workMode === 'prompting' || workMode === 'influencer') && (
          <>
            {/* Mobile Backdrop */}
            <AnimatePresence>
              {showRightSidebar && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowRightSidebar(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] md:hidden"
                />
              )}
            </AnimatePresence>
            
            {/* Desktop Sidebar Placeholder (for layout expansion) */}
            <div className={`hidden md:block transition-all duration-300 shrink-0 relative ${showRightSidebar ? 'w-72' : 'w-0'}`} />

            <aside className={`${showRightSidebar ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 fixed md:absolute right-0 top-0 bottom-0 w-72 border-l border-white/10 bg-[#0F0F0F] flex flex-col shrink-0 z-[150] md:z-40 h-full shadow-2xl`}>
              {/* Toggle Handle (Desktop only) */}
              <button 
                onClick={() => setShowRightSidebar(!showRightSidebar)}
                className="hidden md:flex absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-6 h-14 bg-[#0F0F0F] border border-white/10 border-r-0 rounded-l-xl items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all group z-50"
                title={showRightSidebar ? "Contraer sugerencias" : "Mostrar sugerencias"}
              >
                {showRightSidebar ? <Icons.ChevronRight size={16} /> : <Icons.ChevronLeft size={16} />}
              </button>
              
              {/* Mobile Close Button */}
              <div className="md:hidden p-4 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Copiloto</span>
                <button onClick={() => setShowRightSidebar(false)} className="p-2 text-zinc-400 hover:text-white">
                  <Icons.X size={20} />
                </button>
              </div>
              
              {/* Banned Words Section */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-2">
                <Icons.ShieldAlert size={14} />
                Palabras Prohibidas
              </h2>
              <button 
                onClick={() => setIsBannedWordsLocked(!isBannedWordsLocked)}
                className={`p-1.5 rounded-md transition-colors ${isBannedWordsLocked ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-red-400 bg-red-400/10'}`}
              >
                {isBannedWordsLocked ? <Icons.Lock size={14} /> : <Icons.Unlock size={14} />}
              </button>
            </div>
            
            {!isBannedWordsLocked && (
              <form onSubmit={handleAddBannedWord} className="mb-3 flex gap-2">
                <input 
                  type="text"
                  value={bannedWordInput}
                  onChange={e => setBannedWordInput(e.target.value)}
                  placeholder="Ej: baby, infantil..."
                  className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-red-400/50"
                />
                <button type="submit" className="bg-zinc-800 text-zinc-300 px-2 rounded hover:bg-zinc-700">
                  <Icons.Plus size={14} />
                </button>
              </form>
            )}
            
            <div className="flex flex-wrap gap-1">
              {bannedWords.map(word => (
                <span key={word} className="bg-red-900/20 text-red-300/70 border border-red-900/30 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  {word}
                  {!isBannedWordsLocked && (
                    <button onClick={() => removeBannedWord(word)} className="hover:text-red-300">
                      <Icons.X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {bannedWords.length === 0 && isBannedWordsLocked && (
                <span className="text-zinc-600 text-xs italic">Ninguna palabra prohibida.</span>
              )}
            </div>
          </div>

          {/* Copilot Suggestions */}
          <div className="p-4 border-b border-white/10 flex items-center gap-2 text-emerald-400">
            <Icons.Lightbulb size={16} />
            <h2 className="text-sm font-medium">Sugerencias para tu Prompt</h2>
          </div>
          
          <div className="flex-1 p-4 pb-8 overflow-y-auto custom-scrollbar">
            {selectedBlocks.length === 0 && customInstructions.length === 0 ? (
              <div className="text-zinc-500 text-sm text-center mt-10">
                Construye tu escena para recibir sugerencias contextuales.
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sugerencias para tu escena</h3>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setSuggestionPage(p => Math.max(0, p - 1))}
                        disabled={suggestionPage === 0}
                        className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                      >
                        <Icons.ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] text-zinc-500 font-mono">{suggestionPage + 1}/{Math.max(1, totalSuggestionPages)}</span>
                      <button 
                        onClick={() => setSuggestionPage(p => Math.min(totalSuggestionPages - 1, p + 1))}
                        disabled={suggestionPage >= totalSuggestionPages - 1}
                        className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                      >
                        <Icons.ChevronRight size={14} />
                      </button>
                      <button 
                        onClick={handleRefreshSuggestions}
                        className="p-1 text-emerald-500 hover:text-emerald-400 transition-colors ml-1"
                      >
                        <Icons.RefreshCw size={12} />
                      </button>
                    </div>
                  </div>
                  {isSuggesting ? (
                    <div className="flex items-center justify-center py-8 text-zinc-500">
                      <Icons.Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : currentSuggestions.length > 0 ? (
                     <div className="flex flex-col gap-2">
                      <AnimatePresence mode="popLayout">
                        {currentSuggestions.map(block => (
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            key={block.id}
                          >
                            <button
                              onClick={() => toggleBlock(block)}
                              className="w-full text-left p-2 rounded-lg bg-zinc-900 border border-white/5 hover:border-emerald-500/30 hover:bg-zinc-800 transition-all group flex items-start justify-between"
                            >
                              <div>
                                <div className="text-[10px] text-emerald-400/80 mb-0.5">{ALL_CATEGORIES.find(c => c.id === block.categoryId)?.label}</div>
                                <div className="text-xs text-zinc-200">{block.label}</div>
                              </div>
                              <Icons.Plus size={14} className="text-zinc-500 group-hover:text-emerald-400 mt-1" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="text-zinc-500 text-sm">No hay nuevas sugerencias por ahora.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          </aside>
        </>
      )}
      </main>

      {/* History Modal */}
      {/* Save History Modal */}
      <AnimatePresence>
        {showSaveHistoryModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Save size={20} className="text-emerald-400" />
                  Guardar en Biblioteca
                </h2>
                <button onClick={() => setShowSaveHistoryModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-zinc-300">Título del Prompt</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={saveHistoryTitle}
                      onChange={e => setSaveHistoryTitle(e.target.value)}
                      placeholder="Ej. Retrato Cyberpunk Neón"
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                      autoFocus
                    />
                    <button 
                      onClick={generateHistoryTitle}
                      disabled={isGeneratingHistoryTitle}
                      className="px-3 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
                      title="Generar título con IA"
                    >
                      {isGeneratingHistoryTitle ? <Icons.Loader2 size={18} className="animate-spin" /> : <Icons.Wand2 size={18} />}
                    </button>
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3">
                  <p className="text-xs text-zinc-500 font-mono line-clamp-3">{compiledPrompt}</p>
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowSaveHistoryModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmSaveHistory}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#0A0A0A]">
                <div className="flex items-center gap-4 flex-1 w-full">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2 whitespace-nowrap">
                    <Icons.BookMarked size={20} className="text-emerald-400" />
                    Mi Biblioteca
                  </h2>
                  <div className="relative flex-1 max-w-md">
                    <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text"
                      value={blockSearch} // Reuse blockSearch for history search
                      onChange={(e) => setBlockSearch(e.target.value)}
                      placeholder="Buscar en biblioteca..."
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => setShowRecycleBin(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-red-500/20 text-red-400 text-xs rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    <Icons.Trash2 size={14} />
                    Papelera
                  </button>
                  <select 
                    value={historySort}
                    onChange={(e) => setHistorySort(e.target.value as any)}
                    className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer flex-1 md:flex-none"
                  >
                    <option value="date">Fecha</option>
                    <option value="title">Título</option>
                  </select>
                  <button onClick={() => setShowHistory(false)} className="text-zinc-400 hover:text-white p-1">
                    <Icons.X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4">
                {promptHistory.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-zinc-500">
                    No has guardado ningún prompt todavía.
                  </div>
                ) : (
                  promptHistory
                    .filter(session => {
                      const searchLower = blockSearch.toLowerCase();
                      return (session.title || '').toLowerCase().includes(searchLower) || session.compiledPrompt.toLowerCase().includes(searchLower);
                    })
                    .sort((a, b) => {
                      if (historySort === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
                      return (a.title || '').localeCompare(b.title || '');
                    })
                    .map(session => (
                    <div key={session.id} className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex flex-col gap-3 group relative">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {editingHistoryId === session.id ? (
                            <input 
                              type="text"
                              value={editingHistoryTitle}
                              onChange={e => setEditingHistoryTitle(e.target.value)}
                              onBlur={() => renameHistoryItem(session.id, editingHistoryTitle)}
                              onKeyDown={e => e.key === 'Enter' && renameHistoryItem(session.id, editingHistoryTitle)}
                              className="w-full bg-zinc-950 border border-emerald-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <h3 
                              className="text-sm font-medium text-white truncate cursor-pointer hover:text-emerald-400 transition-colors"
                              onClick={() => {
                                setEditingHistoryId(session.id);
                                setEditingHistoryTitle(session.title || '');
                              }}
                              title="Click para renombrar"
                            >
                              {session.title || 'Prompt sin título'}
                            </h3>
                          )}
                          <span className="text-[10px] text-zinc-500 block mt-0.5">{new Date(session.date).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button 
                            onClick={() => {
                              setShareTitle(session.title || '');
                              setSharePrompt(session.compiledPrompt);
                              setShowShareModal(true);
                            }}
                            className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors"
                            title="Compartir en Comunidad"
                          >
                            <Icons.Share2 size={14} />
                          </button>
                          <button 
                            onClick={() => toggleFavorite(session.id)}
                            className={`p-1 ${session.isFavorite ? 'text-yellow-400' : 'text-zinc-500 hover:text-yellow-400/50'} transition-colors`}
                          >
                            <Icons.Star size={14} fill={session.isFavorite ? "currentColor" : "none"} />
                          </button>
                          <button 
                            onClick={() => deleteHistoryItem(session.id)}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Eliminar"
                          >
                            <Icons.Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-300 font-mono line-clamp-3 leading-relaxed bg-zinc-950/50 p-2 rounded-lg border border-white/5">
                        {session.compiledPrompt}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-auto pt-2">
                        {session.selectedBlocks.slice(0, 3).map(b => (
                          <span key={b.id} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            {b.label}
                          </span>
                        ))}
                        {session.selectedBlocks.length > 3 && (
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            +{session.selectedBlocks.length - 3} más
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => loadSession(session)}
                          className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Icons.RefreshCw size={12} /> Reutilizar
                        </button>
                        <button 
                          onClick={() => handleCopyPrompt(session.compiledPrompt)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                        >
                          <Icons.Copy size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NSFW Warning Modal */}
      <AnimatePresence>
        {showNsfwWarning && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-red-500/30 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-red-500/20 bg-red-500/5 flex items-center gap-3">
                <Icons.AlertTriangle className="text-red-400" size={24} />
                <h2 className="text-lg font-semibold text-white">Contenido Sensible</h2>
              </div>
              <div className="p-6 text-zinc-300 text-sm leading-relaxed">
                <p className="mb-4">
                  Estás intentando añadir un bloque que contiene material explícito o sensible (NSFW).
                </p>
                <p>
                  Para poder utilizar estos bloques, necesitas habilitar el interruptor <strong>"NSFW Permitido"</strong> en la parte superior del área de trabajo.
                </p>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowNsfwWarning(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Entendido
                </button>
                <button 
                  onClick={() => {
                    setIsNsfwEnabled(true);
                    setShowNsfwWarning(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 transition-colors"
                >
                  Habilitar NSFW
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ver Más Modal */}
      <AnimatePresence>
        {showMoreCategory && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#0A0A0A]">
                <div className="flex items-center gap-4 flex-1 w-full">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2 whitespace-nowrap">
                    <div className={getCategoryColor(showMoreCategory)}>{renderIcon(ALL_CATEGORIES.find(c => c.id === showMoreCategory)?.icon || '')}</div>
                    {ALL_CATEGORIES.find(c => c.id === showMoreCategory)?.label}
                  </h2>
                  <div className="relative flex-1 max-w-md">
                    <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text"
                      value={blockSearch}
                      onChange={(e) => setBlockSearch(e.target.value)}
                      placeholder="Buscar subcategoría..."
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>
                <button onClick={() => setShowMoreCategory(null)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="flex flex-wrap gap-3">
                  {activeBlocks.filter(b => {
                    const matchesCategory = b.categoryId === showMoreCategory;
                    const searchLower = blockSearch.toLowerCase();
                    return matchesCategory && (b.label.toLowerCase().includes(searchLower) || b.value.toLowerCase().includes(searchLower));
                  })
                    .sort((a, b) => {
                      const aFav = favoriteBlocks.includes(a.id);
                      const bFav = favoriteBlocks.includes(b.id);
                      if (aFav && !bFav) return -1;
                      if (!aFav && bFav) return 1;
                      return 0;
                    })
                    .map(block => {
                    const isSelected = selectedBlocks.some(b => b.id === block.id);
                    const isFav = favoriteBlocks.includes(block.id);
                    return (
                      <div key={block.id} className="relative group">
                        <button
                          onClick={() => toggleBlock(block)}
                          onMouseEnter={() => setHoveredBlock(block.id)}
                          onMouseLeave={() => setHoveredBlock(null)}
                          className={`px-4 py-2 rounded-xl text-sm border transition-all text-left flex items-center gap-2 group ${
                            isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                          }`}
                        >
                          <div 
                            onClick={(e) => toggleFavoriteBlock(block.id, e)}
                            className={`p-1 rounded-full transition-colors ${isFav ? 'text-red-400' : 'text-zinc-600 hover:text-red-400/50'}`}
                          >
                            <Icons.Heart size={14} fill={isFav ? "currentColor" : "none"} />
                          </div>
                          {block.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison Modal */}
      <AnimatePresence>
        {showComparisonModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.GitMerge size={20} className="text-emerald-400" />
                  Integrar Recreación
                </h2>
                <button onClick={() => setShowComparisonModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-zinc-400">Prompt Actual (Prompting)</h3>
                    <div className="bg-zinc-900 border border-white/5 rounded-xl p-4 text-sm text-zinc-300 min-h-[150px]">
                      {compiledPrompt || <span className="text-zinc-600 italic">No hay prompt actual...</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-emerald-400">Prompt Extraído (Recreación)</h3>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-300 min-h-[150px]">
                      {extractedPrompt}
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4">Opciones de Integración</h3>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        const newBlock: Block = {
                          id: `recreation-${Date.now()}`,
                          categoryId: 'custom',
                          label: 'Recreación de Imagen',
                          value: extractedPrompt || '',
                          isCustom: true
                        };
                        setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                        setSelectedBlocks(prev => [...prev, newBlock]);
                        setShowComparisonModal(false);
                        setWorkMode('prompting');
                      }}
                      className="w-full text-left p-4 rounded-xl border border-white/5 bg-zinc-800 hover:bg-zinc-700 hover:border-white/20 transition-all flex items-start gap-4 group"
                    >
                      <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400 group-hover:text-white transition-colors">
                        <Icons.Plus size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-white mb-1">Añadir (Combinar)</div>
                        <div className="text-xs text-zinc-400">Agrega el prompt extraído como un nuevo bloque en la Estructura de la Escena. La IA lo mezclará con tu prompt actual.</div>
                      </div>
                    </button>

                    <button 
                      onClick={() => {
                        const newBlock: Block = {
                          id: `recreation-${Date.now()}`,
                          categoryId: 'custom',
                          label: 'Detalles de Recreación',
                          value: `Detalles secundarios de imagen: ${extractedPrompt}`,
                          isCustom: true
                        };
                        setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                        setSelectedBlocks(prev => [...prev, newBlock]);
                        setCustomInstructions(prev => [...prev, `Prioriza mi prompt actual, pero añade detalles que no entren en conflicto del bloque de Detalles de Recreación.`]);
                        setShowComparisonModal(false);
                        setWorkMode('prompting');
                      }}
                      className="w-full text-left p-4 rounded-xl border border-white/5 bg-zinc-800 hover:bg-zinc-700 hover:border-white/20 transition-all flex items-start gap-4 group"
                    >
                      <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400 group-hover:text-white transition-colors">
                        <Icons.Shield size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-white mb-1">Usar parámetros de Prompt Final</div>
                        <div className="text-xs text-zinc-400">Agrega la imagen como bloque secundario. Mantiene tu estructura actual y solo añade detalles que no contradigan lo que ya elegiste.</div>
                      </div>
                    </button>

                    <button 
                      onClick={() => {
                        const newBlock: Block = {
                          id: `recreation-${Date.now()}`,
                          categoryId: 'custom',
                          label: 'Recreación Exacta',
                          value: extractedPrompt || '',
                          isCustom: true
                        };
                        setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                        setSelectedBlocks([newBlock]);
                        setCustomInstructions([`Recrea esta imagen exactamente basándote en el bloque de Recreación Exacta.`]);
                        setShowComparisonModal(false);
                        setWorkMode('prompting');
                      }}
                      className="w-full text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-start gap-4 group"
                    >
                      <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 group-hover:text-emerald-300 transition-colors">
                        <Icons.Image size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-400 mb-1">Usar parámetros de la Recreación</div>
                        <div className="text-xs text-emerald-500/70">Reemplaza tu estructura actual completamente con un único bloque que contiene la descripción de la imagen subida.</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clean Modal */}
      <AnimatePresence>
        {showCleanModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Eraser size={20} className="text-emerald-400" />
                  Limpiar Prompt
                </h2>
                <button onClick={() => setShowCleanModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">Selecciona los elementos que deseas remover del prompt extraído:</p>
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'tattoos', label: 'Tatuajes' },
                    { id: 'piercings', label: 'Piercings' },
                    { id: 'hair', label: 'Detalles del cabello (color, estilo)' },
                    { id: 'facial', label: 'Rasgos faciales específicos' },
                    { id: 'clothing', label: 'Ropa específica' },
                    { id: 'background', label: 'Fondo / Entorno' }
                  ].map(option => (
                    <label key={option.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800 cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={cleanOptions.includes(option.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCleanOptions(prev => [...prev, option.id]);
                          } else {
                            setCleanOptions(prev => prev.filter(id => id !== option.id));
                          }
                        }}
                        className="w-4 h-4 rounded border-white/20 bg-black/50 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0"
                      />
                      <span className="text-sm text-zinc-300">{option.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <button 
                    onClick={() => {
                      if (cleanOptions.length === 6) {
                        setCleanOptions([]);
                      } else {
                        setCleanOptions(['tattoos', 'piercings', 'hair', 'facial', 'clothing', 'background']);
                      }
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {cleanOptions.length === 6 ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                  </button>
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowCleanModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => {
                    if (!originalRecreationPrompt) {
                      setOriginalRecreationPrompt(extractedPrompt);
                    }
                    
                    setIsCleaningPrompt(true);
                    try {
                      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
                      const response = await ai.models.generateContent({
                        model: 'gemini-3.1-flash-preview',
                        contents: `Limpia el siguiente prompt de imagen eliminando cualquier mención a los siguientes elementos: ${cleanOptions.join(', ')}.
                        
                        Prompt original: "${extractedPrompt}"
                        
                        Devuelve SOLO el prompt limpio en el mismo idioma que el original, sin introducciones ni explicaciones. Asegúrate de que la gramática siga siendo correcta después de eliminar los elementos.`,
                      });
                      
                      setExtractedPrompt(response.text || extractedPrompt);
                    } catch (error) {
                      console.error("Error cleaning prompt:", error);
                      // Fallback to basic string replacement if AI fails
                      let newPrompt = extractedPrompt;
                      if (cleanOptions.includes('tattoos')) newPrompt = newPrompt?.replace(/tattoos?,|tattooed,/gi, '') || null;
                      if (cleanOptions.includes('piercings')) newPrompt = newPrompt?.replace(/piercings?,|pierced,/gi, '') || null;
                      setExtractedPrompt(newPrompt);
                    } finally {
                      setIsCleaningPrompt(false);
                      setShowCleanModal(false);
                      setCleanOptions([]);
                    }
                  }}
                  disabled={cleanOptions.length === 0 || isCleaningPrompt}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors flex items-center gap-2"
                >
                  {isCleaningPrompt ? <Icons.Loader2 size={16} className="animate-spin" /> : null}
                  {isCleaningPrompt ? 'Limpiando...' : 'Limpiar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Upload size={20} className="text-emerald-400" />
                  Compartir Prompt
                </h2>
                <button onClick={() => setShowShareModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-400">Título del Prompt:</label>
                  <input 
                    type="text" 
                    value={shareTitle}
                    onChange={(e) => setShareTitle(e.target.value)}
                    placeholder="Ej: Retrato Cyberpunk Neón"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-400">Prompt (Inglés):</label>
                  <textarea 
                    value={sharePrompt}
                    onChange={(e) => setSharePrompt(e.target.value)}
                    placeholder="El prompt que deseas compartir..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 min-h-[100px] resize-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-400">URL de Imagen de Ejemplo (Opcional):</label>
                  <input 
                    type="text" 
                    value={shareImage}
                    onChange={(e) => setShareImage(e.target.value)}
                    placeholder="https://ejemplo.com/imagen.jpg"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (shareTitle && sharePrompt) {
                      setCommunityFeed([{
                        id: Date.now().toString(),
                        title: shareTitle,
                        prompt: sharePrompt,
                        user: 'Tú',
                        image: shareImage || `https://picsum.photos/seed/${shareTitle.replace(/\s+/g, '')}/100/100`
                      }, ...communityFeed]);
                      setShowShareModal(false);
                      setShareTitle('');
                      setSharePrompt('');
                      setShareImage('');
                    }
                  }}
                  disabled={!shareTitle || !sharePrompt}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors"
                >
                  Publicar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Post Modal */}
      <AnimatePresence>
        {expandedPost && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setExpandedPost(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="md:w-1/2 bg-black relative">
                <img src={expandedPost.image} alt={expandedPost.title} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                <button 
                  onClick={() => setExpandedPost(null)} 
                  className="absolute top-4 left-4 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 p-2 rounded-full backdrop-blur-md transition-all md:hidden"
                >
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="md:w-1/2 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">{expandedPost.title}</h2>
                    <button 
                      onClick={() => {
                        setExpandedPost(null);
                        setSelectedUser(expandedPost.user);
                        setShowUserProfileModal(true);
                      }}
                      className="flex items-center gap-2 text-sm text-zinc-400 hover:text-emerald-400 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                        <Icons.User size={12} />
                      </div>
                      {expandedPost.user}
                    </button>
                  </div>
                  <button onClick={() => setExpandedPost(null)} className="text-zinc-400 hover:text-white p-1 hidden md:block">
                    <Icons.X size={24} />
                  </button>
                </div>
                
                <div className="flex-1 flex flex-col gap-4 mt-4">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                      <Icons.Terminal size={16} className="text-emerald-400" />
                      Prompt
                    </h3>
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 text-sm text-zinc-300 font-mono leading-relaxed">
                      {expandedPost.prompt}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3 pt-4 border-t border-white/10">
                  <button 
                    onClick={() => handleCopyPrompt(expandedPost.prompt)}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Icons.Copy size={18} /> Copiar Prompt
                  </button>
                  <button 
                    onClick={() => {
                      setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                      setCustomInstructions([expandedPost.prompt]);
                      setSelectedBlocks([]);
                      setWorkMode('prompting');
                      setExpandedPost(null);
                    }}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <Icons.Wand2 size={18} /> Usar Prompt
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Profile Modal */}
      <AnimatePresence>
        {showUserProfileModal && selectedUser && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-3xl flex flex-col overflow-hidden shadow-2xl max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-2xl text-emerald-400 font-bold">
                    {selectedUser.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{selectedUser}</h2>
                    <p className="text-sm text-zinc-400">Libro de Prompts</p>
                  </div>
                </div>
                <button onClick={() => setShowUserProfileModal(false)} className="text-zinc-400 hover:text-white p-2">
                  <Icons.X size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {communityFeed.filter(post => post.user === selectedUser).map(post => (
                    <div key={post.id} className="bg-zinc-900 border border-white/5 rounded-xl overflow-hidden flex flex-col">
                      <div className="h-32 bg-zinc-800 relative overflow-hidden">
                        <img src={post.image} alt={post.title} className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent"></div>
                        <div className="absolute bottom-2 left-2 right-2">
                          <h3 className="font-semibold text-white text-sm truncate">{post.title}</h3>
                        </div>
                      </div>
                      <div className="p-3 flex flex-col gap-2 flex-1">
                        <p className="text-xs text-zinc-400 font-mono line-clamp-2 flex-1">
                          {post.prompt}
                        </p>
                        <div className="flex justify-end pt-2 border-t border-white/5">
                          <button 
                            onClick={() => {
                              setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                              setCustomInstructions([post.prompt]);
                              setSelectedBlocks([]);
                              setShowUserProfileModal(false);
                              setWorkMode('prompting');
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                          >
                            <Icons.ArrowRight size={14} /> Usar Prompt
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {communityFeed.filter(post => post.user === selectedUser).length === 0 && (
                    <div className="col-span-full py-8 text-center text-zinc-500">
                      Este usuario aún no ha compartido prompts.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coworking Create Topic Modal */}
      <AnimatePresence>
        {showCreateTopicModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.PlusCircle size={20} className="text-orange-400" />
                  Crear Nuevo Tema
                </h2>
                <button onClick={() => setShowCreateTopicModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Título del Tema</label>
                  <input 
                    type="text" 
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    placeholder="Ej: Proyecto Futurista, Sesión de Lluvia..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Descripción</label>
                  <textarea 
                    value={newTopicDescription}
                    onChange={(e) => setNewTopicDescription(e.target.value)}
                    placeholder="Breve descripción de lo que se discutirá..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all resize-none h-24"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowCreateTopicModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (!newTopicTitle.trim() || !socket || !currentUser) return;
                    const topic = {
                      id: Date.now().toString(),
                      title: newTopicTitle,
                      description: newTopicDescription,
                      createdBy: currentUser.uid,
                      members: [currentUser.uid],
                      timestamp: Date.now()
                    };
                    socket.emit('create-topic', topic);
                    setShowCreateTopicModal(false);
                    setNewTopicTitle('');
                    setNewTopicDescription('');
                  }}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-orange-500 text-black hover:bg-orange-400 transition-colors shadow-lg shadow-orange-500/20"
                >
                  Crear Tema
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coworking Invite Modal */}
      <AnimatePresence>
        {showNewsModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Newspaper size={20} className="text-emerald-400" />
                  Publicar Noticia
                </h2>
                <button onClick={() => setShowNewsModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Título</label>
                  <input 
                    type="text" 
                    value={newNewsTitle}
                    onChange={(e) => setNewNewsTitle(e.target.value)}
                    placeholder="Título de la noticia..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Contenido</label>
                  <textarea 
                    value={newNewsContent}
                    onChange={(e) => setNewNewsContent(e.target.value)}
                    placeholder="Escribe el contenido aquí..."
                    rows={4}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowNewsModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => {
                    if (newNewsTitle && newNewsContent && currentUser) {
                      const newNewsItem: NewsItem = {
                        id: Date.now().toString(),
                        title: newNewsTitle,
                        content: newNewsContent,
                        date: Date.now(),
                        type: 'update',
                        authorId: currentUser.uid,
                        isPublished: true
                      };
                      try {
                        await setDoc(doc(db, 'news', newNewsItem.id), newNewsItem);
                        setShowNewsModal(false);
                        setNewNewsTitle('');
                        setNewNewsContent('');
                      } catch (error) {
                        handleFirestoreError(error, OperationType.CREATE, `news/${newNewsItem.id}`);
                      }
                    }
                  }}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  Publicar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInviteModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.UserPlus size={20} className="text-orange-400" />
                  Invitar al Tema
                </h2>
                <button onClick={() => setShowInviteModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">Ingresa el correo electrónico o el usuario único (Nombre#1234) para invitar.</p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Correo o Usuario#Hashtag</label>
                  <input 
                    type="text" 
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder="Ej: usuario@gmail.com o Nombre#1234"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all"
                    autoFocus
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleInviteUser(inviteInput)}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-orange-500 text-black hover:bg-orange-400 transition-colors shadow-lg shadow-orange-500/20"
                >
                  Enviar Invitación
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Bust Size Modal */}
      <AnimatePresence>
        {showBustModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.User size={20} className="text-rose-400" />
                  Medida de Busto
                </h2>
                <button onClick={() => setShowBustModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">Especifica la medida del busto o "Bra Cup" para mayor consistencia en el cuerpo.</p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Bra Cup / Medida</label>
                  <input 
                    type="text" 
                    value={bustSize}
                    onChange={(e) => setBustSize(e.target.value)}
                    placeholder="Ej: 34C, Large, DD cup..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-rose-500/50 transition-all"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && confirmBustSize()}
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowBustModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmBustSize}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-rose-500 text-white hover:bg-rose-400 transition-colors shadow-lg shadow-rose-500/20"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smartphone Modal */}
      <AnimatePresence>
        {showSmartphoneModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Smartphone size={20} className="text-emerald-400" />
                  Detalles del Celular
                </h2>
                <button onClick={() => setShowSmartphoneModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">¿Qué modelo de celular o smartphone te gustaría que aparezca en el prompt?</p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Modelo / Marca</label>
                  <input 
                    type="text" 
                    value={smartphoneModel}
                    onChange={(e) => setSmartphoneModel(e.target.value)}
                    placeholder="Ej: iPhone 15 Pro Max, Samsung S24 Ultra..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && confirmSmartphoneModel()}
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowSmartphoneModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmSmartphoneModel}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

        {showRecycleBin && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400">
                    <Icons.Trash2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Papelera de Reciclaje</h3>
                    <p className="text-xs text-zinc-500">Recupera prompts eliminados accidentalmente.</p>
                  </div>
                </div>
                <button onClick={() => setShowRecycleBin(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {deletedPrompts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                    <Icons.Trash2 size={48} className="mb-4 opacity-20" />
                    <p>La papelera está vacía</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {deletedPrompts.map(session => (
                      <div key={session.id} className="bg-zinc-950 border border-white/5 rounded-2xl p-4 group">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-white text-sm">{session.title || 'Prompt sin título'}</h4>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={async () => {
                                try {
                                  await setDoc(doc(db, 'prompts', session.id), session);
                                  setDeletedPrompts(prev => prev.filter(p => p.id !== session.id));
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.CREATE, `prompts/${session.id}`);
                                }
                              }}
                              className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Restaurar"
                            >
                              <Icons.RotateCcw size={16} />
                            </button>
                            <button 
                              onClick={() => setDeletedPrompts(prev => prev.filter(p => p.id !== session.id))}
                              className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Eliminar permanentemente"
                            >
                              <Icons.Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-2 font-mono bg-black/30 p-2 rounded-lg">
                          {session.compiledPrompt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {deletedPrompts.length > 0 && (
                <div className="p-4 border-t border-white/10 bg-zinc-900/50 flex justify-end">
                  <button 
                    onClick={() => {
                      if (confirm('¿Estás seguro de que quieres vaciar la papelera? Esta acción no se puede deshacer.')) {
                        setDeletedPrompts([]);
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 font-bold px-4 py-2"
                  >
                    Vaciar Papelera
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showSessionHistory && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Icons.History size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Historial de Sesión</h3>
                    <p className="text-xs text-zinc-500">Prompts generados en esta sesión. Se borrarán al cerrar la app.</p>
                  </div>
                </div>
                <button onClick={() => setShowSessionHistory(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {sessionHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                    <Icons.History size={48} className="mb-4 opacity-20" />
                    <p>No hay historial en esta sesión todavía</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {sessionHistory.map((entry, idx) => (
                      <div key={idx} className="bg-zinc-950 border border-white/5 rounded-2xl p-4 group hover:border-emerald-500/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                                setCompiledPrompt(entry.prompt);
                                setIsEditingPrompt(true);
                                setShowSessionHistory(false);
                              }}
                              className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Restaurar este prompt"
                            >
                              <Icons.RotateCcw size={16} />
                            </button>
                            <button 
                              onClick={() => handleCopyPrompt(entry.prompt)}
                              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                              title="Copiar"
                            >
                              <Icons.Copy size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-3 font-mono bg-black/30 p-3 rounded-xl border border-white/5">
                          {entry.prompt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-white/10 bg-zinc-900/50 flex justify-end">
                <button 
                  onClick={() => setSessionHistory([])}
                  className="text-xs text-red-400 hover:text-red-300 font-bold px-4 py-2"
                >
                  Limpiar Historial de Sesión
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSaveStyleModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Icons.Bookmark size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Guardar Estilo</h3>
                    <p className="text-xs text-zinc-500">Guarda este prompt como un estilo reutilizable</p>
                  </div>
                </div>
                <button onClick={() => setShowSaveStyleModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Nombre del Estilo</label>
                  <input 
                    type="text" 
                    value={styleName}
                    onChange={(e) => setStyleName(e.target.value)}
                    placeholder="Ej: Cyberpunk Neon, Retrato Realista..."
                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    autoFocus
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">¿Qué deseas guardar de esta recreación?</p>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => handleSaveStyle(styleName, 'full')}
                      className="p-4 bg-zinc-950 border border-white/5 rounded-2xl hover:border-emerald-500/30 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">Todo en General</span>
                        <Icons.Layers size={16} className="text-zinc-600" />
                      </div>
                      <p className="text-[10px] text-zinc-500">Guarda el prompt completo como un estilo base.</p>
                    </button>
                    
                    <button 
                      onClick={() => handleSaveStyle(styleName, 'partial')}
                      className="p-4 bg-zinc-950 border border-white/5 rounded-2xl hover:border-emerald-500/30 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">Algo Específico</span>
                        <Icons.Target size={16} className="text-zinc-600" />
                      </div>
                      <p className="text-[10px] text-zinc-500">Guarda solo los elementos clave (luces, atmósfera, técnica).</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-zinc-950/50 flex justify-end gap-3">
                <button 
                  onClick={() => setShowSaveStyleModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col my-auto max-h-[95vh]"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Icons.Settings size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">Configuración</h3>
                    <p className="text-[10px] text-zinc-500">Personaliza tu experiencia en SceneCraft AI</p>
                  </div>
                </div>
                <button onClick={() => setShowSettings(false)} className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
                {/* Account Settings */}
                <div className="flex items-center justify-between border-b border-white/10 pb-5">
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {currentUser ? `Hola, ${currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuario'}` : 'Cuenta'}
                    </h4>
                    <p className="text-[10px] text-zinc-500">
                      {currentUser ? `Conectado como ${currentUser.email}` : 'Inicia sesión para guardar tu progreso'}
                    </p>
                  </div>
                  <div>
                    {currentUser && (
                      <button 
                        onClick={handleLogout}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-[10px] font-bold transition-colors"
                      >
                        Cerrar Sesión
                      </button>
                    )}
                  </div>
                </div>

                {/* Theme Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Tema Visual</h4>
                    <p className="text-xs text-zinc-500">Cambia entre modo oscuro y claro</p>
                  </div>
                  <div className="flex bg-zinc-950 p-1 rounded-lg border border-white/5">
                    <button 
                      onClick={() => setTheme('dark')}
                      className={`px-3 py-1.5 rounded-md text-xs transition-all ${theme === 'dark' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                    >
                      Oscuro
                    </button>
                    <button 
                      onClick={() => setTheme('light')}
                      className={`px-3 py-1.5 rounded-md text-xs transition-all ${theme === 'light' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                    >
                      Claro
                    </button>
                  </div>
                </div>

                {/* NSFW Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Contenido NSFW</h4>
                    <p className="text-xs text-zinc-500">Permitir bloques y términos explícitos</p>
                  </div>
                  <button 
                    onClick={() => setIsNsfwEnabled(!isNsfwEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isNsfwEnabled ? 'bg-red-500' : 'bg-zinc-700'}`}
                  >
                    <motion.div 
                      animate={{ left: isNsfwEnabled ? 26 : 2 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg" 
                    />
                  </button>
                </div>

                {/* Language Selection */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Idioma de la Interfaz</h4>
                    <p className="text-xs text-zinc-500">Cambia el idioma de la aplicación</p>
                  </div>
                  <select 
                    value={language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      setLanguage(newLang);
                      localStorage.setItem('scenecraft_language', newLang);
                    }}
                    className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Idioma del Prompt</h4>
                    <p className="text-xs text-zinc-500">Idioma de salida para los prompts generados</p>
                  </div>
                  <select 
                    value={outputLanguage}
                    onChange={(e) => setOutputLanguage(e.target.value as 'es' | 'en')}
                    className="bg-zinc-950 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs text-emerald-400 focus:outline-none"
                  >
                    <option value="en">Inglés (EN)</option>
                    <option value="es">Español (ES)</option>
                  </select>
                </div>

                {/* Manual Generation Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Generación Manual</h4>
                    <p className="text-xs text-zinc-500">Activa la edición manual del prompt final</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newValue = !isManualGeneration;
                      setIsManualGeneration(newValue);
                      localStorage.setItem('scenecraft_manual_gen', JSON.stringify(newValue));
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isManualGeneration ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <motion.div 
                      animate={{ left: isManualGeneration ? 26 : 2 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg" 
                    />
                  </button>
                </div>

                {/* UI Style */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Estilo de Interfaz</h4>
                    <p className="text-xs text-zinc-500">Diseños preestablecidos para la plataforma</p>
                  </div>
                  <select 
                    value={uiStyle}
                    onChange={(e) => setUiStyle(e.target.value as any)}
                    className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="modern">Moderno (Default)</option>
                    <option value="glass">Glassmorphism</option>
                    <option value="brutalist">Brutalista</option>
                  </select>
                </div>

                {/* Color Theme */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Color de Acento</h4>
                    <p className="text-xs text-zinc-500">Color principal de la interfaz</p>
                  </div>
                  <select 
                    value={colorTheme}
                    onChange={(e) => setColorTheme(e.target.value as any)}
                    className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="emerald">Esmeralda (Default)</option>
                    <option value="blue">Azul</option>
                    <option value="purple">Púrpura</option>
                    <option value="rose">Rosa</option>
                    <option value="amber">Ámbar</option>
                  </select>
                </div>

                {/* Account Actions */}
                <div className="pt-3 border-t border-white/5 flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      setShowSettings(false);
                    }}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    Guardar y Aplicar
                  </button>
                  {!currentUser && (
                    <button 
                      onClick={handleLogin}
                      className="w-full py-2.5 bg-white hover:bg-zinc-200 text-black text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Iniciar Sesión con Google
                    </button>
                  )}
                </div>

                {/* Tutorial */}
                <div className="pt-4 border-t border-white/5">
                  <button 
                    onClick={() => {
                      setShowTutorial(true);
                      setShowSettings(false);
                    }}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Icons.HelpCircle size={16} /> Reiniciar Tutorial Guiado
                  </button>
                </div>
              </div>

              <div className="p-4 bg-zinc-950/50 text-center">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">SceneCraft AI v2.5 - 2026</p>
              </div>
            </motion.div>
          </div>
        )}

      {/* Expanded Scene Structure Modal */}
      <AnimatePresence>
        {isSceneStructureExpanded && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-4 md:p-10"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-3xl w-full max-w-5xl h-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Icons.Layers size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Estructura de la Escena</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Gestión Detallada de Bloques</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSceneStructureExpanded(false)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
                >
                  <Icons.X size={24} />
                </button>
              </div>

              <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                {selectedBlocks.length === 0 && customInstructions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
                    <Icons.Layers size={48} className="opacity-20" />
                    <p className="italic">No hay elementos en la escena actual.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedBlocks.map(block => {
                      const cat = ALL_CATEGORIES.find(c => c.id === block.categoryId);
                      return (
                        <motion.div 
                          layout
                          key={block.id}
                          className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-all"
                        >
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${cat?.color || 'text-zinc-500'}`}>
                              {cat?.label || 'Custom'}
                            </span>
                            <span className="text-sm text-white font-medium">{block.label}</span>
                          </div>
                          <button 
                            onClick={() => toggleBlock(block)}
                            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          >
                            <Icons.Trash2 size={18} />
                          </button>
                        </motion.div>
                      );
                    })}
                    {customInstructions.map((inst, idx) => (
                      <motion.div 
                        layout
                        key={`expanded_inst_${idx}`}
                        className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-all"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-tighter text-emerald-400">
                            Instrucción Chat
                          </span>
                          <span className="text-sm text-white font-medium line-clamp-2">{inst}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              const newInst = window.prompt('Editar instrucción:', inst);
                              if (newInst !== null && newInst.trim() !== '') {
                                setCustomInstructions(prev => prev.map((item, i) => i === idx ? newInst.trim() : item));
                              }
                            }}
                            className="p-2 text-zinc-600 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                          >
                            <Icons.Edit3 size={18} />
                          </button>
                          <button 
                            onClick={() => removeCustomInstruction(idx)}
                            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          >
                            <Icons.Trash2 size={18} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-[#0A0A0A] border-t border-white/10 flex items-center justify-between">
                <div className="text-sm text-zinc-500">
                  <span className="text-emerald-400 font-bold">{selectedBlocks.length + customInstructions.length}</span> elementos activos
                </div>
                <button 
                  onClick={() => {
                    setSelectedBlocks([]);
                    setCustomInstructions([]);
                    setIsSceneStructureExpanded(false);
                  }}
                  className="px-6 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl border border-red-500/20 transition-all"
                >
                  Limpiar Escena
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}} />
      {/* Copy Toast */}
      <AnimatePresence>
        {copyToast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-4 py-2 rounded-full font-medium text-sm shadow-lg shadow-emerald-500/20 z-[200] flex items-center gap-2"
          >
            <Icons.Check size={16} />
            {copyToast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

